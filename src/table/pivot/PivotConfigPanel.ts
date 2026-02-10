import type { IPivotConfig, AggregationType } from "@/types/pivot";
import type { IColumn } from "@/types";

/**
 * 透视表 配置面板 (mvp 简化版)
 * 
 * 职责: 
 * 1. 提供分组字段选择 (下拉框)
 * 2. 提供数值字段选择 (复选框 + 聚合方式)
 * 3. 配置变化时通知外部重新构建透视树
 * 
 * MVP 版本使用下来宽和复选框, 后续可升级为拖拽
 */
export class PivotConfigPanel {
  private config: IPivotConfig
  private columns: IColumn[]
  private onChange: (cofig: IPivotConfig) => void
  private container: HTMLDivElement | null = null 

  constructor(
    config: IPivotConfig,
    columns: IColumn[],
    onChage: (config: IPivotConfig) => void
  ) {
    this.config = config
    this.columns = columns
    this.onChange = onChage
  }

  /** 渲染配置面板 */
  public render(): HTMLDivElement {
    const panel = document.createElement('div')
    panel.className = 'pivot-config-panel'
    this.container = panel

    // 标题
    const title = document.createElement('div')
    title.className = 'pivot-config-title'
    title.textContent = '透视表配置'
    panel.appendChild(title)

    // 行分组选择区域
    panel.appendChild(this.createRowGroupSection())

    // 分割线 
    const divider = document.createElement('hr')
    divider.style.border = 'none'
    divider.style.borderTop = '1px solid #e5e7eb'
    divider.style.margin = '12px 0'
    panel.appendChild(divider)

    // 数值字段选择区域
    panel.appendChild(this.createValueFieldsSection())

    return panel
  }

  /** 创建行分组选择器 */
  private createRowGroupSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.className = 'pivot-config-section'

    const label = document.createElement('div')
    label.className = 'pivot-config-label'
    label.textContent = '行分组字段'
    section.appendChild(label)

    const select = document.createElement('select')
    select.className = 'pivot-select'

    // 添加选项: 所有列都可以作为分组字段
    for (const col of this.columns) {
      const option = document.createElement('option')
      option.value = col.key
      option.textContent = col.title
      option.selected = col.key === this.config.rowGroup
      select.appendChild(option)
    }

    // 监听变化
    select.addEventListener('change', () => {
      this.config.rowGroup = select.value 
      this.onChange({...this.config})
    })

    section.appendChild(select)
    return section
  }

  /** 创建数值字段选择器 */
  private createValueFieldsSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.className = 'pivot-config-section'

    const label = document.createElement('div')
    label.className = 'pivot-config-label'
    label.textContent = '数值字段'
    section.appendChild(label)

    const list = document.createElement('div')
    list.className = 'pivot-value-fields-list'

    // 为每列创建一个选项行
    for (const col of this.columns) {
      // 跳过分组字段本身
      if (col.key === this.config.rowGroup) continue 

      const item = document.createElement('div')
      item.className = 'pivot-value-field-item'
      // 复选框
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.id = `pivot-vf-${col.key}`
      checkbox.checked = this.config.valueFields.some(vf => vf.key === col.key)

      // 字段名 
      const fieldLabel = document.createElement('label')
      fieldLabel.htmlFor = `pivot-vf-${col.key}`
      fieldLabel.textContent = col.title
      fieldLabel.style.flex = '1'

      // 聚合方式下拉框
      const aggSelect = document.createElement('select')
      aggSelect.className = 'pivot-agg-select'
      const aggTypes: AggregationType[] = ['sum', 'count', 'avg', 'min', 'max']
      for (const agg of aggTypes) {
        const opt = document.createElement('option')
        opt.value = agg
        opt.textContent = agg
        // 若已选中, 恢复之前的聚合方式
        const exsiting = this.config.valueFields.find(vf => vf.key === col.key)
        opt.selected = exsiting?.aggregation === agg 
        aggSelect.appendChild(opt)
      }
      // 未选中时, 默认用 summaryType 或者 sum 聚合
      if (!checkbox.checked) {
        aggSelect.value = col.summaryType && col.summaryType !== 'none'
          ? col.summaryType
          : 'sum'
      }
      aggSelect.disabled = !checkbox.checked 

      // 复选框变化事件
      checkbox.addEventListener('change', () => {
        aggSelect.disabled = !checkbox.checked 
        this.updateValueFields()
      })

      // 聚合方式变化事件
      aggSelect.addEventListener('change', () => {
        this.updateValueFields()
      })

      // 挂载
      item.appendChild(checkbox)
      item.appendChild(fieldLabel)
      item.appendChild(aggSelect)
      list.appendChild(item)
    }

    section.appendChild(list)
    return section 
  }

  /** 从 dom 状态 收集 valueFields 并触发 onChange */
  private updateValueFields(): void {
    if (!this.container) return 

    const newValueFields: IPivotConfig['valueFields'] = []
    const items = this.container.querySelectorAll('.pivot-value-field-item')

    items.forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
      const aggSelect = item.querySelector('.pivot-agg-select') as HTMLSelectElement

      if (checkbox?.checked) {
        // 从 checkbox id 提取 key 
        const key = checkbox.id.replace('pivot-vf-', '')
        const col = this.columns.find(c => c.key === key)
        newValueFields.push({
          key,
          aggregation: aggSelect.value as AggregationType,
          label: col?.title
        })
      }
    })

    this.config.valueFields = newValueFields
    this.onChange({...this.config})
  }
}