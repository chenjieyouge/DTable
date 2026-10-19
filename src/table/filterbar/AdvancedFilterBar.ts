/**
 * 高级筛选条件条 (对标 ag-grid Advanced Filter Builder 的平铺版)
 *
 * - 平铺在工具条与表格之间, 可展开/收起
 * - 每行: 字段 + 操作符 + 值(区间为两个) + 移除
 * - 全局 AND/OR 分段
 * - 值输入 300ms 防抖后实时生效; 字段/操作符变化即时生效
 * - 零依赖, 纯 DOM
 */
import type {
  IColumn,
  AdvancedFilterModel,
  IJoinAdvancedFilter,
  AdvancedFilterJoin,
} from '@/types'
import {
  inferColumnKind,
  getOperators,
  isRangeOperator,
} from '@/table/interaction/advancedFilter'
import type { AdvancedKind } from '@/table/interaction/advancedFilter'

interface RowState {
  colId: string
  kind: AdvancedKind
  op: string
  value: string
  valueTo: string
}

export interface AdvancedFilterBarCallbacks {
  /** 应用条件模型 */
  onApply: (model: IJoinAdvancedFilter) => void
}

export class AdvancedFilterBar {
  public el: HTMLDivElement
  private columns: IColumn[]
  private callbacks: AdvancedFilterBarCallbacks
  private joinType: AdvancedFilterJoin = 'AND'
  private rows: RowState[] = []
  private rowsContainer: HTMLDivElement
  private debounceTimer: number | null = null

  constructor(columns: IColumn[], callbacks: AdvancedFilterBarCallbacks) {
    this.columns = columns
    this.callbacks = callbacks
    this.el = document.createElement('div')
    this.el.className = 'vt-advanced-filter-bar'
    this.el.style.display = 'none'
    this.rowsContainer = document.createElement('div')
    this.rowsContainer.className = 'vt-af-rows'
    this.el.appendChild(this.buildHeader())
    this.el.appendChild(this.rowsContainer)
  }

  /** 可筛选的列 (有 filter 配置) */
  private filterableColumns(): IColumn[] {
    return this.columns.filter(c => c.filter)
  }

  private buildHeader(): HTMLDivElement {
    const header = document.createElement('div')
    header.className = 'vt-af-header'

    const title = document.createElement('span')
    title.className = 'vt-af-title'
    title.textContent = '高级筛选'
    header.appendChild(title)

    // AND / OR 分段
    const seg = document.createElement('div')
    seg.className = 'vt-af-segment'
    seg.appendChild(this.segBtn('AND', '满足全部'))
    seg.appendChild(this.segBtn('OR', '满足任一'))
    header.appendChild(seg)

    const spacer = document.createElement('div')
    spacer.style.flex = '1'
    header.appendChild(spacer)

    // 添加条件
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'vt-af-add'
    addBtn.textContent = '+ 添加条件'
    addBtn.addEventListener('click', () => this.addCondition())
    header.appendChild(addBtn)

    // 清空
    const clearBtn = document.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'vt-af-clear'
    clearBtn.textContent = '清空'
    clearBtn.addEventListener('click', () => this.clear())
    header.appendChild(clearBtn)

    return header
  }

  private segBtn(value: AdvancedFilterJoin, label: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'vt-af-seg-btn' + (this.joinType === value ? ' active' : '')
    btn.textContent = label
    btn.dataset.value = value
    btn.addEventListener('click', () => {
      if (this.joinType === value) return
      this.joinType = value
      // 更新分段高亮
      const seg = btn.parentElement
      if (seg) {
        seg.querySelectorAll('.vt-af-seg-btn').forEach(b => {
          b.classList.toggle('active', (b as HTMLElement).dataset.value === value)
        })
      }
      this.emitNow()
    })
    return btn
  }

  /** 添加一条条件 (默认第一列) */
  public addCondition(presetColId?: string): void {
    const cols = this.filterableColumns()
    if (cols.length === 0) return
    const colId = presetColId ?? cols[0].key
    const col = this.columns.find(c => c.key === colId)!
    const kind = inferColumnKind(col)
    const op = getOperators(kind)[0].value
    this.rows.push({ colId, kind, op, value: '', valueTo: '' })
    this.renderRows()
    this.emitNow()
  }

  private removeRow(index: number): void {
    this.rows.splice(index, 1)
    this.renderRows()
    this.emitNow()
  }

  private clear(): void {
    this.rows = []
    this.renderRows()
    this.emitNow()
  }

  /** 重新渲染所有条件行 */
  private renderRows(): void {
    this.rowsContainer.replaceChildren()
    this.rows.forEach((rs, i) => {
      this.rowsContainer.appendChild(this.renderRow(rs, i))
    })
  }

  private renderRow(rs: RowState, index: number): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-af-row'

    // 字段
    const field = document.createElement('select')
    field.className = 'vt-af-field'
    this.filterableColumns().forEach(c => {
      const opt = document.createElement('option')
      opt.value = c.key
      opt.textContent = c.title ?? c.key
      if (c.key === rs.colId) opt.selected = true
      field.appendChild(opt)
    })
    field.addEventListener('change', () => {
      const col = this.columns.find(c => c.key === field.value)!
      rs.colId = col.key
      rs.kind = inferColumnKind(col)
      rs.op = getOperators(rs.kind)[0].value
      rs.value = ''
      rs.valueTo = ''
      this.renderRows()
      this.emitNow()
    })
    row.appendChild(field)

