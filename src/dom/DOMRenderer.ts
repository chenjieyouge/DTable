import type { IConfig, IColumn, CellRenderResult, ICellRenderer } from '@/types'

// 纯 dom 创建与更新: 无状态, 只负责如何画, 不关心数据
//
// 数据行结构 (列虚拟化后):
//   .vt-virtual-row (position:absolute; top; height)
//     ├─ [checkbox 占位格]                       (行选中开启时, sticky 最左)
//     ├─ [冻结列单元格 × frozenCount]            (sticky, 常驻)
//     └─ .vt-scroll-body                         (position:absolute; left: frozenWidth)
//          └─ [可见非冻结列单元格]                (随横向滚动增删)

interface CellState {
  renderer?: ICellRenderer // 渲染器组件实例 (生命周期管理)
  rendererCtx?: Parameters<NonNullable<ICellRenderer['update']>>[0]
}

export class DOMRenderer {
  private config: IConfig
  private cellStates = new WeakMap<HTMLDivElement, CellState>()

  constructor(config: IConfig) {
    this.config = config
  }

  private get hasSelection(): boolean {
    return !!this.config.rowSelection?.enabled
  }

  private get frozenCount(): number {
    return this.config.frozenColumns || 0
  }

  /** 冻结列数量 (公开给行池等外部模块) */
  public getFrozenCount(): number {
    return this.frozenCount
  }

  /** 列 key -> 列下标 (公开给行池等外部模块) */
  public getColumnIndex(key: string): number {
    return this.config.columns.findIndex((c) => c.key === key)
  }

  private getCellState(cell: HTMLDivElement): CellState {
    let s = this.cellStates.get(cell)
    if (!s) {
      s = {}
      this.cellStates.set(cell, s)
    }
    return s
  }

  /** 行元素上挂的列 cell 缓存: rowEl -> Map<columnKey, cell> */
  private getCellsMap(rowEl: HTMLElement): Map<string, HTMLDivElement> {
    const key = '__vtCells'
    let m = (rowEl as any)[key] as Map<string, HTMLDivElement> | undefined
    if (!m) {
      m = new Map()
      ;(rowEl as any)[key] = m
    }
    return m
  }

