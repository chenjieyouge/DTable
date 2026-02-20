import type { IPanel } from "@/table/panel/IPanel";
import type { TableStore } from "@/table/state/createTableStore";
import type { IColumn } from "@/types";
import type { IPivotConfig, AggregationType } from "@/types/pivot";

/**
 * 列管理面板: 管理列的显示, 隐藏, 搜索, 全选, 重置
 * 
 * 职责: 
 * 1. 渲染列管理 UI (搜索框, 列列表, 操作按钮)
 * 2. 响应用户操作, dispatch -> action -> store
 * 3. 订阅 store 变化, 更新 UI 状态
 */
export class ColumnPanel implements IPanel {
  private container: HTMLDivElement
  private unsubscribe: (() => void) | null = null 
  private searchInput: HTMLInputElement | null = null 
  private listContainer: HTMLDivElement | null = null 
  private allColumnKeys: string[] = [] // 保存所有列的 key, 包括隐藏的
  private pivotConfgSection: HTMLDivElement | null = null 
  private currentGroupKeys: string[] = []  // 保存当前选中的多层分组字段

  constructor(
    private store: TableStore,
    private originalColumns: IColumn[],
    private onPivotModeToggle?: (enabled: boolean) => void,
    private onPivotConfigChange?: (config: any) => void,

  ) {
    this.allColumnKeys = originalColumns.map(col => col.key)
    this.container = this.render()
  }

  private render(): HTMLDivElement {
    const container = document.createElement('div')
    container.className = 'column-panel'

    // Pivot Mode 开关
    const pivotToggleRow = document.createElement('div')
    pivotToggleRow.className = 'column-panel-pivot-toggle'

    const pivotLable = document.createElement('span')
    pivotLable.className = 'pivot-mode-title'
    pivotLable.textContent = 'Pivot'
    
    const pivotSwitch = document.createElement('label')
    pivotSwitch.className = 'pivot-switch'

    const pivotInput = document.createElement('input')
    pivotInput.className = 'pivot-switch-input'
    pivotInput.type = 'checkbox'

    const pivotSlider = document.createElement('span')
    pivotSlider.className = 'pivot-switch-slider'

    pivotSwitch.appendChild(pivotInput)
    pivotSwitch.appendChild(pivotSlider)
    pivotToggleRow.appendChild(pivotLable)
    pivotToggleRow.appendChild(pivotSwitch)
    container.appendChild(pivotToggleRow)

    // Pivot 配置区, 默认隐藏
    this.pivotConfgSection = document.createElement('div')
    this.pivotConfgSection.className = 'column-panel-pivot-config'
    this.pivotConfgSection.style.display = 'none'
    container.appendChild(this.pivotConfgSection)

    // 开关事件
    pivotInput.addEventListener('change', () => {
      const enabled = pivotInput.checked
      this.onPivotModeToggle?.(enabled)
      this.pivotConfgSection!.style.display = enabled ? 'block': 'none'
      if (enabled) {
        this.renderPivotConfig()
      }
    })


    // 搜索框 (暂时保留, 后续实现)
    const searchBox = document.createElement('div')
    searchBox.className = 'column-panel-search'
    this.searchInput = document.createElement('input')
    this.searchInput.type = 'text'
    this.searchInput.className = 'column-panel-search-input'
    this.searchInput.placeholder = '搜索列名...'
    searchBox.appendChild(this.searchInput)
    container.appendChild(searchBox)

    // 列列表容器
    this.listContainer = document.createElement('div')
    this.listContainer.className = 'column-panel-list'
    container.appendChild(this.listContainer)

    // 底部操作按钮
    const footer = document.createElement('div')
    footer.className = 'column-panel-footer'

    const btnShowAll = document.createElement('button')
    btnShowAll.className = 'column-panel-btn'
    btnShowAll.textContent = '全选'

    const btnHideAll = document.createElement('button')
    btnHideAll.className = 'column-panel-btn'
    btnHideAll.textContent = '全隐藏'

    const btnReset = document.createElement('button')
    btnReset.className = 'column-panel-btn'
    btnReset.textContent = '重置'

    footer.appendChild(btnShowAll)
    footer.appendChild(btnHideAll)
    footer.appendChild(btnReset)
    container.appendChild(footer)

    // 绑定事件
    this.bindEvents(btnShowAll, btnHideAll, btnReset)
    return container
  }

