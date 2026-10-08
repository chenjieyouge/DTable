import type { DataStrategy } from "@/table/data/DataStrategy";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { VirtualScroller } from "@/scroll/VirtualScroller";
import { ColumnVirtualizer } from "@/scroll/ColumnVirtualizer";
import { IConfig, IPageInfo } from "@/types";
import { calculatePageRange } from "@/utils/pageUtils";
import type { RowSelectionManager } from "@/table/interaction/RowSelectionManager";

/** 行节点池: 滚动离开视口的行不销毁, 回收入池复用 */
class RowPool {
  private pool: HTMLDivElement[] = []
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  acquire(
    renderer: DOMRenderer,
    rowIndex: number,
    isSelected: boolean,
    rowHeight: number
  ): HTMLDivElement {
    const row = this.pool.pop()
    if (row) {
      row.dataset.rowIndex = String(rowIndex)
      row.classList.remove('vt-skeleton', 'vt-row-selected', 'vt-row-group')
      if (isSelected) row.classList.add('vt-row-selected')
      renderer.setRowHeight(row, rowHeight)
      return row
    }
    return renderer.createRow(rowIndex, isSelected)
  }

  release(renderer: DOMRenderer, row: HTMLDivElement): void {
    // 清理行内数据内容 (结构保留: checkbox/冻结列/scroll-body)
    renderer.destroyRowRenderers(row)
    row.classList.remove('vt-row-selected', 'vt-row-group', 'vt-skeleton')
    const cells = row.querySelectorAll<HTMLDivElement>('.vt-table-cell:not(.vt-checkbox-cell)')
    cells.forEach((cell) => {
      cell.innerHTML = ''
      cell.classList.remove('vt-skeleton', 'vt-cell-editing', 'vt-cell-merged', 'vt-group-cell')
      cell.style.height = ''
      cell.style.width = ''
      cell.style.paddingLeft = ''
      cell.removeAttribute('data-colspan')
      cell.removeAttribute('data-rowspan')
    })
    const scrollBody = row.querySelector<HTMLDivElement>('.vt-scroll-body')
    if (scrollBody) {
      scrollBody.innerHTML = ''
      scrollBody.style.transform = ''
    }
    // cellsMap 只保留冻结列键 (常驻 DOM), 滚动列键全部清除, 避免复用行残留 detached cell
    const cellsMap = this.getCellsMap(row)
    const frozen = renderer.getFrozenCount()
    for (const [key, cell] of cellsMap) {
      const colIdx = renderer.getColumnIndex(key)
      if (colIdx < 0 || colIdx >= frozen) {
        renderer.destroyCellRenderer(cell)
        cellsMap.delete(key)
      }
    }
    // 超出池上限直接丢弃
    if (this.pool.length >= this.maxSize) {
      row.remove()
      return
    }
    // 从当前 DOM 摘除 (acquire 时会重新 appendChild 挂载), 再进池复用
    row.remove()
    this.pool.push(row)
  }

  clear(): void {
    this.pool.length = 0
  }

  /** 行元素上挂的 cellsMap (与 DOMRenderer 同键) */
  private getCellsMap(rowEl: HTMLDivElement): Map<string, HTMLDivElement> {
    const key = '__vtCells'
    let m = (rowEl as any)[key] as Map<string, HTMLDivElement> | undefined
    if (!m) {
      m = new Map()
      ;(rowEl as any)[key] = m
    }
    return m
  }
}

/** rowSpan 合并计划 (每次渲染周期计算) */
interface RowSpanPlan {
  /** 被上方 rowSpan 覆盖、本行要跳过的列下标集合 */
  skipCols: Set<number>
  /** 本行某列的 rowSpan 单元格需要撑到的高度 (colIndex -> px) */
  spanHeights: Map<number, number>
  /** 本行某列向右合并的跨度 (colIndex -> {span, width}) */
  colSpans: Map<number, { span: number; width: number }>
}

const MAX_ROWSPAN_SCAN = 200 // rowSpan 向上回溯上限 (行)

export class VirtualViewport {
  private config: IConfig
  private dataStrategy: DataStrategy
  private renderer: DOMRenderer
  private scroller: VirtualScroller
  private colVirtualizer: ColumnVirtualizer

