import type { IPivotConfig, IPivotFlatRow } from "@/types/pivot";
import { IColumn } from "@/types";

/**
 * 透视表渲染器
 * 
 * 职责: 
 * 1. 渲染透视表 表头
 * 2. 渲染分组行 (带展开/折叠图标 + 聚合值)
 * 3. 渲染数据行 (带缩进)
 * 
 * 渲染原理: 
 * 分组行: [展开图标] [分组值 (count)] | 聚合值1 | 聚合值2 | ...
 * 数据行:      [缩进] 值1 | 值2 | ...
 */
export class PivotRenderer {
  private config: IPivotConfig
  private columns: IColumn[]

  constructor(config: IPivotConfig, columns: IColumn[]) {
    this.config = config
    this.columns = columns
  }
  
  /** 
   * 渲染透视表表头
   * 
   * 表头结构: 分组字段 | 数值字段1 | 数值字段2 | ...
   */
  public renderHeader(): HTMLDivElement {
    const header = document.createElement('div')
    header.className = 'table-row pivot-header'

    // 第一列: 分组字段 (多个时用 "/" 连接)
    const rowGroups = this.config.rowGroups
    const groupLabels = rowGroups.map(key => {
      const col = this.columns.find(c => c.key === key)
      return col?.title || key 
    })

    const firstCell = document.createElement('div')
    firstCell.className = 'table-cell pivot-header-cell'
    firstCell.textContent = groupLabels.join('/') // 如: "大区/城市"
    firstCell.style.fontWeight = 'bold'
    header.appendChild(firstCell)

    // 后续列: 数值字段
    for (const valueField of this.config.valueFields) {
      const col = this.columns.find(c => c.key === valueField.key)
      const cell = document.createElement('div')
      cell.className = 'table-cell pivot-header-cell'
      // 显示: 字段名(聚合方式), 如 "销售额(sum)"
      const label = valueField.label || col?.title || valueField.key
      cell.textContent = `${label}(${valueField.aggregation})`
      cell.style.fontWeight = 'bold'
      header.appendChild(cell)
    }
    return header
  }

  /**
   * 渲染一行 (分组行 or 数据行)
   * 
   * @param flatRow 展平后的行数据
   * @returns 渲染好的 dom 元素
   */
  public renderRow(flatRow: IPivotFlatRow, rowIndex: number): HTMLDivElement {

    const row = document.createElement('div')
    row.className = 'table-row pivot-row'
    row.dataset.nodeId = flatRow.nodeId
    row.dataset.type = flatRow.type
    row.dataset.level = String(flatRow.level)

    // 根据 rowType 添加特殊样式类
    if (flatRow.rowType === 'subtotal') {
      row.classList.add('pivot-row-subtotal')

    } else if (flatRow.rowType === 'grandtotal') {
      row.classList.add('pivot-row-grandtotal')
    }

    // 小计行 和 总计行 的特殊渲染
    if (flatRow.rowType === 'subtotal' || flatRow.rowType === 'grandtotal') {
      this.renderTotalRow(row, flatRow)

    } else if  (flatRow.type === 'group') {
      this.renderGroupRow(row, flatRow)

    } else {
      this.renderDataRow(row, flatRow)
    }

    return row
  }

