/**
 * 高级筛选构建器 (对标 ag-grid 企业版 Advanced Filter Builder)
 *
 * - 平铺在工具条与表格之间, 可展开/收起
 * - 树形结构: 根分组下可放叶子条件, 也可嵌套分组
 * - 每个分组独立 AND/OR 分段, 支持 "+ 条件" / "+ 分组"
 * - 叶子: 字段 + 操作符 + 值(区间为两个) + 移除
 * - 值输入 300ms 防抖后实时生效; 字段/操作符/分组变化即时生效
 * - 数据模型直接产出树形 join; 零依赖, 纯 DOM
 */
import type {
  IColumn,
  AdvancedFilterModel,
  IJoinAdvancedFilter,
  ITextAdvancedFilter,
  INumberAdvancedFilter,
  IDateAdvancedFilter,
  AdvancedFilterJoin,
} from '@/types'
import {
  inferColumnKind,
  getOperators,
  isRangeOperator,
} from '@/table/interaction/advancedFilter'
import type { AdvancedKind } from '@/table/interaction/advancedFilter'

// ---- UI 树 ----
interface GroupNode {
  nodeType: 'group'
  join: AdvancedFilterJoin
  children: FilterNode[]
}
interface LeafNode {
  nodeType: 'leaf'
  colId: string
  kind: AdvancedKind
  op: string
  value: string
  valueTo: string
}
type FilterNode = GroupNode | LeafNode

export interface AdvancedFilterBarCallbacks {
  /** 应用条件模型 */
  onApply: (model: IJoinAdvancedFilter) => void
}

export class AdvancedFilterBar {
  public el: HTMLDivElement
  private columns: IColumn[]
  private callbacks: AdvancedFilterBarCallbacks
  private root: GroupNode
  private treeContainer: HTMLDivElement
  private debounceTimer: number | null = null

  constructor(columns: IColumn[], callbacks: AdvancedFilterBarCallbacks) {
    this.columns = columns
    this.callbacks = callbacks
    this.root = { nodeType: 'group', join: 'AND', children: [] }
    this.el = document.createElement('div')
    this.el.className = 'vt-advanced-filter-bar'
    this.el.style.display = 'none'
    this.treeContainer = document.createElement('div')
    this.treeContainer.className = 'vt-af-tree'
    this.el.appendChild(this.buildChromeHeader())
    this.el.appendChild(this.treeContainer)
    this.renderTree()
  }

  /** 可筛选的列 (有 filter 配置) */
  private filterableColumns(): IColumn[] {
    return this.columns.filter(c => c.filter)
  }

  /** 顶部固定行: 标题 + 清空 */
  private buildChromeHeader(): HTMLDivElement {
    const header = document.createElement('div')
    header.className = 'vt-af-header'

    const title = document.createElement('span')
    title.className = 'vt-af-title'
    title.textContent = '高级筛选'
    header.appendChild(title)

    const spacer = document.createElement('div')
    spacer.style.flex = '1'
    header.appendChild(spacer)

    const clearBtn = document.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'vt-af-clear'
    clearBtn.textContent = '清空'
    clearBtn.addEventListener('click', () => this.clear())
    header.appendChild(clearBtn)

    return header
  }

  // =====================================================
  // 树节点工厂
  // =====================================================

  private makeLeaf(colId?: string): LeafNode | null {
    const cols = this.filterableColumns()
    if (cols.length === 0) return null
    const id = colId ?? cols[0].key
    const col = this.columns.find(c => c.key === id)!
    const kind = inferColumnKind(col)
    return {
      nodeType: 'leaf',
      colId: id,
      kind,
      op: getOperators(kind)[0].value,
      value: '',
      valueTo: '',
    }
  }

  private makeGroup(): GroupNode {
    return { nodeType: 'group', join: 'AND', children: [] }
  }

  // =====================================================
  // 渲染
  // =====================================================

  /** 从模型重建整棵树 */
  private renderTree(): void {
    this.treeContainer.replaceChildren()
    this.treeContainer.appendChild(this.renderGroup(this.root, true))
  }

