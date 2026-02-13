import type { IPanel } from "@/table/panel/IPanel";
import type { TableStore } from "@/table/state/createTableStore";
import type { IColumn } from "@/types";
import type { IPivotConfig, AggregationType } from "@/types/pivot";

/**
 * 这个面板已继集成到 列管理 中了, 目前已弃用, 但先留着吧, 万一后面想要该方案呢 !!!
 */

/**
 * 透视表配置面板: 集成到有侧边栏的面板 
 * 
 * 职责: 
 * 1. 提供分组字段选择 (下拉框, 后续改拖拽)
 * 2. 提供数值字段选择 (复选框 + 聚合方式)
 * 3. 配置变化时通知 VirtualTable 刷新透视表
 * 
 * 与独立的 PivotConfigPanel 的区别: 
 * - 实现了 IPanel 接口, 可以被 SidePanelManager 接管
 * - 通过 onConfigChange 回调与 VirtualTable 通信
 */
export class PivotPanelImpl implements IPanel {
  private container: HTMLDivElement
  private listContainer: HTMLDivElement | null = null 
  private pivotConfig: IPivotConfig 

  constructor(
    private store: TableStore,
    private columns: IColumn[],
    private onConfigChange: (config: IPivotConfig) => void 
  ) {
    this.pivotConfig = this.createDefaultConfig()
    this.container = this.render()
  }

  /** 创建默认透视配置 */
  private createDefaultConfig(): IPivotConfig {
    const groupCol = this.columns[1] // 约定默认第二个字段作为分组字段, 第一个字段为id
    const valueFields = this.columns 
      .filter(col => col.summaryType && col.summaryType !== 'none')
      .map(col => ({
        key: col.key,
        aggregation: (col.summaryType || 'sum') as AggregationType,
        lable: col.title 
      }))
  
    return {
      enabled: true,
      rowGroup: groupCol?.key || '',
      valueFields: valueFields.length > 0 ? valueFields : []
    }
  }

  /** 渲染面板 */
  private render(): HTMLDivElement {
    const container = document.createElement('div')
    container.className = 'pivot-panel'
    // 标题
    const header = document.createElement('div')
    header.className = 'pivot-panel-header'
    header.innerHTML = `
      <h3 class="pivot-panel-header">透视表配置</h3>
      <p class="pivot-panel-desc">选择分组字段和数值字段</p>
    `
    container.appendChild(header)
    // 行分组选择区域
    container.appendChild(this.createRowGroupSection())
    // 分割线
    const divider = document.createElement('hr')
    divider.style.border = 'none'
    divider.style.borderTop = '1px solid #e5e7eb'
    divider.style.margin = '12px 0'
    container.appendChild(divider)
    // 数值字段选择区域
    this.listContainer = document.createElement('div')
    this.listContainer.className = 'pivot-config-section'
    // label 
    const label = document.createElement('div')
    label.className = 'pivot-config-label'
    label.textContent = '数值字段'
    this.listContainer.appendChild(label)
    // list
    const list = document.createElement('div')
    list.className = 'pivot-value-fields-list'
    this.listContainer.appendChild(list)
    container.appendChild(this.listContainer)
    // 渲染数值字段列表
    this.renderValueFieldsList(list)

    return container 
  }

  /** 创建行分组选择器 */
  private createRowGroupSection(): HTMLDivElement {
    const section = document.createElement('div')
    section.className = 'pivot-config-label'

    const label = document.createElement('div')
    label.className = 'pivot-config-label'
    label.textContent = '行分组字段'
    section.appendChild(label)

    const select = document.createElement('select')
    select.className = 'pivot-select'

    // 渲染出每个下拉框选项的字段名
    for (const col of this.columns) {
      const option = document.createElement('option')
      option.value = col.key
      option.textContent = col.title
      option.selected = col.key === this.pivotConfig.rowGroup
      select.appendChild(option)
    }

    // 监听字段选择的变化, 并 emit 出去, 通知外部变化
    select.addEventListener('change', () => {
      this.pivotConfig.rowGroup = select.value
      this.notifyChange()
    })

    section.appendChild(select)
    return section
  }

  /** 渲染数值字段列表 */
  private renderValueFieldsList(list: HTMLDivElement): void {
    for (const col of this.columns) {
      // 分组字段就跳过, 数值字段才保留
      if (col.key === this.pivotConfig.rowGroup) continue 

      const item = document.createElement('div')
      item.className = 'pivot-value-field-item'

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.id = `pivot-panel-vf-${col.key}`
      checkbox.checked = this.pivotConfig.valueFields.some(vf => vf.key === col.key)

      const fieldLabel = document.createElement('label')
      fieldLabel.htmlFor = `pivot-panel-vf-${col.key}`
      fieldLabel.textContent = col.title
      fieldLabel.style.flex = '1'

      // 聚合字段右侧的聚合方法选择下拉框
      const aggSelect = document.createElement('select')
      aggSelect.className = 'pivot-agg-select'
      const aggTypes: AggregationType[] = ['sum', 'count', 'avg', 'max', 'min']
      
      for (const aggType of aggTypes) {
        const option = document.createElement('option')
        option.value = aggType
        option.textContent = aggType

        const existing = this.pivotConfig.valueFields.find(vf => vf.key === col.key)
        option.selected = existing?.aggregation === aggType
        aggSelect.appendChild(option)
      }

      // 数值字段若没有配置 summaryType 则默认用 sum 
      if (!checkbox.checked) {
        aggSelect.value = (col.summaryType && col.summaryType !== 'none') ? col.summaryType : 'sum'
      }
      aggSelect.disabled = !checkbox.checked

      // 收集 透视表的数值字段变化, 并触发回调
      checkbox.addEventListener('change', () => {
        this.collectValueFields()
      })

      item.appendChild(checkbox)
      item.appendChild(fieldLabel)
      item.appendChild(aggSelect)
      list.appendChild(item)
    }
  }

  /** 从 dom 状态收集 valueFields 并触发回调 */
  private collectValueFields(): void {
    const newValueFields: IPivotConfig['valueFields'] = []
    const items = this.container.querySelectorAll('.pivot-value-field-item')

    items.forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
      const aggSelect = item.querySelector('.pivot-agg-select') as HTMLSelectElement

      if (checkbox?.checked) {
        const key = checkbox.id.replace('pivot-panel-vf-', '')
        const col = this.columns.find(col => col.key === key)

        newValueFields.push({
          key, 
          aggregation: aggSelect.value as AggregationType,
          label: col?.title
        })
      }
    })

    this.pivotConfig.valueFields = newValueFields
    this.notifyChange()
  }

  /** 通知外部配置变化 */
  private notifyChange(): void {
    this.onConfigChange({ ...this.pivotConfig })
  }

  /** 获取当前透视配置 */
  public getConfig(): IPivotConfig {
    return { ...this.pivotConfig }
  }

  // ==== IPanel 接口实现 =======
  public getContainer(): HTMLDivElement {
    return this.container
  }

  public onShow(): void {
    this.notifyChange()
  }

  public onHide(): void {
    // 不处理任何
  }

  public destroy(): void {
    this.container.remove()
  }

}

/** 工厂函数, 提供给 PanelRegistry 使用 */
export const createPivotPanel = (
  store: TableStore,
  columns: IColumn[],
  onConfigChange: (config: IPivotConfig) => void 
  
): IPanel => {
  return new PivotPanelImpl(store, columns, onConfigChange)
}