  /**
   * 渲染分组行
   * 
   * 结构: [▶/▼ 图标] [分组值 (行数)] | 聚合值1 | 聚合值2 | ...
   */
  private renderGroupRow(row: HTMLDivElement, flatRow: IPivotFlatRow): void {
    row.classList.add('pivot-group-row')
    // 缩进量: 每层 20px 
    const indent = flatRow.level * 20

    // 第一个单元格: 展开图标 + 分组值
    const firstCell = document.createElement('div')
    firstCell.className = 'table-cell pivot-group-cell'
    firstCell.style.paddingLeft = `${indent + 8}px`

    // 展开 / 折叠 图标
    const expandIcon = document.createElement('span')
    expandIcon.className = 'pivot-expand-icon'
    expandIcon.textContent = flatRow.isExpanded ? '▼' : '▶'
    firstCell.appendChild(expandIcon)

    // 分组值 + 行数
    const groupLabel = document.createElement('span')
    groupLabel.className = 'pivot-group-label'
    const currentGroupKey = this.config.rowGroups[flatRow.level] || this.config.rowGroups[0]
    const groupValue = flatRow.data[currentGroupKey] ?? '(空)'
    groupLabel.textContent = `${groupValue}`
    firstCell.appendChild(groupLabel)

    // 行数标记
    const countBadge = document.createElement('span')
    countBadge.className = 'pivot-count-badge'
    // 从聚合数据中找 count 或者用 valuesFields 中的 count 字段
    const countField = this.config.valueFields.find(vf => vf.aggregation === 'count') 
    const count = countField ? flatRow.data[countField.key] : ''
    if (count) {
      countBadge.textContent = `(${count})`
    }

    firstCell.appendChild(countBadge)
    row.appendChild(firstCell)

    // 后续单元格: 聚合值
    for (const valueField of this.config.valueFields) {
      const cell = document.createElement('div')
      cell.className = 'table-cell pivot-agg-cell'
      const value = flatRow.data[valueField.key]
      cell.textContent = value !== null ? String(value): ''
      // 设置数值字段都右对齐 (感觉应该不起作用)
      cell.style.textAlign = 'right'
      cell.style.paddingRight = '12px'

      row.appendChild(cell)
    }
  }

  /**
   * 渲染数据行
   * 
   * 结构: [缩进] 分组字段值 | 值1 | 值2 | ...
   */
  private renderDataRow(row: HTMLDivElement, flatRow: IPivotFlatRow): void {
    row.classList.add('pivot-data-row')
    // 缩进量
    const indent = flatRow.level * 20

    // 第一列: 分组字段值 (带缩进)
    const firstCell = document.createElement('div')
    firstCell.className = 'table-cell'
    firstCell.style.paddingLeft = `${indent + 28}px` // 20px 图标 + 8px padding
    const firstKey = Object.keys(flatRow.data)[0]
    firstCell.textContent = String(flatRow.data[firstKey] ?? '')

    row.appendChild(firstCell)

    // 后续列: 数值字段值
    for (const valueField of this.config.valueFields) {
      const cell = document.createElement('div')
      cell.className = 'table-cell'
      const value = flatRow.data[valueField.key]
      cell.textContent = value != null ? String(value) : ''
      cell.style.textAlign = 'right'
      cell.style.paddingRight = '12px'
      row.appendChild(cell)
    }
  }

  /** 
   * 渲染小计行 和 总计行
   * 
   * 结构: [缩进] 小计/总计 | 聚合值1 | 聚合值2 | ...
   */
  public renderTotalRow(row: HTMLDivElement, flatRow: IPivotFlatRow): void {
    // 第一列: 小计/总计 标签
    const fisrtCell = document.createElement('div')
    fisrtCell.className = 'table-cell pivot-total-cell'

    if (flatRow.rowType === 'subtotal') {
      // 小计行: 缩进与子项对齐
      const indent = (flatRow.level + 1) * 20
      fisrtCell.style.paddingLeft = `${indent + 8}px`
      fisrtCell.textContent = '小计'
      fisrtCell.style.color = '#374151'
      fisrtCell.style.fontWeight = '600'

    } else if (flatRow.rowType === 'grandtotal') {
      // 总计行: 左对齐
      fisrtCell.style.paddingLeft = '12px'
      fisrtCell.textContent = '总计'
      fisrtCell.style.fontWeight = '700'
      fisrtCell.style.color = '#1f2937'
    }

    row.appendChild(fisrtCell)

    // 后续列: 聚合值
    for (const valueField of this.config.valueFields) {
      const cell = document.createElement('div')
      cell.className = 'table-cell pivot-total-value-cell'

      const value = flatRow.data[valueField.key]
      cell.textContent = value !== null ? String(value) : ''

      cell.style.textAlign = 'right'
      cell.style.fontWeight = flatRow.rowType === 'grandtotal' ? '700': '600'
      row.appendChild(cell)
    }
  }

  /** 更新配置 */
  public updateConfig(config: IPivotConfig, columns: IColumn[]): void {
    this.config = config 
    this.columns = columns
  }
}