  private renderGroup(node: GroupNode, isRoot: boolean): HTMLDivElement {
    const box = document.createElement('div')
    box.className = 'vt-af-group' + (isRoot ? ' vt-af-group--root' : ' vt-af-group--nested')

    // 组头: AND/OR 分段 (+ 非根分组可移除)
    const groupHeader = document.createElement('div')
    groupHeader.className = 'vt-af-group-header'

    const seg = document.createElement('div')
    seg.className = 'vt-af-segment'
    seg.appendChild(this.groupSegBtn(node, 'AND', '满足全部'))
    seg.appendChild(this.groupSegBtn(node, 'OR', '满足任一'))
    groupHeader.appendChild(seg)

    if (!isRoot) {
      const rm = document.createElement('button')
      rm.type = 'button'
      rm.className = 'vt-af-group-remove'
      rm.title = '移除分组'
      rm.textContent = '×'
      rm.addEventListener('click', () => {
        this.removeNode(node)
        this.emitNow()
      })
      groupHeader.appendChild(rm)
    }
    box.appendChild(groupHeader)

    // 子节点
    const childrenWrap = document.createElement('div')
    childrenWrap.className = 'vt-af-group-children'
    if (node.children.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'vt-af-group-empty'
      empty.textContent = '暂无条件, 添加一个条件或分组'
      childrenWrap.appendChild(empty)
    }
    node.children.forEach(child => {
      if (child.nodeType === 'leaf') {
        childrenWrap.appendChild(this.renderLeaf(child))
      } else {
        childrenWrap.appendChild(this.renderGroup(child, false))
      }
    })
    box.appendChild(childrenWrap)

    // 组尾: 添加条件 / 添加分组
    const footer = document.createElement('div')
    footer.className = 'vt-af-group-footer'
    const addCond = document.createElement('button')
    addCond.type = 'button'
    addCond.className = 'vt-af-add'
    addCond.textContent = '+ 条件'
    addCond.addEventListener('click', () => {
      const leaf = this.makeLeaf()
      if (leaf) {
        node.children.push(leaf)
        this.renderTree()
        this.emitNow()
      }
    })
    footer.appendChild(addCond)

    const addGroup = document.createElement('button')
    addGroup.type = 'button'
    addGroup.className = 'vt-af-add-group'
    addGroup.textContent = '+ 分组'
    addGroup.addEventListener('click', () => {
      const g = this.makeGroup()
      // 新分组默认带一条空条件, 避免又是空组
      const leaf = this.makeLeaf()
      if (leaf) g.children.push(leaf)
      node.children.push(g)
      this.renderTree()
      this.emitNow()
    })
    footer.appendChild(addGroup)
    box.appendChild(footer)

    return box
  }

  private groupSegBtn(node: GroupNode, value: AdvancedFilterJoin, label: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'vt-af-seg-btn' + (node.join === value ? ' active' : '')
    btn.textContent = label
    btn.dataset.value = value
    btn.addEventListener('click', () => {
      if (node.join === value) return
      node.join = value
      this.renderTree()
      this.emitNow()
    })
    return btn
  }

  private renderLeaf(node: LeafNode): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-af-row'

    // 字段
    const field = document.createElement('select')
    field.className = 'vt-af-field'
    this.filterableColumns().forEach(c => {
      const opt = document.createElement('option')
      opt.value = c.key
      opt.textContent = c.title ?? c.key
      if (c.key === node.colId) opt.selected = true
      field.appendChild(opt)
    })
    field.addEventListener('change', () => {
      const col = this.columns.find(c => c.key === field.value)!
      node.colId = col.key
      node.kind = inferColumnKind(col)
      node.op = getOperators(node.kind)[0].value
      node.value = ''
      node.valueTo = ''
      this.renderTree()
      this.emitNow()
    })
    row.appendChild(field)

    // 操作符
    const opSel = document.createElement('select')
    opSel.className = 'vt-af-operator'
    getOperators(node.kind).forEach(o => {
      const opt = document.createElement('option')
      opt.value = o.value
      opt.textContent = o.label
      if (o.value === node.op) opt.selected = true
      opSel.appendChild(opt)
    })
    opSel.addEventListener('change', () => {
      node.op = opSel.value
      if (!isRangeOperator(node.kind, node.op)) node.valueTo = ''
      this.renderTree()
      this.emitNow()
    })
    row.appendChild(opSel)

    // 值
    const valuesWrap = document.createElement('div')
    valuesWrap.className = 'vt-af-values'
    const inputType = node.kind === 'number' ? 'number' : node.kind === 'date' ? 'date' : 'text'
    valuesWrap.appendChild(this.valueInput(node, inputType, false))
    if (isRangeOperator(node.kind, node.op)) {
      const sep = document.createElement('span')
      sep.className = 'vt-af-to-sep'
      sep.textContent = '至'
      valuesWrap.appendChild(sep)
      valuesWrap.appendChild(this.valueInput(node, inputType, true))
    }
    row.appendChild(valuesWrap)

    // 移除
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'vt-af-remove'
    remove.textContent = '×'
    remove.title = '移除条件'
    remove.addEventListener('click', () => {
      this.removeNode(node)
      this.emitNow()
    })
    row.appendChild(remove)