    // 操作符
    const opSel = document.createElement('select')
    opSel.className = 'vt-af-operator'
    getOperators(rs.kind).forEach(o => {
      const opt = document.createElement('option')
      opt.value = o.value
      opt.textContent = o.label
      if (o.value === rs.op) opt.selected = true
      opSel.appendChild(opt)
    })
    opSel.addEventListener('change', () => {
      rs.op = opSel.value
      const wasRange = isRangeOperator(rs.kind, rs.op)
      // 切换区间时清理无关值
      if (!wasRange) rs.valueTo = ''
      this.renderRows()
      this.emitNow()
    })
    row.appendChild(opSel)

    // 值
    const valuesWrap = document.createElement('div')
    valuesWrap.className = 'vt-af-values'
    const inputType = rs.kind === 'number' ? 'number' : rs.kind === 'date' ? 'date' : 'text'
    valuesWrap.appendChild(this.valueInput(rs, inputType, false))
    if (isRangeOperator(rs.kind, rs.op)) {
      const sep = document.createElement('span')
      sep.className = 'vt-af-to-sep'
      sep.textContent = '至'
      valuesWrap.appendChild(sep)
      valuesWrap.appendChild(this.valueInput(rs, inputType, true))
    }
    row.appendChild(valuesWrap)

    // 移除
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'vt-af-remove'
    remove.textContent = '×'
    remove.title = '移除条件'
    remove.addEventListener('click', () => this.removeRow(index))
    row.appendChild(remove)

    return row
  }

  private valueInput(rs: RowState, type: string, isTo: boolean): HTMLInputElement {
    const input = document.createElement('input')
    input.type = type
    input.className = 'vt-af-value'
    input.value = isTo ? rs.valueTo : rs.value
    input.placeholder = isTo ? '结束值' : '值'
    input.addEventListener('input', () => {
      if (isTo) rs.valueTo = input.value
      else rs.value = input.value
      this.scheduleEmit()
    })
    // Enter 立即应用
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.emitNow()
    })
    return input
  }

  /** 构造条件模型 */
  public buildModel(): IJoinAdvancedFilter {
    const conditions: AdvancedFilterModel[] = []
    for (const rs of this.rows) {
      if (!rs.colId) continue
      if (rs.kind === 'text') {
        conditions.push({
          filterType: 'text', colId: rs.colId, type: rs.op as any,
          filter: rs.value || undefined,
        })
      } else if (rs.kind === 'number') {
        const f = rs.value === '' ? undefined : Number(rs.value)
        const t = rs.valueTo === '' ? undefined : Number(rs.valueTo)
        conditions.push({
          filterType: 'number', colId: rs.colId, type: rs.op as any,
          filter: f, filterTo: t,
        })
      } {
        if (rs.kind === 'date') {
          conditions.push({
            filterType: 'date', colId: rs.colId, type: rs.op as any,
            filter: rs.value || undefined, filterTo: rs.valueTo || undefined,
          })
        }
      }
    }
    return { filterType: 'join', type: this.joinType, conditions }
  }

  private scheduleEmit(): void {
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    this.debounceTimer = window.setTimeout(() => this.emitNow(), 300)
  }

  private emitNow(): void {
    if (this.debounceTimer) {
      window.clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.callbacks.onApply(this.buildModel())
  }

  /** 外部设置模型 (恢复/重置) */
  public setModel(model?: AdvancedFilterModel | null): void {
    const join: IJoinAdvancedFilter =
      model && model.filterType === 'join'
        ? model
        : { filterType: 'join', type: 'AND', conditions: model ? [model] : [] }
    this.joinType = join.type
    this.rows = join.conditions
      .filter(c => c.filterType !== 'join')
      .map(c => {
        const leaf = c as any
        const col = this.columns.find(x => x.key === leaf.colId)
        const kind = col ? inferColumnKind(col) : (leaf.filterType as AdvancedKind)
        return {
          colId: leaf.colId,
          kind,
          op: leaf.type,
          value: leaf.filter !== undefined && leaf.filter !== null ? String(leaf.filter) : '',
          valueTo: leaf.filterTo !== undefined && leaf.filterTo !== null ? String(leaf.filterTo) : '',
        }
      })
    this.renderRows()
    // 刷新分段高亮
    this.el.querySelectorAll('.vt-af-seg-btn').forEach(b => {
      b.classList.toggle('active', (b as HTMLElement).dataset.value === this.joinType)
    })
  }

  public getModel(): IJoinAdvancedFilter {
    return this.buildModel()
  }

  public setColumns(columns: IColumn[]): void {
    this.columns = columns
    this.renderRows()
  }

  /** 展开/收起 */
  public toggle(open?: boolean): boolean {
    const next = open ?? this.el.style.display === 'none'
    this.el.style.display = next ? 'block' : 'none'
    return next
  }

  public isOpen(): boolean {
    return this.el.style.display !== 'none'
  }

  /** 当前条件条数 */
  public getConditionCount(): number {
    return this.rows.length
  }

  public destroy(): void {
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    this.el.remove()
  }
}
