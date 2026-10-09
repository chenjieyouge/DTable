import type { IPivotConfig, IPivotFlatRow, IPivotColNode, AggregationType, ValueFieldFormat } from "@/types/pivot";
import type { IColumn } from "@/types";

/**
 * 透视表渲染器 (Excel 风格: 多行表头 + 行列交叉单元格)
 *
 * 职责:
 * 1. renderHeader(colTree) → 多行表头 (列树有几层就几行)
 * 2. renderRow(flatRow)    → 分组行 / 数据行 / 小计行 / 总计行
 *
 * cellKey 格式与 PivotDataProcessor.buildCellKey 保持一致:
 *   无列分组: 'salary'
 *   有列分组: 'salary__华东__Product-0'
 */
export class PivotRenderer {
  private config: IPivotConfig
  private columns: IColumn[]
  private colLeaves: IPivotColNode[] = []  // 由 PivotTable.refresh() 注入

  constructor(config: IPivotConfig, columns: IColumn[]) {
    this.config = config
    this.columns = columns
  }

  /** 由 PivotTable.refresh() 在每次重建列树后注入 */
  public setColLeaves(leaves: IPivotColNode[]): void {
    this.colLeaves = leaves
  }

  /** Excel 风格聚合前缀: sum → 求和项:xxx */
  private static AGG_PREFIX: Record<AggregationType, string> = {
    sum: '求和项',
    count: '计数项',
    avg: '平均值项',
    max: '最大值项',
    min: '最小值项',
  }

  /** 值字段展示名: 默认「聚合前缀:字段标题」, 与 Excel 值列命名一致 */
  private getValueFieldLabel(vf: { key: string; aggregation: AggregationType; label?: string }): string {
    const title = vf.label ?? this.columns.find(c => c.key === vf.key)?.title ?? vf.key
    return `${PivotRenderer.AGG_PREFIX[vf.aggregation]}:${title}`
  }

  // ─────────────────────────────────────────────
  //  表头渲染 (支持多行)
  // ─────────────────────────────────────────────

  /**
   * 渲染透视表表头
   *
   * 无列分组: 单行表头  [行分组 | 销售额(sum) | 利润(sum)]
   * 有列分组: 多行表头
   *   行0: [行分组 | 华东(flex:4)        | 华北(flex:4)        ]
   *   行1: [空    | Prod-0(2) Prod-1(2) | Prod-0(2) Prod-1(2) ]
   *   行2: [空    | 销售额 利润          | 销售额 利润          ]
   *
   * 用 flex 比例代替 colspan: leafCount 越大, 该列占比越宽
   */
  public renderHeader(
    colTree: IPivotColNode | null,
    onSort?: (cellKey: string, direction: 'asc' | 'desc' | null) => void
  ): HTMLDivElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vt-pivot-header-wrapper'

    const rowGroupLabel = this.config.rowGroups
      .map(key => this.columns.find(c => c.key === key)?.title ?? key)
      .join(' / ')

    const hasColGroups = !!(this.config.colGroups?.length) && colTree && colTree.children.length > 0
    const currentSort = this.config.sortBy

    if (!hasColGroups) {
      const row = this.createHeaderRow()
      row.appendChild(this.createHeaderCell(rowGroupLabel, 1))
      for (const leaf of this.colLeaves) {
        const vfKey = String(leaf.colValue)
        const vf = this.config.valueFields.find(v => (v.label ?? v.key) === vfKey || v.key === vfKey)
        const title = vf ? this.getValueFieldLabel(vf) : vfKey
        const cellKey = vf?.key ?? vfKey
        const isSorted = currentSort?.cellKey === cellKey
        const cell = this.createSortableHeaderCell(title, 1, isSorted ? currentSort!.direction : null)
        cell.dataset.cellKey = cellKey
        if (onSort) {
          cell.style.cursor = 'pointer'
          cell.addEventListener('click', () => {
            const next = !isSorted ? 'desc' : currentSort!.direction === 'desc' ? 'asc' : null
            onSort(cellKey, next)
          })
        }
        row.appendChild(cell)
      }
      wrapper.appendChild(row)
      return wrapper
    }