  private scrollContainer: HTMLDivElement
  private virtualContent: HTMLDivElement
  private onPageChange?: (pageInfo: IPageInfo) => void
  private selectionManager?: RowSelectionManager
  private headerRow?: HTMLDivElement
  private onCheckboxClick?: (rowIndex: number) => void
  private onSelectAllClick?: () => void
  private onGroupToggle?: (rowIndex: number) => void

  private visibleRows = new Set<number>() // 当前可见行下标集合
  private rowElementMap = new Map<number, HTMLDivElement>() // 行下标 -> 行 DOM 映射
  private pool: RowPool

  private lastColStart = -1
  private lastColEnd = -1
  private rowSpanPlans = new Map<number, RowSpanPlan>() // rowIndex -> 合并计划

  // 内联编辑状态
  private editing: { rowIndex: number; colKey: string; cell: HTMLDivElement } | null = null
  private editingCleanup: (() => void) | null = null

  constructor(params: {
    config: IConfig;
    dataStrategy: DataStrategy,
    renderer: DOMRenderer;
    scroller: VirtualScroller;
    scrollContainer: HTMLDivElement
    virtualContent: HTMLDivElement
    onPageChange?: (pageInfo: IPageInfo) => void // 可选回调
    selectionManager?: RowSelectionManager
    headerRow?: HTMLDivElement
    onCheckboxClick?: (rowIndex: number) => void
    onSelectAllClick?: () => void
    onGroupToggle?: (rowIndex: number) => void
  }) {
    this.config = params.config;
    this.dataStrategy = params.dataStrategy;
    this.renderer = params.renderer;
    this.scroller = params.scroller;
    this.scrollContainer = params.scrollContainer
    this.virtualContent = params.virtualContent
    this.onPageChange = params.onPageChange
    this.selectionManager = params.selectionManager
    this.headerRow = params.headerRow
    this.onCheckboxClick = params.onCheckboxClick
    this.onSelectAllClick = params.onSelectAllClick
    this.onGroupToggle = params.onGroupToggle

    // 行池上限: 2x 可见行量 (按视口估算)
    const estVisible = Math.ceil((this.config.tableHeight as number || 500) / 36) + 40
    this.pool = new RowPool(Math.max(40, estVisible * 2))

    this.colVirtualizer = new ColumnVirtualizer(
      this.config.columns,
      this.config.frozenColumns,
      this.config.bufferCols ?? 2
    )

    if (params.selectionManager) {
      this.bindSelectionEvents()
    }
    if (this.config.onRowClick || this.config.onCellClick) {
      this.bindRowClickEvents()
    }
    this.bindCellEvents()
  }

  // 允许在外部 totalRows 变化后, 替换 scroller
  public setScroller(scroller: VirtualScroller) {
    this.scroller = scroller
  }

  /** 列配置/冻结列变化后重建列虚拟化 */
  public rebuildColumnVirtualizer(): void {
    this.colVirtualizer = new ColumnVirtualizer(
      this.config.columns,
      this.config.frozenColumns,
      this.config.bufferCols ?? 2
    )
    this.lastColStart = -1
    this.lastColEnd = -1
  }

  /** mount 完成后注入 selectionManager */
  public setSelectionManager(
    manager: RowSelectionManager,
    headerRow: HTMLDivElement,
    onCheckboxClick: (rowIndex: number) => void,
    onSelectAllClick: () => void
  ): void {
    this.selectionManager = manager
    this.headerRow = headerRow
    this.onCheckboxClick = onCheckboxClick
    this.onSelectAllClick = onSelectAllClick
    this.bindSelectionEvents()
  }

