import type { IPivotConfig, IPivotFlatRow, IPivotColNode } from "@/types/pivot";
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
  public renderHeader(colTree: IPivotColNode | null): HTMLDivElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'vt-pivot-header-wrapper'

    const rowGroupLabel = this.config.rowGroups
      .map(key => this.columns.find(c => c.key === key)?.title ?? key)
      .join(' / ')

    const hasColGroups = !!(this.config.colGroups?.length) && colTree && colTree.children.length > 0

    if (!hasColGroups) {
      // ── 无列分组: 单行表头 ──
      const row = this.createHeaderRow()
      row.appendChild(this.createHeaderCell(rowGroupLabel, 1))
      for (const leaf of this.colLeaves) {
        const vfKey = String(leaf.colValue)
        const vf = this.config.valueFields.find(v => (v.label ?? v.key) === vfKey || v.key === vfKey)
        const title = vf ? `${vf.label ?? this.columns.find(c => c.key === vf.key)?.title ?? vf.key}(${vf.aggregation})` : vfKey
        row.appendChild(this.createHeaderCell(title, 1))
      }
      wrapper.appendChild(row)
      return wrapper
    }

    // ── 有列分组: 多行表头 ──
    const depth = this.getColTreeDepth(colTree)  // 不含根节点

    for (let d = 0; d < depth; d++) {
      const row = this.createHeaderRow()
      // 第一列
      row.appendChild(this.createHeaderCell(d === 0 ? rowGroupLabel : '', 1))

      const nodesAtDepth = this.getNodesAtDepth(colTree, d)
      for (const node of nodesAtDepth) {
        const cell = this.createHeaderCell(String(node.colValue), node.leafCount)
        cell.style.textAlign = 'center'
        row.appendChild(cell)
      }
      wrapper.appendChild(row)
    }

    return wrapper
  }

  private createHeaderRow(): HTMLDivElement {
    const row = document.createElement('div')
    row.className = 'vt-table-row vt-pivot-header'
    return row
  }

  private createHeaderCell(text: string, flex: number): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = 'vt-table-cell vt-pivot-header-cell'
    cell.textContent = text
    cell.style.fontWeight = 'bold'
    cell.style.flex = String(flex)
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
    const queue: IPivotColNode[] = [...root.children]
    for (const node of queue) {
      if (node.level === targetDepth) {
        result.push(node)
      } else if (node.level < targetDepth) {
        queue.push(...node.children)
      }
    }
    return result
  }

  // ─────────────────────────────────────────────
  //  行渲染
  // ─────────────────────────────────────────────

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
  private getCellKey(leaf: IPivotColNode): string {
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

  /**
   * 数字格式化：千分位分隔符 + 最多 2 位小数（去掉末尾零）
   * - 整数: 1,234,567
   * - 小数: 1,234.56
   * - 非数字: 原样返回
   */
  private formatValue(value: any): string {
    if (value == null || value === '') return ''
    const num = typeof value === 'number' ? value : Number(value)
    if (isNaN(num)) return String(value)
    if (Number.isInteger(num)) {
      return num.toLocaleString('en-US')
    }
    // 小数：最多 2 位，去掉末尾零
    const fixed = parseFloat(num.toFixed(2))
    return fixed.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  private createValueCell(value: any, extraClass?: string): HTMLDivElement {
    const cell = document.createElement('div')
    cell.className = `vt-table-cell${extraClass ? ' ' + extraClass : ''}`
    cell.textContent = this.formatValue(value)
    cell.style.textAlign = 'right'
    cell.style.paddingRight = '12px'
    return cell
  }

  public updateConfig(config: IPivotConfig, columns: IColumn[]): void {
    this.config = config
    this.columns = columns
  }
}