    const depth = this.getColTreeDepth(colTree)
    for (let d = 0; d < depth; d++) {
      const row = this.createHeaderRow()
      row.appendChild(this.createHeaderCell(d === 0 ? rowGroupLabel : '', 1))
      const nodesAtDepth = this.getNodesAtDepth(colTree, d)
      for (const node of nodesAtDepth) {
        const isLeafRow = node.isLeaf
        if (isLeafRow && onSort) {
          const cellKey = this.getCellKey(node)
          const isSorted = currentSort?.cellKey === cellKey
          const leafVf = this.config.valueFields.find(v => (v.label ?? v.key) === node.colValue || v.key === node.colValue)
          const leafLabel = leafVf ? this.getValueFieldLabel(leafVf) : String(node.colValue)
          const cell = this.createSortableHeaderCell(leafLabel, node.leafCount, isSorted ? currentSort!.direction : null)
          cell.dataset.cellKey = cellKey
          cell.style.textAlign = 'center'
          cell.style.cursor = 'pointer'
          cell.addEventListener('click', () => {
            const next = !isSorted ? 'desc' : currentSort!.direction === 'desc' ? 'asc' : null
            onSort(cellKey, next)
          })
          row.appendChild(cell)
        } else {
          const cell = this.createHeaderCell(String(node.colValue), node.leafCount)
          cell.style.textAlign = 'center'
          row.appendChild(cell)
        }
      }
      wrapper.appendChild(row)
    }