    return row
  }

  private valueInput(node: LeafNode, type: string, isTo: boolean): HTMLInputElement {
    const input = document.createElement('input')
    input.type = type
    input.className = 'vt-af-value'
    input.value = isTo ? node.valueTo : node.value
    input.placeholder = isTo ? '结束值' : '值'
    input.addEventListener('input', () => {
      if (isTo) node.valueTo = input.value
      else node.value = input.value
      this.scheduleEmit()
    })
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.emitNow()
    })
    return input
  }

  // =====================================================
  // 树操作
  // =====================================================

  /** 在树中查找并删除指定节点 */
  private removeNode(target: FilterNode): void {
    const walk = (parent: GroupNode): boolean => {
      const idx = parent.children.indexOf(target)
      if (idx >= 0) {
        parent.children.splice(idx, 1)
        return true
      }
      return parent.children.some(c => c.nodeType === 'group' && walk(c))
    }
    walk(this.root)
    this.renderTree()
  }

  /** 递归统计叶子条件数 */
  private countLeaves(node: FilterNode = this.root): number {
    if (node.nodeType === 'leaf') return 1
    return node.children.reduce((sum, c) => sum + this.countLeaves(c), 0)
  }

  // =====================================================
  // 模型互转
  // =====================================================

  private nodeToModel(node: FilterNode): AdvancedFilterModel {
    if (node.nodeType === 'group') {
      return {
        filterType: 'join',
        type: node.join,
        conditions: node.children.map(c => this.nodeToModel(c)),
      }
    }
    const l = node
    if (l.kind === 'text') {
      const m: ITextAdvancedFilter = {
        filterType: 'text', colId: l.colId, type: l.op as any,
        filter: l.value || undefined,
      }
      return m
    }
    if (l.kind === 'number') {
      const m: INumberAdvancedFilter = {
        filterType: 'number', colId: l.colId, type: l.op as any,
        filter: l.value === '' ? undefined : Number(l.value),
        filterTo: l.valueTo === '' ? undefined : Number(l.valueTo),
      }
      return m
    }
    const m: IDateAdvancedFilter = {
      filterType: 'date', colId: l.colId, type: l.op as any,
      filter: l.value || undefined,
      filterTo: l.valueTo || undefined,
    }
    return m
  }

  /** 构造条件模型 */
  public buildModel(): IJoinAdvancedFilter {
    const m = this.nodeToModel(this.root) as IJoinAdvancedFilter
    return m
  }

  /** 模型转 UI 树节点 */
  private modelToNode(model: AdvancedFilterModel): FilterNode {
    if (model.filterType === 'join') {
      return {
        nodeType: 'group',
        join: model.type,
        children: model.conditions.map(c => this.modelToNode(c)),
      }
    }
    const leaf = model as any
    const col = this.columns.find(x => x.key === leaf.colId)
    const kind: AdvancedKind = col ? inferColumnKind(col) : (leaf.filterType as AdvancedKind)
    return {
      nodeType: 'leaf',
      colId: leaf.colId,
      kind,
      op: leaf.type,
      value: leaf.filter !== undefined && leaf.filter !== null ? String(leaf.filter) : '',
      valueTo: leaf.filterTo !== undefined && leaf.filterTo !== null ? String(leaf.filterTo) : '',
    }
  }

  // =====================================================
  // 对外 API
  // =====================================================

  /** 添加一条条件到根分组 (首次展开用) */
  public addCondition(presetColId?: string): void {
    const leaf = this.makeLeaf(presetColId)
    if (leaf) {
      this.root.children.push(leaf)
      this.renderTree()
      this.emitNow()
    }
  }

  private clear(): void {
    this.root = { nodeType: 'group', join: this.root.join, children: [] }
    this.renderTree()
    this.emitNow()
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
    const joinModel: IJoinAdvancedFilter =
      model && model.filterType === 'join'
        ? model
        : { filterType: 'join', type: 'AND', conditions: model ? [model] : [] }
    this.root = this.modelToNode(joinModel) as GroupNode
    this.renderTree()
  }

  public getModel(): IJoinAdvancedFilter {
    return this.buildModel()
  }

  public setColumns(columns: IColumn[]): void {
    this.columns = columns
    this.renderTree()
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

  /** 当前条件(叶子)条数 */
  public getConditionCount(): number {
    return this.countLeaves()
  }

  public destroy(): void {
    if (this.debounceTimer) window.clearTimeout(this.debounceTimer)
    this.el.remove()
  }
}