  // 绑定事件
  private bindEvents(
    btnShowAll: HTMLButtonElement,
    btnHideAll: HTMLButtonElement,
    btnReset: HTMLButtonElement
  ): void {
    // 全选
    btnShowAll.onclick = () => {
      const state = this.store.getState()
      const hiddenKeys = state.columns.hiddenKeys
      this.store.dispatch({ type: 'COLUMN_BATCH_SHOW', payload: {keys: hiddenKeys} })
    }
    // 全隐藏
    btnHideAll.onclick = () => {
      const state = this.store.getState()
      const allKeys = state.columns.order
      this.store.dispatch({ type: 'COLUMN_BATCH_HIDE', payload: {keys: allKeys }})
    }
    // 重置
    btnReset.onclick = () => {
      this.store.dispatch({ type: 'COLUMNS_RESET_VISIBILITY', payload: {}})
    }
    // 搜索 (暂不实现, 保持简单)
    // this.searchInput?.addEventListener('input', () => {
    //   this.renderList()
    // })
  }

  // IPane 接口约定方法, 强制实现
  public getContainer(): HTMLDivElement {
    return this.container
  }

  public onShow(): void {
    if (!this.store) {
      console.error('[ColumnPanel] store 未初始化')
      return 
    }
    // 订阅 store 变化, 实时更新列表
    this.unsubscribe = this.store.subscribe(() => {
      this.renderList()
    })
    // 首次渲染列表
    this.renderList()
  }