  /** 绑定行点击 / 单元格点击事件委托 */
  private bindRowClickEvents(): void {
    this.scrollContainer.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.vt-checkbox-cell')) return

      const rowEl = target.closest<HTMLDivElement>('.vt-virtual-row')
      if (!rowEl) return

      const rowIndex = parseInt(rowEl.dataset.rowIndex ?? '-1', 10)
      if (rowIndex < 0) return

      const rowData = this.dataStrategy.getRow(rowIndex)
      if (!rowData) return

      if (this.config.onCellClick) {
        const cellEl = target.closest<HTMLDivElement>('.vt-table-cell')
        if (cellEl?.dataset.columnKey) {
          const key = cellEl.dataset.columnKey
          this.config.onCellClick(rowData[key], key, rowData, rowIndex, e)
        }
      }

      this.config.onRowClick?.(rowData, rowIndex, e)
    })
  }

  /** 绑定 checkbox 事件委托 (只绑一次) */
  private bindSelectionEvents(): void {
    this.scrollContainer.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const cb = target.closest<HTMLInputElement>('input.vt-checkbox')
      if (!cb) return
      e.stopPropagation()
      if (cb.dataset.selectAll) {
        this.onSelectAllClick?.()
      } else {
        const idx = parseInt(cb.dataset.rowIndex ?? '-1', 10)
        if (idx >= 0) this.onCheckboxClick?.(idx)
      }
    })
  }

  /** 单元格级事件: 双击编辑 + 组头折叠 */
  private bindCellEvents(): void {
    this.scrollContainer.addEventListener('dblclick', (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const rowEl = target.closest<HTMLDivElement>('.vt-virtual-row')
      const cell = target.closest<HTMLDivElement>('.vt-table-cell:not(.vt-checkbox-cell)')
      if (!rowEl || !cell) return
      const rowIndex = parseInt(rowEl.dataset.rowIndex ?? '-1', 10)
      const colKey = cell.dataset.columnKey
      if (rowIndex < 0 || !colKey) return
      this.startEdit(rowIndex, colKey, cell)
    })

    this.scrollContainer.addEventListener('click', (e: MouseEvent) => {
      const toggle = (e.target as HTMLElement).closest<HTMLElement>('.vt-group-toggle')
      if (!toggle) return
      e.stopPropagation()
      const rowIndex = parseInt(toggle.dataset.rowIndex ?? '-1', 10)
      if (rowIndex >= 0) this.onGroupToggle?.(rowIndex)
    })
  }

  /** 注入组头折叠回调 (mount 后由 VirtualTable 设置) */
  public setGroupToggleHandler(handler: (rowIndex: number) => void): void {
    this.onGroupToggle = handler
  }

  /** 刷新所有可见行的选中样式 */
  public refreshSelectionUI(): void {
    if (!this.selectionManager) return
    for (const [rowIndex, rowEl] of this.rowElementMap) {
      this.renderer.setRowSelected(rowEl, this.selectionManager.has(rowIndex))
    }
    if (this.headerRow) {
      const state = this.selectionManager.getSelectAllState(this.config.totalRows)
      this.renderer.updateSelectAllCheckbox(this.headerRow, state)
    }
  }

  /**
   * 增量更新可视区行
   * - 普通滚动 (纵 + 横)
   * - 初始化填充
   * - 数据补充
   */
  public updateVisibleRows(): void {
    requestAnimationFrame(() => {
      this.updateVisibleRowsInternal()
    })
  }

  // 获取当前可视区的数据行
  public getVisibleRows(): HTMLDivElement[] {
    return Array.from(this.rowElementMap.values())
  }

  /** 获取当前可见行下标集合 */
  public getVisibleRowIndices(): number[] {
    return Array.from(this.visibleRows)
  }

  private updateVisibleRowsInternal() {
    const { scrollTop, scrollLeft, clientHeight } = this.scrollContainer
    const fixedTopHeight = this.config.headerHeight + (this.config.showSummary ? this.config.summaryHeight : 0)
    const contentScrollTop = Math.max(0, scrollTop - fixedTopHeight)
    const viewportHeight = clientHeight
      - this.config.headerHeight
      - (this.config.showSummary ? this.config.summaryHeight : 0)

    const {
      startRow,
      endRow,
      translateY,
      contentHeight,
    } = this.scroller.getScrollInfo(contentScrollTop, viewportHeight)

    // 横向: 列虚拟化范围
    const frozenW = this.colVirtualizer.getFrozenWidth()
    const colRange = this.colVirtualizer.getRange(
      Math.max(0, scrollLeft),
      Math.max(0, (this.scrollContainer.clientWidth || 0) - frozenW)
    )

    // 计算页码范围并通知外部
    const pageInfo = calculatePageRange(
      startRow,
      endRow,
      this.config.totalRows,
      this.config.pageSize)
    this.onPageChange?.(pageInfo)

    // 设置虚拟内容区的位置和高度
    this.virtualContent.style.transform = `translateY(${translateY}px)`
    this.virtualContent.style.height = `${contentHeight}px`
    this.virtualContent.style.width = `${colRange.totalWidth}px`

    // 列范围变化时, 重算 rowSpan 计划 (行数据依赖, 仅 client 且数据可用)
    const colRangeChanged = colRange.startCol !== this.lastColStart || colRange.endCol !== this.lastColEnd
    if (colRangeChanged) {
      this.lastColStart = colRange.startCol
      this.lastColEnd = colRange.endCol
      this.computeRowSpanPlans(startRow, endRow, colRange)
    }

    const newVisibleSet = new Set<number>()
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
      newVisibleSet.add(rowIndex)
      const rowEl = this.rowElementMap.get(rowIndex)
      if (rowEl) {
        this.positionRow(rowEl, rowIndex, startRow)
        // 列范围变化时, 既有行的可见列集也要同步 (横向滚动/列配置变化)
        if (colRangeChanged) {
          const rowData = this.dataStrategy.getRow(rowIndex) ?? null
          this.renderer.syncVisibleCols(rowEl, colRange.startCol, colRange.endCol, rowData, rowIndex)
        }
      } else {
        const isSelected = this.selectionManager?.has(rowIndex) ?? false
        const rowHeight = this.scroller.getRowHeight(rowIndex)
        const newRow = this.pool.acquire(this.renderer, rowIndex, isSelected, rowHeight)
        this.positionRow(newRow, rowIndex, startRow)
        // 先渲染可见列结构, 再异步填充数据
        this.renderer.syncVisibleCols(newRow, colRange.startCol, colRange.endCol, null, rowIndex)
        this.virtualContent.appendChild(newRow)
        this.rowElementMap.set(rowIndex, newRow)
        void this.updateRowData(rowIndex).catch(console.warn)
      }
    }

    // 横向位移同步到所有可见行
    for (const rowEl of this.rowElementMap.values()) {
      this.renderer.applyScrollX(rowEl, colRange.translateX)
    }

    // 清理离开视口的旧行, 回收入池
    for (const rowIndex of this.visibleRows) {
      if (!newVisibleSet.has(rowIndex)) {
        const oldRow = this.rowElementMap.get(rowIndex)
        if (oldRow) {
          this.cancelEdit()
          this.pool.release(this.renderer, oldRow)
          this.rowElementMap.delete(rowIndex)
        }
      }
    }
    this.visibleRows = newVisibleSet
  }

  /** 设置行的 top/height (可变行高) */
  private positionRow(rowEl: HTMLDivElement, rowIndex: number, startRow: number): void {
    const top = this.scroller.getRowOffset(rowIndex) - this.scroller.getRowOffset(startRow)
    this.renderer.setRowTop(rowEl, top)
    this.renderer.setRowHeight(rowEl, this.scroller.getRowHeight(rowIndex))
  }

  /** 计算 [startRow, endRow] 的 rowSpan/colSpan 合并计划 */
  private computeRowSpanPlans(startRow: number, endRow: number, colRange: { startCol: number; endCol: number }): void {
    this.rowSpanPlans.clear()
    const columns = this.config.columns

    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
      const plan: RowSpanPlan = { skipCols: new Set(), spanHeights: new Map(), colSpans: new Map() }
      const rowData = this.dataStrategy.getRow(rowIndex)
      if (!rowData || rowData.__group === true) {
        this.rowSpanPlans.set(rowIndex, plan)
        continue
      }

      // colSpan: 向右合并, 跳过被覆盖列
      if (rowData) {
        for (let c = colRange.startCol; c <= colRange.endCol; c++) {
          if (plan.skipCols.has(c)) continue
          const col = columns[c]
          if (col?.colSpan) {
            const span = Math.max(1, col.colSpan(rowData[col.key], rowData, rowIndex) || 1)
            if (span > 1) {
              let width = 0
              for (let k = c; k < Math.min(c + span, columns.length); k++) {
                width += columns[k].width || 120
              }
              plan.colSpans.set(c, { span, width })
              for (let k = c + 1; k < Math.min(c + span, colRange.endCol + 1); k++) {
                plan.skipCols.add(k)
              }
            }
          }
        }
      }

      // rowSpan: 向上回溯被覆盖的列
      for (let c = colRange.startCol; c <= colRange.endCol; c++) {
        const col = columns[c]
        if (!col?.rowSpan) continue
        let coveredBy: { span: number; startRow: number } | null = null
        for (let r = rowIndex - 1; r >= Math.max(0, rowIndex - MAX_ROWSPAN_SCAN); r--) {
          const prevData = this.dataStrategy.getRow(r)
          if (!prevData || prevData.__group === true) break
          const span = Math.max(1, col.rowSpan(prevData[col.key], prevData, r) || 1)
          if (span > 1 && r + span - 1 >= rowIndex) {
            coveredBy = { span, startRow: r }
            break
          }
        }
        if (coveredBy) {
          plan.skipCols.add(c)
          // 起始行撑高: 高度 = span 行高之和
          const startPlan = this.rowSpanPlans.get(coveredBy.startRow)
          if (startPlan) {
            let h = 0
            for (let r = coveredBy.startRow; r < coveredBy.startRow + coveredBy.span; r++) {
              h += this.scroller.getRowHeight(r)
            }
            startPlan.spanHeights.set(c, h)
          } else {
            // 起始行不在本次渲染范围 (向上回溯穿透): 用独立缓存兜底
            let h = 0
            for (let r = coveredBy.startRow; r < coveredBy.startRow + coveredBy.span; r++) {
              h += this.scroller.getRowHeight(r)
            }
            plan.spanHeights.set(c, h)
          }
        }
      }

      this.rowSpanPlans.set(rowIndex, plan)
    }
  }

  /** 渲染单行: 应用合并计划 */
  private applyRowPlan(rowEl: HTMLDivElement, rowIndex: number, startCol: number, endCol: number, rowData: Record<string, any> | null): void {
    const plan = this.rowSpanPlans.get(rowIndex)
    if (!plan) return

    if (plan.skipCols.size > 0 || plan.spanHeights.size > 0 || plan.colSpans.size > 0) {
      const cells = Array.from(rowEl.querySelectorAll<HTMLDivElement>('.vt-table-cell:not(.vt-checkbox-cell)'))
      for (const cell of cells) {
        const key = cell.dataset.columnKey
        const colIndex = key ? this.config.columns.findIndex((c) => c.key === key) : -1
        if (colIndex < 0) continue
        const spanH = plan.spanHeights.get(colIndex)
        if (spanH) {
          this.renderer.applyRowSpan(cell, Math.round(spanH / (this.scroller.getRowHeight(rowIndex) || 1)), spanH)
          cell.classList.add('vt-cell-merged')
        }
        const spanC = plan.colSpans.get(colIndex)
        if (spanC) {
          this.renderer.applyColSpan(cell, spanC.span, spanC.width)
          cell.classList.add('vt-cell-merged')
        }
      }
    }

    // 被覆盖列: 移除 cell 并标记占位 (仅对可见范围内的列)
    if (plan.skipCols.size > 0) {
      for (const colIndex of plan.skipCols) {
        const col = this.config.columns[colIndex]
        if (!col) continue
        const cellsMap = this.getCellsMap(rowEl)
        const cell = cellsMap.get(col.key)
        if (cell && colIndex >= startCol && colIndex <= endCol) {
          this.renderer.destroyCellRenderer(cell)
          cell.remove()
          cellsMap.delete(col.key)
        }
      }
    }
  }

  /** 读取行上的 cells map (与 renderer 一致) */
  private getCellsMap(rowEl: HTMLDivElement): Map<string, HTMLDivElement> {
    const key = '__vtCells'
    let m = (rowEl as any)[key] as Map<string, HTMLDivElement> | undefined
    if (!m) {
      m = new Map()
      ;(rowEl as any)[key] = m
    }
    return m
  }

  /**
   * 更新某行数据 (异步加载后完成)
   */
  private async updateRowData(rowIndex: number): Promise<void> {
    try {
      let rowData = this.dataStrategy.getRow(rowIndex)
      if (!rowData) {
        const pageIndex = Math.floor(rowIndex / this.config.pageSize)
        await this.dataStrategy.ensurePageForRow(rowIndex)
        rowData = this.dataStrategy.getRow(rowIndex)
      }
      if (rowData !== undefined) {
        const rowEl = this.rowElementMap.get(rowIndex)
        if (rowEl) {
          this.renderer.updateDataRow(rowEl, rowData, rowIndex)
          // 组头行样式
          if (rowData.__group === true) {
            rowEl.classList.add('vt-row-group')
          }
          this.applyRowPlan(rowEl, rowIndex, this.lastColStart, this.lastColEnd, rowData)
        }
      }
    } catch (error) {
      console.warn(`Faild to update row ${rowIndex}`, error)
    }
  }

  // ====== 内联编辑 ======

  /** 是否可以编辑某单元格 */
  private isEditable(rowIndex: number, colKey: string): boolean {
    const col = this.config.columns.find((c) => c.key === colKey)
    if (!col?.editable) return false
    const rowData = this.dataStrategy.getRow(rowIndex)
    if (!rowData) return false
    if (rowData.__group === true) return false
    const value = rowData[colKey]
    return typeof col.editable === 'function' ? col.editable(value, rowData, rowIndex) : true
  }

  /** 开始编辑 (双击) */
  private startEdit(rowIndex: number, colKey: string, cell: HTMLDivElement): void {
    if (!this.isEditable(rowIndex, colKey)) return
    this.cancelEdit()

    const col = this.config.columns.find((c) => c.key === colKey)!
    const rowData = this.dataStrategy.getRow(rowIndex)
    if (!rowData) return
    const oldValue = rowData[colKey]

    const editing = { rowIndex, colKey, cell }
    this.editing = editing
    cell.classList.add('vt-cell-editing')

    const commit = (newValue: any) => {
      this.finishEdit()
      if (String(newValue) === String(oldValue ?? '')) return
      // 更新本地数据 (client 模式)
      const updated = this.dataStrategy.setRow?.(rowIndex, { [colKey]: newValue })
      if (updated) {
        this.renderer.updateDataRow(cell.closest<HTMLDivElement>('.vt-virtual-row')!, updated, rowIndex)
        // 若该列参与 rowSpan/colSpan 或分组, 触发一次重渲染
        if (col.colSpan || col.rowSpan || this.config.groupBy) {
          this.refresh()
        }
      }
      // 回调
      this.config.onCellValueChange?.(colKey, rowIndex, newValue, oldValue, updated ?? rowData)
    }

    const cancel = () => this.finishEdit()

    // 编辑器: 自定义 / text / number
    let cleanup: (() => void) | null = null
    const editorCtx = {
      value: oldValue, row: rowData, rowIndex, colKey,
      commit,
      cancel,
      refresh: () => { /* 编辑态下由提交/取消结束, 无需重渲 */ },
    }
    // 记录旧内容快照 (取消时恢复; 提交路径由 updateDataRow 重渲覆盖)
    const cellSnapshot = cell.innerHTML
    if (typeof col.editor === 'function') {
      const editor = col.editor(editorCtx)
      if (editor) {
        cell.innerHTML = ''
        editor.mount(cell, editorCtx)
        cleanup = () => editor.destroy?.()
      }
    } else {
      const type = col.editor === 'number' ? 'number' : 'text'
      cell.innerHTML = ''
      const input = document.createElement('input')
      input.className = 'vt-cell-editor'
      input.type = type
      input.value = oldValue === undefined || oldValue === null ? '' : String(oldValue)
      cell.appendChild(input)
      input.focus()
      input.select()

      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(input.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }
      const onBlur = () => commit(input.value)
      input.addEventListener('keydown', onKey)
      input.addEventListener('blur', onBlur)
      cleanup = () => {
        input.removeEventListener('keydown', onKey)
        input.removeEventListener('blur', onBlur)
      }
    }

    this.editingCleanup = () => {
      cleanup?.()
      cell.classList.remove('vt-cell-editing')
      // 未提交 (取消) 时恢复原内容; 提交路径会经 updateDataRow 重渲覆盖
      cell.innerHTML = cellSnapshot
    }
  }

  private finishEdit(): void {
    if (this.editingCleanup) {
      this.editingCleanup()
      this.editingCleanup = null
    }
    this.editing = null
  }

  private cancelEdit(): void {
    this.finishEdit()
  }

  // ========== refresh(): 结构性变化时调用 ==========
  /**
   * 清屏重建: 清空所有 DOM 并重新渲染
   * 仅用于: 列数量/列顺序变化、冻结列数变化、totalRows 重算需清屏
   */
  public refresh() {
    this.cancelEdit()
    if (this.virtualContent) {
      this.virtualContent.replaceChildren()
    }
    this.visibleRows.clear()
    this.rowElementMap.clear()
    this.rowSpanPlans.clear()
    this.lastColStart = -1
    this.lastColEnd = -1
    this.rebuildColumnVirtualizer()
    this.updateVisibleRows()
  }

  // 销毁
  public destroy() {
    this.cancelEdit()
    this.visibleRows.clear()
    this.rowElementMap.clear()
    this.pool.clear()
    this.rowSpanPlans.clear()
  }
}