  /** 创建 checkbox 表头单元格（全选） */
  public createCheckboxHeaderCell(): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell vt-checkbox-cell vt-header-cell'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.className = 'vt-checkbox'
    cb.dataset.selectAll = 'true'
    cell.appendChild(cb)
    return cell
  }

  /** 创建 checkbox 数据单元格 */
  public createCheckboxCell(rowIndex: number, isSelected: boolean): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell vt-checkbox-cell'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.className = 'vt-checkbox'
    cb.checked = isSelected
    cb.dataset.rowIndex = String(rowIndex)
    cell.appendChild(cb)
    return cell
  }

  /**
   * 标记冻结列
   *
   * @param colIndex 列序号 —— 必须是"不包含 checkbox 占位格"的数据列序号,
   *                  否则开了行选中时所有冻结列都会错位
   */
  private markFrozen(cell: HTMLDivElement, colIndex: number): void {
    const frozenCount = this.frozenCount
    const isFrozen = colIndex < frozenCount

    cell.classList.toggle('vt-cell-frozen', isFrozen)
    // 最后一列冻结列承担边界阴影, 只在横向滚动后由外层 class 显示
    cell.classList.toggle('vt-cell-frozen-last', isFrozen && colIndex === frozenCount - 1)
  }

  /** 更新行选中状态（class + checkbox） */
  public setRowSelected(rowEl: HTMLDivElement, isSelected: boolean): void {
    rowEl.classList.toggle('vt-row-selected', isSelected)
    const cb = rowEl.querySelector<HTMLInputElement>('.vt-checkbox:not([data-select-all])')
    if (cb) cb.checked = isSelected
  }

  /** 更新全选 checkbox 的三态（全选/半选/未选） */
  public updateSelectAllCheckbox(headerRow: HTMLDivElement, state: 'all' | 'partial' | 'none'): void {
    const cb = headerRow.querySelector<HTMLInputElement>('.vt-checkbox[data-select-all]')
    if (!cb) return
    cb.checked = state === 'all'
    cb.indeterminate = state === 'partial'
  }

  // 创建单个表头单元格, 公共给外部使用
  createHeaderRow(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-sticky-header'
    if (this.hasSelection) {
      row.appendChild(this.createCheckboxHeaderCell())
    }
    this.renderCells(row, this.config.columns, 'header')
    return row
  }

  // 总结行 (一维)
  createSummaryRow(summaryData?: Record<string, any>): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-sticky-summary'
    if (this.hasSelection) {
      const placeholder = document.createElement('div')
      placeholder.className = 'vt-table-cell vt-checkbox-cell'
      row.appendChild(placeholder)
    }
    this.renderCells(row, this.config.columns, 'summary', summaryData)
    return row
  }

  // 更新总结行数据
  updateSummaryRow(rowElement: HTMLDivElement, data: Record<string, any>) {
    const cells = rowElement.querySelectorAll<HTMLDivElement>('.vt-table-cell:not(.vt-checkbox-cell)')
    cells.forEach((cell, idx) => {
      const col = this.config.columns[idx]
      cell.textContent = data[col.key] ?? (idx === 0 ? '合计' : '')
    })
  }

  // ====== 数据行: 列虚拟化结构 ======

  /**
   * 创建数据行骨架 (不含任何数据单元格内容)
   * 结构: [checkbox?] [冻结列 cells] [.vt-scroll-body]
   */
  public createRow(rowIndex: number, isSelected = false): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-virtual-row'
    row.dataset.rowIndex = rowIndex.toString()
    if (isSelected) row.classList.add('vt-row-selected')

    const cellsMap = this.getCellsMap(row)

    if (this.hasSelection) {
      const cbCell = this.createCheckboxCell(rowIndex, isSelected)
      row.appendChild(cbCell)
    }

    // 冻结列 cell 常驻 (骨架)
    const frozen = Math.min(this.frozenCount, this.config.columns.length)
    for (let i = 0; i < frozen; i++) {
      const col = this.config.columns[i]
      const cell = this.createDataCell(col, null, rowIndex, i)
      row.appendChild(cell)
      cellsMap.set(col.key, cell)
    }

    // 非冻结区容器 (列虚拟化在此进行)
    const scrollBody = document.createElement('div')
    scrollBody.className = 'vt-scroll-body'
    row.appendChild(scrollBody)

    return row
  }

  /**
   * 同步可见非冻结列: 只渲染 [startCol, endCol] 范围
   * 列离开范围 -> 移除并销毁组件; 进入范围 -> 创建
   */
  public syncVisibleCols(
    rowEl: HTMLDivElement,
    startCol: number,
    endCol: number,
    rowData: Record<string, any> | null,
    rowIndex: number
  ): void {
    const scrollBody = rowEl.querySelector<HTMLDivElement>('.vt-scroll-body')
    if (!scrollBody) return
    const cellsMap = this.getCellsMap(rowEl)

    const needed = new Set<number>()
    for (let i = Math.max(this.frozenCount, startCol); i <= endCol; i++) needed.add(i)

    // 1. 移除不再可见的列 cell
    for (const [key, cell] of cellsMap) {
      const colIdx = this.config.columns.findIndex((c) => c.key === key)
      if (colIdx < this.frozenCount) continue // 冻结列常驻, 跳过
      if (!needed.has(colIdx)) {
        this.destroyCellRenderer(cell)
        cell.remove()
        cellsMap.delete(key)
      }
    }

    // 2. 按列序 append 缺失的 cell (范围连续, append 顺序即视觉顺序)
    const fragment = document.createDocumentFragment()
    for (let i = Math.max(this.frozenCount, startCol); i <= endCol; i++) {
      const col = this.config.columns[i]
      if (!col || cellsMap.has(col.key)) continue
      const cell = this.createDataCell(col, rowData, rowIndex, i)
      cellsMap.set(col.key, cell)
      fragment.appendChild(cell)
    }
    if (fragment.children.length > 0) scrollBody.appendChild(fragment)

    // 3. 更新 scroll-body 位置 (冻结区宽度可能因列宽变化而变)
    const frozenW = this.frozenWidth()
    scrollBody.style.left = `${frozenW}px`
  }

  /** 冻结列总宽 (按当前配置列宽) */
  private frozenWidth(): number {
    let w = 0
    const n = Math.min(this.frozenCount, this.config.columns.length)
    for (let i = 0; i < n; i++) w += this.config.columns[i].width || 120
    return w
  }

  /** 应用横向位移: scroll-body translateX */
  public applyScrollX(rowEl: HTMLDivElement, scrollLeft: number): void {
    const scrollBody = rowEl.querySelector<HTMLDivElement>('.vt-scroll-body')
    if (scrollBody) scrollBody.style.transform = `translateX(${-scrollLeft}px)`
  }

  /** 设置行高 (可变行高) */
  public setRowHeight(rowEl: HTMLDivElement, height: number): void {
    rowEl.style.height = `${height}px`
  }

  /** 设置行顶部偏移 (可变行高下各行位置不同) */
  public setRowTop(rowEl: HTMLDivElement, top: number): void {
    rowEl.style.top = `${top}px`
  }

  // 骨架屏行 (兼容旧签名, 内部用新结构)
  createSkeletonRow(rowIndex: number, isSelected = false): HTMLDivElement {
    const row = this.createRow(rowIndex, isSelected)
    row.classList.add('vt-skeleton')
    // 冻结列填充骨架样式
    for (let i = 0; i < this.frozenCount; i++) {
      const col = this.config.columns[i]
      const cell = this.getCellsMap(row).get(col.key)
      if (cell) cell.classList.add('vt-skeleton')
    }
    return row
  }

  // 更新数据行: 更新行内全部已渲染 cell (冻结列 + 可见非冻结列)
  updateDataRow(rowElement: HTMLDivElement, data: Record<string, any>, rowIndex?: number) {
    const cellsMap = this.getCellsMap(rowElement)
    const columns = this.config.columns
    const frozen = this.frozenCount

    for (const [key, cell] of cellsMap) {
      const colIdx = columns.findIndex((c) => c.key === key)
      if (colIdx < 0) continue
      const col = columns[colIdx]
      // 组头行特殊渲染
      if (data && data.__group === true) {
        this.renderGroupCell(cell, col, colIdx, data, rowIndex ?? 0)
        continue
      }
      this.updateCell(cell, col, colIdx, data ? data[col.key] : undefined, data, rowIndex ?? 0, true)
      void frozen
    }
  }

  /** 更新单个数据单元格 (统一入口) */
  private updateCell(
    cell: HTMLDivElement,
    col: IColumn,
    colIndex: number,
    value: any,
    row: Record<string, any>,
    rowIndex: number,
    isDataRow: boolean
  ): void {
    if (isDataRow) {
      cell.classList.remove('vt-skeleton')
    }
    // 清理上一轮渲染残留, 避免虚拟滚动复用导致样式串行
    cell.style.color = ''
    cell.style.backgroundColor = ''
    cell.style.fontWeight = ''
    cell.style.height = ''
    cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`

    cell.classList.add('vt-table-cell')
    this.markFrozen(cell, colIndex)

    // 默认渲染 / 自定义渲染器 (支持组件生命周期)
    this.renderCellContent(cell, col, value, row, rowIndex)

    // 条件样式类名
    const baseClass = 'vt-table-cell'
    if (col.cellClassName) {
      const className = col.cellClassName(value, row)
      cell.className = className ? `${baseClass} ${className}` : baseClass
      // 保留冻结列样式
      if (colIndex < this.frozenCount) cell.classList.add('vt-cell-frozen')
    }
    // 条件行内样式
    if (col.cellStyle) {
      const styleObj = col.cellStyle(value, row, rowIndex)
      if (styleObj) Object.assign(cell.style, styleObj)
    }
    // 可编辑标记
    const editable = col.editable
    const isEditable = typeof editable === 'function' ? editable(value, row, rowIndex) : !!editable
    cell.classList.toggle('vt-cell-editable', isEditable && !cell.classList.contains('vt-cell-editing'))
  }

  /** 渲染单元格内容 (string | HTMLElement | ICellRenderer) */
  private renderCellContent(
    cell: HTMLDivElement,
    col: IColumn,
    value: any,
    row: Record<string, any>,
    rowIndex: number
  ): void {
    if (col.render) {
      const result = col.render(value, row, rowIndex)
      const state = this.getCellState(cell)
      const ctx = {
        value,
        row,
        rowIndex,
        colKey: col.key,
        refresh: () => this.renderCellContent(cell, col, value, row, rowIndex),
      }

      if (typeof result === 'string') {
        this.destroyCellRenderer(cell)
        cell.innerHTML = result
      } else if (result instanceof HTMLElement) {
        this.destroyCellRenderer(cell)
        cell.innerHTML = ''
        cell.appendChild(result)
      } else if (result && typeof result.mount === 'function') {
        // 渲染器组件: 实例不变则 update, 变化则销毁重建
        if (state.renderer === result) {
          result.update?.(ctx)
        } else {
          state.renderer?.destroy?.()
          state.renderer = result
          cell.innerHTML = ''
          result.mount(cell, ctx)
        }
      }
    } else {
      this.destroyCellRenderer(cell)
      cell.textContent = value !== undefined && value !== null ? String(value) : ''
    }
  }

  /** 渲染组头单元格 (行分组) */
  private renderGroupCell(
    cell: HTMLDivElement,
    col: IColumn,
    colIndex: number,
    groupRow: Record<string, any>,
    rowIndex: number
  ): void {
    cell.classList.remove('vt-skeleton')
    cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
    cell.classList.add('vt-table-cell', 'vt-group-cell')
    this.markFrozen(cell, colIndex)

    const level = groupRow.__level ?? 0
    const groupField = groupRow.__groupField
    const expanded = groupRow.__expanded
    const count = groupRow.__count ?? 0

    if (col.key === groupField) {
      // 组头列: 箭头 + 组值 + 计数
      cell.innerHTML = ''
      const arrow = document.createElement('span')
      arrow.className = 'vt-group-toggle'
      arrow.textContent = expanded ? '▾' : '▸'
      arrow.dataset.rowIndex = String(rowIndex)
      cell.appendChild(arrow)
      const label = document.createElement('span')
      label.className = 'vt-group-label'
      label.textContent = String(groupRow[groupField] ?? '(空)')
      cell.appendChild(label)
      const badge = document.createElement('span')
      badge.className = 'vt-group-count'
      badge.textContent = `${count}`
      cell.appendChild(badge)
    } else if (colIndex === 0 && this.frozenCount === 0) {
      // 无冻结列时第一列兜底放箭头 (避免组头行完全空白)
      cell.innerHTML = ''
      const arrow = document.createElement('span')
      arrow.className = 'vt-group-toggle'
      arrow.textContent = expanded ? '▾' : '▸'
      cell.appendChild(arrow)
    } else {
      cell.textContent = ''
    }
    cell.style.paddingLeft = `${8 + level * 18}px`
  }

  /** 销毁单元格的渲染器组件实例 */
  public destroyCellRenderer(cell: HTMLDivElement): void {
    const state = this.cellStates.get(cell)
    if (state?.renderer) {
      try {
        state.renderer.destroy?.()
      } catch (e) {
        console.warn('[DOMRenderer] 渲染器组件 destroy 抛错: ', e)
      }
      state.renderer = undefined
    }
  }

  /** 销毁整行的渲染器组件 (行离开视口/回收时调用) */
  public destroyRowRenderers(rowEl: HTMLDivElement): void {
    const cellsMap = this.getCellsMap(rowEl)
    for (const cell of cellsMap.values()) {
      this.destroyCellRenderer(cell)
    }
  }

  // 单元格渲染 (通用, 用于 header / summary / 旧式全量渲染)
  private renderCells(
    row: HTMLDivElement,
    columns: IColumn[],
    type: 'header' | 'summary' | 'skeleton',
    data?: Record<string, any>
  ): void {
    let leftOffset = 0
    columns.forEach((col, index) => {
      const cell = document.createElement('div')
      cell.className = 'vt-table-cell'
      cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
      cell.dataset.columnKey = col.key

      this.markFrozen(cell, index)
      if (index < this.frozenCount) {
        cell.style.left = `${leftOffset}px`
      }

      if (type === 'header') {
        cell.classList.add('vt-header-cell')
        const textSpan = document.createElement('span')
        textSpan.className = 'vt-header-text'
        textSpan.textContent = col.title
        cell.appendChild(textSpan)

        if (col.sortable) {
          cell.dataset.sortable = 'true'
        }
        const handle = document.createElement('div')
        handle.className = 'vt-col-resize-handle'
        handle.dataset.columnKey = col.key
        cell.appendChild(handle)

        if (col.filter) {
          const filterBtn = document.createElement('div')
          filterBtn.className = 'vt-col-filter-btn'
          filterBtn.dataset.columnKey = col.key
          filterBtn.dataset.filterType = col.filter.type
          filterBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M1 2h12l-5 6v4l-2 1V8L1 2z"/>
            </svg>
          `
          filterBtn.setAttribute('data-vt-tip', '筛选')
          filterBtn.setAttribute('aria-label', '筛选')
          cell.appendChild(filterBtn)
        }

        const menuBtn = document.createElement('div')
        menuBtn.className = 'vt-col-menu-btn'
        menuBtn.dataset.columnKey = col.key
        menuBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="3" r="1.5"/>
            <circle cx="8" cy="8" r="1.5"/>
            <circle cx="8" cy="13" r="1.5"/>
          </svg>
        `
        menuBtn.setAttribute('data-vt-tip', '列菜单')
        menuBtn.setAttribute('aria-label', '列菜单')
        cell.appendChild(menuBtn)

      } else if (type === 'summary') {
        cell.textContent = data?.[col.key] ?? (index === 0 ? '合计' : '')
      } else {
        cell.classList.add('vt-skeleton')
        cell.textContent = ''
      }

      leftOffset += col.width || 120
      row.appendChild(cell)
    })
  }

  // 辅助方法: 创建单个表头单元格 (公开给重建 dom 等多地方反复用)
  public createHeaderCell(col: IColumn, index: number): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell vt-header-cell'
    cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
    cell.dataset.columnKey = col.key

    const textSpan = document.createElement('span')
    textSpan.className = 'vt-header-text'
    textSpan.textContent = col.title
    cell.appendChild(textSpan)

    if (col.sortable) {
      cell.dataset.sortable = 'true'
    }

    const handle = document.createElement('div')
    handle.className = 'vt-col-resize-handle'
    handle.dataset.columnKey = col.key
    cell.appendChild(handle)

    if (col.filter) {
      const filterBtn = document.createElement('div')
      filterBtn.className = 'vt-col-filter-btn'
      filterBtn.dataset.columnKey = col.key
      filterBtn.dataset.filterType = col.filter.type
      filterBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <path d="M1 2h12l-5 6v4l-2 1V8L1 2z"/>
        </svg>
      `
      filterBtn.setAttribute('data-vt-tip', '筛选')
      filterBtn.setAttribute('aria-label', '筛选')
      cell.appendChild(filterBtn)
    }

    const menuBtn = document.createElement('div')
    menuBtn.className = 'vt-col-menu-btn'
    menuBtn.dataset.columnKey = col.key
    menuBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="3" r="1.5"/>
        <circle cx="8" cy="8" r="1.5"/>
        <circle cx="8" cy="13" r="1.5"/>
      </svg>
    `
    menuBtn.setAttribute('data-vt-tip', '列菜单')
    menuBtn.setAttribute('aria-label', '列菜单')
    cell.appendChild(menuBtn)

    this.markFrozen(cell, index)
    return cell
  }

  // 辅助方法: 创建单个汇总行单元格
  public createSummaryCell(col: IColumn, index: number, summaryData?: Record<string, any>): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell'
    cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
    cell.dataset.columnKey = col.key
    cell.textContent = summaryData?.[col.key] ?? (index === 0 ? '合计' : '')
    this.markFrozen(cell, index)
    return cell
  }

  // 辅助方法: 创建单个数据单元格 (骨架或带数据)
  public createDataCell(
    col: IColumn,
    rowData: Record<string, any> | null,
    rowIndex: number,
    colIndex: number
  ): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell'
    cell.style.width = `var(--col-${col.key}-width, ${col.width}px)`
    cell.dataset.columnKey = col.key

    if (rowData) {
      if (rowData.__group === true) {
        this.renderGroupCell(cell, col, colIndex, rowData, rowIndex)
      } else {
        this.updateCell(cell, col, colIndex, rowData[col.key], rowData, rowIndex, true)
      }
    } else {
      cell.classList.add('vt-skeleton')
      cell.textContent = ''
      this.markFrozen(cell, colIndex)
    }
    return cell
  }

  /** 应用单元格合并的横向跨度: colSpan */
  public applyColSpan(cell: HTMLDivElement, span: number, spanWidth: number): void {
    cell.style.width = `${spanWidth}px`
    cell.dataset.colspan = String(span)
  }

  /** 应用单元格合并的纵向跨度: rowSpan */
  public applyRowSpan(cell: HTMLDivElement, span: number, spanHeight: number): void {
    cell.style.height = `${spanHeight}px`
    cell.dataset.rowspan = String(span)
  }

  /**
   * 高亮"正在筛选"的列的漏斗图标
   */
  public applyFilterIndicators(headerRow: HTMLDivElement, activeKeys: string[]): void {
    const active = new Set(activeKeys)
    const btns = headerRow.querySelectorAll<HTMLElement>('.vt-col-filter-btn')

    btns.forEach((btn) => {
      const key = btn.dataset.columnKey
      if (!key) return
      btn.classList.toggle('vt-active', active.has(key))
    })
  }

  // 辅助方法: 统一应用冻结列样式和位置 (header/summary 用; 数据行结构不同, 走 createRow/syncVisibleCols)
  public applyFrozenStyles(row: HTMLDivElement): void {
    const cells = Array.from(row.querySelectorAll<HTMLDivElement>('.vt-table-cell'))

    let colIndex = -1
    cells.forEach((cell) => {
      const key = cell.dataset.columnKey
      if (!key) return
      colIndex++
      cell.style.left = ''
      this.markFrozen(cell, colIndex)
      if (colIndex < this.frozenCount) {
        cell.style.left = `var(--col-${key}-left, 0px)`
      }
    })
  }
}