  // 渲染列列表
  public renderList(): void {
    if (!this.listContainer || !this.store) return 

    const state = this.store.getState()
    const currentOrder = state.columns.order // 当前列顺序, 拖拽后会变化
    const hiddenKeys = state.columns.hiddenKeys // 隐藏的列 key

    // 构建完整列表, 按 currentOrder 显示, 然后补充缺失的列
    const allKeys = [...currentOrder]
    this.allColumnKeys.forEach(key => {
      if (!allKeys.includes(key)) {
        allKeys.push(key)
      }
    })

    // 清空列表
    this.listContainer.innerHTML = ''
    // 渲染每一列
    allKeys.forEach((key, index) => {
      const col = this.originalColumns.find(c => c.key === key)
      if (!col) return 
      const isVisible = !hiddenKeys.includes(key)
      // 每个列表项
      const item = document.createElement('div')
      item.className = 'column-panel-item'
      item.draggable = true // 开启可拖拽
      item.dataset.columnKey = key 
      item.dataset.index = String(index)

      // 给隐藏列添加样式提示
      if (!isVisible) {
        item.classList.add('column-panel-item--hidden')
      }

      // 拖拽图标, 出现在每列元素左侧
      const dragHandle = document.createElement('span')
      dragHandle.className = 'column-panel-drag-handle'
      dragHandle.textContent = '⋮⋮'
      item.appendChild(dragHandle)

      // 复选框
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = isVisible
      checkbox.id = `col-panel-${key}`
      // 切换显示/隐藏
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.store.dispatch({ type: 'COLUMN_SHOW', payload: { key }})
        } else {
          this.store.dispatch({ type: 'COLUMN_HIDE', payload: { key }})
        }
      }

      const label = document.createElement('label')
      label.htmlFor = `col-panel-${key}`
      label.textContent = col.title
      // 挂载
      item.appendChild(checkbox)
      item.appendChild(label)
      // 绑定拖拽事件
      this.bindDragEvents(item)
      this.listContainer?.appendChild(item)
    })
  }

  /** 绑定拖拽事件 */
  private bindDragEvents(item: HTMLDivElement): void {
    // 拖拽开始
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging')
      e.dataTransfer!.effectAllowed = 'move'  // 拖拽只允许 'move' 效果
    })

    // 拖拽结束
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging')
      // 移除所有插入提示
      this.listContainer?.querySelectorAll('.drop-indicator').forEach(el => el.remove())
    })

    // 拖拽经过时的视觉反馈
    item.addEventListener('dragover', (e) => {
      e.preventDefault()

      const draggingItem = this.listContainer?.querySelector('.dragging')
      if (!draggingItem || draggingItem === item) return 

      const rect = item.getBoundingClientRect()
      const midY = rect.top + rect.height / 2 

      // 先移除之前的提示线
      this.listContainer?.querySelectorAll('.drop-indicator').forEach(el => el.remove())
      // 再添加蓝色提示线
      const indicator = document.createElement('div')
      indicator.className = 'drop-indicator'

      if (e.clientY < midY) {
        item.parentNode?.insertBefore(indicator, item)
        item.parentNode?.insertBefore(draggingItem, item)
      } else {
        item.parentNode?.insertBefore(indicator, item.nextSibling)
        item.parentNode?.insertBefore(draggingItem, item.nextSibling)
      }
    })

    // 拖拽放置
    item.addEventListener('drop', (e) => {
      e.preventDefault()
      
      // 移除提示线
      this.listContainer?.querySelectorAll('.drop-indicator').forEach(el => el.remove())
      // 获取新的顺序
      const items = Array.from(this.listContainer?.children || []) as HTMLDivElement[]
      const newOrder = items.map(el => el.dataset.columnKey).filter(key => key) as string[]
      
      // 更新列顺序, 包括隐藏列
      this.store.dispatch({ type: 'COLUMN_ORDER_SET', payload: { order: newOrder }})
    })
  }

  /** 渲染透视表配置区 (分组字段 + 数值字段) */
  private renderPivotConfig(): void {
    if (!this.pivotConfgSection) return 
    // 渲染前先保存当前选中的分组字段 (避免新渲染后丢失)
    const existingSelects = Array.from(
      this.pivotConfgSection.querySelectorAll('select.pivot-select[data-level]') || []
    ) as HTMLSelectElement[]

    if (existingSelects.length > 0) {
      this.currentGroupKeys = existingSelects.map(s => s.value)
    }

    this.pivotConfgSection.innerHTML = ''

    // ======= 行分组字段: 离散型, 最多支持 3-5 层 ========
    const groupLabel = document.createElement('div')
    groupLabel.className = 'pivot-config-label'
    groupLabel.textContent = '行分组字段(最多3层)'
    this.pivotConfgSection.appendChild(groupLabel)

    // const groupSelect = document.createElement('select')
    // groupSelect.className = 'pivot-select'

    // 离散型字段列表
    const groupColumns = this.originalColumns.filter(
      col => !col.dataType || col.dataType === 'string' || col.dataType === 'date'
    )

    // 创建 3 个下拉框 (简化版, 后续改为拖拽)
    const MAX_LEVELS = 3
    const groupSelects: HTMLSelectElement[] = []

    for (let i = 0; i < MAX_LEVELS; i++) {
      const selectWrapper = document.createElement('div')
      selectWrapper.style.marginBottom = '8px'

      const levelLabel = document.createElement('span')
      levelLabel.textContent = `第 ${i + 1} 层: `
      levelLabel.style.marginRight = '8px'
      levelLabel.style.fontSize = '12px'
      levelLabel.style.color = '#666'

      const select = document.createElement('select')
      select.className = 'pivot-select'
      select.dataset.level = String(i)

      // 第一个选项: "不分组"
      const emptyOption = document.createElement('option')
      emptyOption.value = ''
      emptyOption.textContent = i === 0 ? '-- 必须 --': '-- 不分组 --'
      select.appendChild(emptyOption)

      // 添加离散型字段选项
      for (const col of groupColumns) {
        const option = document.createElement('option')
        option.value = col.key
        option.textContent = col.title
        select.appendChild(option)
      }

      // 恢复之前的选中状态, 若没有则第一层默认选择第一个字段
      if (this.currentGroupKeys[i]) {
        select.value = this.currentGroupKeys[i]
      } else if (i === 0 && groupColumns.length > 0) {
        select.value = groupColumns[0].key
      }
      
      // 挂载
      selectWrapper.appendChild(levelLabel)
      selectWrapper.appendChild(select)
      this.pivotConfgSection.append(selectWrapper)
      // 收集到数组值
      groupSelects.push(select)
    }

    // 工具函数: 收集所有非空分组字段 (这个会有性能问题吧?)
    const collectGroupKeys = (): string[] => {
      return groupSelects
        .map(s => s.value)
        .filter(v => v !== '')
    }

    // 监听分组字段变化 (加防抖)
    let debounceTimer: number | null = null 
    for (const select of groupSelects) {
      select.addEventListener('change', () => {
        // 保存选中状态
        this.currentGroupKeys = groupSelects.map(s => s.value)

        // 防抖触发重建 (500ms)
        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }

        debounceTimer = window.setTimeout(() => {
          this.renderPivotConfig() // 重新渲染 + 自动收集配置
        }, 500)
      })
    }

    // 分割线
    const divider = document.createElement('hr')
    divider.style.border = 'none'
    divider.style.borderTop = '1px solid #e5e7eb'
    divider.style.margin = '12px 0'
    this.pivotConfgSection.appendChild(divider)

    // ======= 数值字段 选择区 (后续也改为拖拽)
    const valueLabel = document.createElement('div')
    valueLabel.className = 'pivot-config-label'
    valueLabel.textContent = '数值字段'
    this.pivotConfgSection.appendChild(valueLabel)

    const valueList = document.createElement('div')
    valueList.className = 'pivot-value-fields-list'

    // 当前已选的分组字段 (排除这些, 以免重复)
    const selectedGroupKeys = collectGroupKeys()

    // 只显示数值字段, 且排除已选为分组的字段
    const valueColumns = this.originalColumns.filter(
      col => col.dataType === 'number' && !selectedGroupKeys.includes(col.key)
    )

    // 一个字段一行; (checkbox, lable, title, aggType); 
    for (const col of valueColumns) {
      const item = document.createElement('div')
      item.className = 'pivot-value-field-item'
      item.dataset.colKey = col.key 

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.dataset.colKey = col.key
      // 数值字段默认值显示前 2 个, 都显示就看不到重点了
      const index = valueColumns.indexOf(col)
      checkbox.checked = (index < 2)

      const label = document.createElement('label')
      label.style.flex = '1'
      label.textContent = col.title

      const aggSelect = document.createElement('select')
      aggSelect.className = 'pivot-agg-select'
      aggSelect.dataset.colKey = col.key

      const aggTypes = ['sum', 'count', 'avg', 'max', 'min']
      for (const agg of aggTypes) {
        const opt = document.createElement('option')
        opt.value = agg 
        opt.textContent = agg 
        aggSelect.appendChild(opt)
      }

      // 若无配置聚合方式, 则默认为 'sum'
      aggSelect.value = (col.summaryType && col.summaryType !== 'none')  ? col.summaryType : 'sum'
      aggSelect.disabled = !checkbox.checked 

      // 监听字段勾选 和 聚合方法 的变化, 并从 DOM 收集 透视配置, 并触发回调
      checkbox.addEventListener('change', () => {
        aggSelect.disabled = !checkbox.checked 
        this.emitPivotConfig(valueList)
      })

      aggSelect.addEventListener('change', () => {
        this.emitPivotConfig(valueList)
      })

      item.appendChild(checkbox)
      item.appendChild(label)
      item.appendChild(aggSelect)
      valueList.appendChild(item)
    }

    this.pivotConfgSection.appendChild(valueList)
    
    // 首次触发一次回调, 让透视表用默认配置渲染
    this.emitPivotConfig(valueList)
  }

  /** 从 DOM 收集透视表配置, 并触发回调 */
  private emitPivotConfig(valueList: HTMLDivElement): void {
    // 收集分组字段
    const groupSelects = Array.from(
      this.pivotConfgSection?.querySelectorAll('select.pivot-select[data-level]') || []
    ) as HTMLSelectElement[]

    const rowGroups = groupSelects.map(s => s.value).filter(v => v !== '')
    if (rowGroups.length === 0) return // 没有分组字段则不触发

    // 收集数值字段
    const valueFields: IPivotConfig['valueFields'] = []
    valueList.querySelectorAll('.pivot-value-field-item').forEach(item => {
      const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
      const aggSelect = item.querySelector('.pivot-agg-select') as HTMLSelectElement

      if (checkbox?.checked) {
        const key = checkbox.dataset.colKey!
        const col = this.originalColumns.find(c => c.key === key)
        valueFields.push({
          key, 
          aggregation: aggSelect.value as AggregationType,
          label: col?.title
        })
      }
    })

    this.onPivotConfigChange?.({
      enabled: true,
      rowGroups,
      valueFields
    } as IPivotConfig)
  }

  public onHide(): void {
    this.unsubscribe?.()
    this.unsubscribe = null 
  }

  public destroy(): void {
    this.unsubscribe?.()
    this.container.remove()
  }

}

/** 导出工厂函数, 提供给 PanelRegistry 使用 
 * 
 * - 工厂函数就是一个 "造东西的函数", 它不用 `new` 关键字暴露给外部, 
 * - 而选择用 newColumnPanel(...) 返回一个 IPanel 接口
 * - 好处: 外部不需要知道具体类名, 只需要知道 "给我一个面板"
*/
export const createColumnPanel = (
  store: TableStore, 
  originalColumns: IColumn[],
  onPivotModeToggle?: (enbled: boolean) => void ,
  onPivotConfigChange?: (config: any) => void

): IPanel => {
  return new ColumnPanel(store, originalColumns, onPivotModeToggle, onPivotConfigChange)
}