    return wrapper
  }

  /** 带排序图标的表头单元格 */
  private createSortableHeaderCell(text: string, leafCount: number, direction: 'asc' | 'desc' | null): HTMLDivElement {
    const cell = this.createHeaderCell('', leafCount)
    cell.dataset.sortable = 'true'
    const label = document.createElement('span')
    label.textContent = text
    const icon = document.createElement('span')
    icon.className = 'vt-pivot-sort-icon'
    icon.textContent = direction === 'asc' ? ' ▲' : direction === 'desc' ? ' ▼' : ' ⇅'
    icon.style.opacity = direction ? '1' : '0.3'
    icon.style.fontSize = '10px'
    cell.appendChild(label)
    cell.appendChild(icon)
    return cell
  }

  private createHeaderRow(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-pivot-header'
    return row
  }

  private createHeaderCell(text: string, leafCount: number): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell vt-pivot-header-cell'
    cell.textContent = text
    cell.style.fontWeight = 'bold'
    // 使用固定宽度而不是flex，确保多级列分组对齐
    const cellWidth = leafCount * 120 // 每个叶子列120px
    cell.style.minWidth = `${cellWidth}px`
    cell.style.width = `${cellWidth}px`
    cell.style.flex = 'none'
    return cell
  }

  /** 列树深度 (不含根节点 level=-1) */
  private getColTreeDepth(node: IPivotColNode): number {
    if (node.children.length === 0) return 0
    return 1 + Math.max(...node.children.map(c => this.getColTreeDepth(c)))
  }

  /** 广度优先获取某深度层的所有节点 */
  private getNodesAtDepth(root: IPivotColNode, targetDepth: number): IPivotColNode[] {
    const result: IPivotColNode[] = []
    const queue: { node: IPivotColNode }[] = root.children.map(node => ({ node }))
    
    while (queue.length > 0) {
      const { node } = queue.shift()!
      
      if (node.level === targetDepth) {
        result.push(node)
      }
      
      // 继续遍历子节点
      if (node.level < targetDepth && node.children.length > 0) {
        queue.push(...node.children.map(child => ({ node: child })))
      }
    }
    
    return result
  }

  // ─────────────────────────────────────────────
  //  行渲染（单行双区架构）
  // ─────────────────────────────────────────────

  /**
   * 渲染完整行（包含冻结区和滚动区）
   * 新架构：一行包含两部分，确保完美对齐
   */
  public renderUnifiedRow(flatRow: IPivotFlatRow, _rowIndex: number): HTMLDivElement {
    const rowContainer = document.createElement('div')
    rowContainer.className = 'vt-pivot-unified-row'
    rowContainer.dataset.nodeId = flatRow.nodeId
    rowContainer.dataset.type = flatRow.type
    rowContainer.dataset.level = String(flatRow.level)
    
    // 添加行类型样式
    if (flatRow.rowType === 'subtotal') rowContainer.classList.add('vt-pivot-row-subtotal')
    else if (flatRow.rowType === 'grandtotal') rowContainer.classList.add('vt-pivot-row-grandtotal')
    if (flatRow.type === 'group') {
      rowContainer.classList.add('vt-pivot-group-row')
      rowContainer.classList.add(`vt-pivot-group-row--l${Math.min(flatRow.level, 2)}`)
    }
    
    // 冻结区部分
    const frozenPart = this.renderRowFrozenPart(flatRow)
    frozenPart.classList.add('vt-pivot-row-frozen-part')
    
    // 滚动区部分
    const scrollPart = this.renderRowScrollPart(flatRow)
    scrollPart.classList.add('vt-pivot-row-scroll-part')
    
    rowContainer.appendChild(frozenPart)
    rowContainer.appendChild(scrollPart)
    
    return rowContainer
  }

  public renderRow(flatRow: IPivotFlatRow, _rowIndex: number): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-pivot-row'
    row.dataset.nodeId = flatRow.nodeId
    row.dataset.type = flatRow.type
    row.dataset.level = String(flatRow.level)

    if (flatRow.rowType === 'subtotal') row.classList.add('vt-pivot-row-subtotal')
    else if (flatRow.rowType === 'grandtotal') row.classList.add('vt-pivot-row-grandtotal')

    if (flatRow.rowType === 'subtotal' || flatRow.rowType === 'grandtotal') {
      this.renderTotalRow(row, flatRow)
    } else if (flatRow.type === 'group') {
      this.renderGroupRow(row, flatRow)
    } else {
      this.renderDataRow(row, flatRow)
    }

    return row
  }

  private renderGroupRow(row: HTMLDivElement, flatRow: IPivotFlatRow): void {
    row.classList.add('vt-pivot-group-row')
    row.classList.add(`vt-pivot-group-row--l${Math.min(flatRow.level, 2)}`)
    const indent = flatRow.level * 20

    const firstCell = document.createElement('div')
    firstCell.className = 'vt-table-cell vt-pivot-group-cell'
    firstCell.style.paddingLeft = `${indent + 8}px`

    const expandIcon = document.createElement('span')
    expandIcon.className = 'vt-pivot-expand-icon'
    expandIcon.textContent = flatRow.isExpanded ? '▼' : '▶'
    firstCell.appendChild(expandIcon)

    const groupLabel = document.createElement('span')
    groupLabel.className = 'vt-pivot-group-label'
    const currentGroupKey = this.config.rowGroups[flatRow.level] ?? this.config.rowGroups[0]
    groupLabel.textContent = String(flatRow.data[currentGroupKey] ?? '(空)')
    firstCell.appendChild(groupLabel)

    // 行数 badge: 直接用 rowCount
    if (flatRow.rowCount) {
      const badge = document.createElement('span')
      badge.className = 'vt-pivot-count-badge'
      badge.textContent = `(${flatRow.rowCount})`
      firstCell.appendChild(badge)
    }

    row.appendChild(firstCell)

    // 聚合值列
    for (const leaf of this.colLeaves) {
      const cellKey = this.getCellKey(leaf)
      row.appendChild(this.createValueCell(flatRow.data[cellKey], 'vt-pivot-agg-cell'))
    }
  }

  private renderDataRow(row: HTMLDivElement, flatRow: IPivotFlatRow): void {
    row.classList.add('vt-pivot-data-row')
    const indent = flatRow.level * 20

    const firstCell = document.createElement('div')
    firstCell.className = 'vt-table-cell'
    firstCell.style.paddingLeft = `${indent + 28}px`
    const firstKey = Object.keys(flatRow.data)[0]
    firstCell.textContent = String(flatRow.data[firstKey] ?? '')
    row.appendChild(firstCell)

    for (const leaf of this.colLeaves) {
      const cellKey = this.getCellKey(leaf)
      row.appendChild(this.createValueCell(flatRow.data[cellKey]))
    }
  }

  public renderTotalRow(row: HTMLDivElement, flatRow: IPivotFlatRow): void {
    const firstCell = document.createElement('div')
    firstCell.className = 'vt-table-cell vt-pivot-total-cell'

    if (flatRow.rowType === 'subtotal') {
      const indent = (flatRow.level + 1) * 20
      firstCell.style.paddingLeft = `${indent + 8}px`
      firstCell.textContent = '小计'
      firstCell.style.color = '#374151'
      firstCell.style.fontWeight = '600'
    } else {
      firstCell.style.paddingLeft = '12px'
      firstCell.textContent = '总计'
      firstCell.style.fontWeight = '700'
      firstCell.style.color = '#1f2937'
    }

    row.appendChild(firstCell)

    for (const leaf of this.colLeaves) {
      const cellKey = this.getCellKey(leaf)
      const cell = this.createValueCell(flatRow.data[cellKey], 'vt-pivot-total-value-cell')
      cell.style.fontWeight = flatRow.rowType === 'grandtotal' ? '700' : '600'
      row.appendChild(cell)
    }
  }

  // ─────────────────────────────────────────────
  //  辅助
  // ─────────────────────────────────────────────

  /**
   * 根据叶子节点计算 cellKey (与 PivotDataProcessor.buildCellKey 逻辑完全一致)
   * Renderer 独立计算, 不依赖 DataProcessor 实例
   */
  public getCellKey(leaf: IPivotColNode): string {
    // 无列分组: colKey === '__value__' 且无 ancestorColValues
    if (leaf.colKey === '__value__') {
      const ancestors = leaf.ancestorColValues
      if (!ancestors || ancestors.length === 0) {
        // 无列分组退化: colValue 就是字段 label/key
        const vf = this.config.valueFields.find(v => (v.label ?? v.key) === leaf.colValue || v.key === leaf.colValue)
        return vf?.key ?? String(leaf.colValue)
      }
      // 有列分组: 'salary__华东__Product-0'
      const vf = this.config.valueFields.find(v => (v.label ?? v.key) === leaf.colValue || v.key === leaf.colValue)
      return `${vf?.key ?? leaf.colValue}__${ancestors.join('__')}`
    }
    return String(leaf.colValue)
  }

  /** 获取列叶子节点列表（供列宽管理使用） */
  public getColLeaves(): IPivotColNode[] {
    return this.colLeaves
  }

  /** 根据列叶子反查值字段配置 */
  private findValueField(leaf: IPivotColNode): { key: string; aggregation: AggregationType; label?: string; format?: ValueFieldFormat } | undefined {
    const vfKey = String(leaf.colValue)
    return this.config.valueFields.find(v => (v.label ?? v.key) === vfKey || v.key === vfKey)
  }

  /**
   * 数字格式化：千分位分隔符 + 最多 2 位小数（去掉末尾零）
   * - 整数: 1,234,567
   * - 小数: 1,234.56
   * - 非数字: 原样返回
   */
  private formatValue(value: any, format: ValueFieldFormat = 'auto'): string {
    if (value == null || value === '') return ''
    const num = typeof value === 'number' ? value : Number(value)
    if (isNaN(num)) return String(value)
    switch (format) {
      case 'int':
        return Math.round(num).toLocaleString('en-US')
      case 'decimal2':
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      case 'percent':
        return `${(num * 100).toFixed(1)}%`
      default:
        if (Number.isInteger(num)) {
          return num.toLocaleString('en-US')
        }
        // 小数：最多 2 位，去掉末尾零
        const fixed = parseFloat(num.toFixed(2))
        return fixed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    }
  }

  private createValueCell(value: any, extraClass?: string, format?: ValueFieldFormat): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = `vt-table-cell${extraClass ? ' ' + extraClass : ''}`
    cell.textContent = this.formatValue(value, format)
    cell.style.textAlign = 'right'
    cell.style.paddingRight = '12px'
    // 固定宽度120px，确保和表头对齐
    cell.style.minWidth = '120px'
    cell.style.width = '120px'
    cell.style.flex = 'none'
    return cell
  }

  // ─────────────────────────────────────────────
  //  冻结列渲染（行分组列 / 值列 分离渲染）
  // ─────────────────────────────────────────────

  /** 渲染冻结区表头（仅行分组列名） */
  public renderFrozenHeader(colTree: IPivotColNode | null): HTMLDivElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vt-pivot-frozen-header-wrapper'

    // 快速查询 (扁平模式): 每个勾选字段一列, 与行单元格一一对齐
    if (this.config.flatMode) {
      const row = this.createHeaderRow()
      for (const key of this.config.rowGroups) {
        const col = this.columns.find(c => c.key === key)
        const cell = this.createHeaderCell(col?.title ?? key, 1)
        cell.style.minWidth = '120px'
        cell.style.width = '120px'
        row.appendChild(cell)
      }
      wrapper.appendChild(row)
      return wrapper
    }

    const rowGroupLabel = this.config.rowGroups
      .map(key => this.columns.find(c => c.key === key)?.title ?? key)
      .join(' / ')

    const hasColGroups = !!(this.config.colGroups?.length) && colTree && colTree.children.length > 0

    if (!hasColGroups) {
      // Excel 布局: 每个行分组一列表头 (与 body 冻结区列对齐)
      const row = this.createHeaderRow()
      for (const key of this.config.rowGroups) {
        const col = this.columns.find(c => c.key === key)
        const cell = this.createFrozenHeaderCell(col?.title ?? key, 130)
        row.appendChild(cell)
      }
      wrapper.appendChild(row)
    } else {
      const depth = this.getColTreeDepth(colTree)
      const frozenCellWidth = 130 * this.config.rowGroups.length
      for (let d = 0; d < depth; d++) {
        const row = this.createHeaderRow()
        const cell = this.createFrozenHeaderCell(d === 0 ? rowGroupLabel : '', frozenCellWidth)
        row.appendChild(cell)
        wrapper.appendChild(row)
      }
    }
    return wrapper
  }
  
  /** 创建冻结区表头单元格（默认按分组列数自适应宽度） */
  private createFrozenHeaderCell(text: string, width = 130): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell vt-pivot-header-cell'
    cell.textContent = text
    cell.style.fontWeight = 'bold'
    cell.style.minWidth = `${width}px`
    cell.style.width = `${width}px`
    cell.style.flex = 'none'
    return cell
  }

  /** 渲染滚动区表头（仅值列，不含行分组列） */
  public renderScrollHeader(
    colTree: IPivotColNode | null,
    onSort?: (cellKey: string, direction: 'asc' | 'desc' | null) => void
  ): HTMLDivElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vt-pivot-header-wrapper'

    const hasColGroups = !!(this.config.colGroups?.length) && colTree && colTree.children.length > 0
    const currentSort = this.config.sortBy

    if (!hasColGroups) {
      const row = this.createHeaderRow()
      for (const leaf of this.colLeaves) {
        const vfKey = String(leaf.colValue)
        const vf = this.config.valueFields.find(v => (v.label ?? v.key) === vfKey || v.key === vfKey)
        const title = vf ? this.getValueFieldLabel(vf) : vfKey
        const cellKey = vf?.key ?? vfKey
        const isSorted = currentSort?.cellKey === cellKey
        const cell = this.createSortableHeaderCell(title, 1, isSorted ? currentSort!.direction : null)
        cell.dataset.cellKey = cellKey
        if (onSort) {
          cell.style.cursor = 'pointer'
          cell.addEventListener('click', () => {
            const next = !isSorted ? 'desc' : currentSort!.direction === 'desc' ? 'asc' : null
            onSort(cellKey, next)
          })
        }
        row.appendChild(cell)
      }
      wrapper.appendChild(row)
      return wrapper
    }

    const depth = this.getColTreeDepth(colTree)
    for (let d = 0; d < depth; d++) {
      const row = this.createHeaderRow()
      const nodesAtDepth = this.getNodesAtDepth(colTree, d)
      for (const node of nodesAtDepth) {
        const isLeafRow = node.isLeaf
        if (isLeafRow && onSort) {
          const cellKey = this.getCellKey(node)
          const isSorted = currentSort?.cellKey === cellKey
          const leafVf = this.config.valueFields.find(v => (v.label ?? v.key) === node.colValue || v.key === node.colValue)
          const leafLabel = leafVf ? this.getValueFieldLabel(leafVf) : String(node.colValue)
          const cell = this.createSortableHeaderCell(leafLabel, node.leafCount, isSorted ? currentSort!.direction : null)
          cell.dataset.cellKey = cellKey
          cell.style.textAlign = 'center'
          cell.style.cursor = 'pointer'
          cell.addEventListener('click', () => {
            const next = !isSorted ? 'desc' : currentSort!.direction === 'desc' ? 'asc' : null
            onSort(cellKey, next)
          })
          row.appendChild(cell)
        } else {
          const cell = this.createHeaderCell(String(node.colValue), node.leafCount)
          cell.style.textAlign = 'center'
          row.appendChild(cell)
        }
      }
      wrapper.appendChild(row)
    }
    return wrapper
  }

  /** 渲染冻结区行单元格（行分组标签） */
  public renderRowFrozenPart(flatRow: IPivotFlatRow): HTMLDivElement {
    // 快速查询 (扁平模式): 每个勾选字段单独一列, 相邻同值不合并
    if (this.config.flatMode) {
      const row = document.createElement('div')
      row.className = 'vt-table-row vt-pivot-scroll-row'
      if (flatRow.rowType === 'grandtotal') row.classList.add('vt-pivot-row-grandtotal')

      const groupKeys = this.config.rowGroups
      groupKeys.forEach((key, i) => {
        const cell = document.createElement('div')
        cell.className = 'vt-table-cell vt-pivot-frozen-cell'
        if (flatRow.rowType === 'grandtotal') cell.classList.add('vt-pivot-row-grandtotal')
        cell.style.minWidth = '120px'
        cell.style.width = '120px'
        cell.style.flex = 'none'
        cell.style.paddingLeft = '12px'
        cell.style.overflow = 'hidden'
        cell.style.textOverflow = 'ellipsis'
        cell.style.whiteSpace = 'nowrap'

        if (flatRow.rowType === 'grandtotal') {
          if (i === 0) {
            cell.textContent = '总计'
            cell.style.fontWeight = '700'
            cell.style.color = '#1f2937'
          }
        } else {
          cell.textContent = String(flatRow.data[key] ?? '')
        }
        row.appendChild(cell)
      })

      // 总计行: 剩余未渲染的字段列保持空位 (与第一列"总计"同行)
      return row
    }

    // Excel 树形模式: 每个 rowGroup 一列, 对标 Excel 透视表左侧多列层级
    //  - 组行:   本层列显示组值 + 展开图标, 深层列留空 (Excel 父行行为)
    //  - 数据行: 显示完整路径值 (每层一值, 对齐表头各分组列)
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-pivot-frozen-row'
    if (flatRow.rowType === 'subtotal') row.classList.add('vt-pivot-row-subtotal')
    else if (flatRow.rowType === 'grandtotal') row.classList.add('vt-pivot-row-grandtotal')
    if (flatRow.type === 'group') {
      row.classList.add('vt-pivot-group-row')
      row.classList.add(`vt-pivot-group-row--l${Math.min(flatRow.level, 2)}`)
    }

    const groupKeys = this.config.rowGroups
    groupKeys.forEach((key, colIdx) => {
      const cell = document.createElement('div')
      cell.className = 'vt-table-cell vt-pivot-frozen-cell'
      cell.style.minWidth = '130px'
      cell.style.width = '130px'
      cell.style.flex = 'none'
      cell.style.paddingLeft = '12px'
      cell.style.overflow = 'hidden'
      cell.style.textOverflow = 'ellipsis'
      cell.style.whiteSpace = 'nowrap'

      if (flatRow.rowType === 'subtotal') {
        if (colIdx === 0) {
          cell.textContent = '小计'
          cell.style.fontWeight = '600'
          cell.style.color = '#374151'
        }
      } else if (flatRow.rowType === 'grandtotal') {
        if (colIdx === 0) {
          cell.textContent = '总计'
          cell.style.fontWeight = '700'
          cell.style.color = '#1f2937'
        }
      } else if (flatRow.type === 'group') {
        if (colIdx === flatRow.level) {
          cell.classList.add('vt-pivot-group-cell')
          cell.style.paddingLeft = '8px'
          const expandIcon = document.createElement('span')
          expandIcon.className = 'vt-pivot-expand-icon'
          expandIcon.textContent = flatRow.isExpanded ? '▼' : '▶'
          cell.appendChild(expandIcon)
          const groupLabel = document.createElement('span')
          groupLabel.className = 'vt-pivot-group-label'
          groupLabel.textContent = String(flatRow.data[key] ?? '(空)')
          cell.appendChild(groupLabel)
          if (flatRow.rowCount) {
            const badge = document.createElement('span')
            badge.className = 'vt-pivot-count-badge'
            badge.textContent = `(${flatRow.rowCount})`
            cell.appendChild(badge)
          }
        }
      } else {
        // 数据行: 完整路径值, 与表头各分组列一一对应
        cell.textContent = String(flatRow.data[key] ?? '')
      }
      row.appendChild(cell)
    })

    return row
  }

  /** 渲染滚动区行（仅值列） */
  public renderRowScrollPart(flatRow: IPivotFlatRow): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-pivot-scroll-row'

    if (flatRow.rowType === 'subtotal') row.classList.add('vt-pivot-row-subtotal')
    else if (flatRow.rowType === 'grandtotal') row.classList.add('vt-pivot-row-grandtotal')
    if (flatRow.type === 'group') {
      row.classList.add('vt-pivot-group-row')
      row.classList.add(`vt-pivot-group-row--l${Math.min(flatRow.level, 2)}`)
    }

    for (const leaf of this.colLeaves) {
      const cellKey = this.getCellKey(leaf)
      const extraClass = (flatRow.rowType === 'subtotal' || flatRow.rowType === 'grandtotal')
        ? 'vt-pivot-total-value-cell'
        : (flatRow.type === 'group' ? 'vt-pivot-agg-cell' : undefined)
      const vf = this.findValueField(leaf)
      const cell = this.createValueCell(flatRow.data[cellKey], extraClass, vf?.format)
      if (flatRow.rowType === 'grandtotal') cell.style.fontWeight = '700'
      else if (flatRow.rowType === 'subtotal') cell.style.fontWeight = '600'
      row.appendChild(cell)
    }

    return row
  }

  public updateConfig(config: IPivotConfig, columns: IColumn[]): void {
    this.config = config
    this.columns = columns
  }
}