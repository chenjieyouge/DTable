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
  private searchBox: HTMLDivElement | null = null 
  private listContainer: HTMLDivElement | null = null 
  private allColumnKeys: string[] = [] // 保存所有列的 key, 包括隐藏的
  private pivotConfgSection: HTMLDivElement | null = null 
  private currentGroupKeys: string[] = []  // 保存当前选中的多层分组字段
  private pivotConfig: Partial<IPivotConfig> = { showSubtotals: true } // 保存透视配置
  private footerEl: HTMLDivElement | null = null  // 保存底部按钮容器引用

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

      // 透视模式下, 隐藏列管理列表等相关元素
      if (this.searchBox) {
        this.searchBox.style.display = enabled ? 'none' : 'block'
      }

      if (this.listContainer) {
        this.listContainer.style.display = enabled ? 'none' : 'block'
      }

      if (this.footerEl) {
        this.footerEl.style.display = enabled ? 'none' : 'flex'
      }

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

    this.searchBox = searchBox // 保养搜索框引用

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

    // 保存 footer 引用, 方便后续控制 显示 / 隐藏
    this.footerEl = footer

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
    this.pivotConfgSection.innerHTML = ''

    // ======= 行分组字段: 离散型, 最多支持 3-5 层 ========
    const groupLabel = document.createElement('div')
    groupLabel.className = 'pivot-config-label'
    groupLabel.textContent = '行分组字段(最多3层)'
    this.pivotConfgSection.appendChild(groupLabel)

    // 离散型字段列表 (可分组的字段)
    const groupColumns = this.originalColumns.filter(
      col => !col.dataType || col.dataType === 'string' || col.dataType === 'date'
    )

    // 业务约定当前, 最大层级为 3层, 后续加钱可改
    const MAX_GROUP_LEVELS = 3

    // ======== 已选字段区域 ============
    const selectedSectionLabel = document.createElement('div')
    selectedSectionLabel.className = 'pivot-section-label'
    this.pivotConfgSection.appendChild(selectedSectionLabel)

    const selectedContainer = document.createElement('div')
    selectedContainer.className = 'pivot-group-fields-container pivot-selected-fields'
    this.pivotConfgSection.appendChild(selectedContainer)

    // 渲染已选字段 (按 currentGroupKeys 的顺序)
    for (const fieldKey of this.currentGroupKeys) {
      const col = groupColumns.find(c => c.key === fieldKey)
      if (!col) continue  // 若字段不存在, 则跳过

      const item = this.createGroupFieldItem(col, true, MAX_GROUP_LEVELS)
      selectedContainer.appendChild(item)
    }

    // 若没有已选字段, 显示提示
    if (this.currentGroupKeys.length === 0) {
      const emptyHint = document.createElement('div')
      emptyHint.className = 'pivot-empty-hint'
      emptyHint.textContent = '请从下方选中分组的字段'
      selectedContainer.appendChild(emptyHint)
    }

    // =========== 分割线 ==========
    const divider = document.createElement('hr')
    divider.className = 'pivot-section-divider'

    // ============ 可选字段区域 ============
    const availableSectionLabel = document.createElement('div')
    availableSectionLabel.className = 'pivot-section-label'
    availableSectionLabel.textContent = '可选分组字段'
    this.pivotConfgSection.appendChild(availableSectionLabel)

    const availableContainer = document.createElement('div')
    availableContainer.className = 'pivot-group-fields-container pivot-available-field'
    this.pivotConfgSection.appendChild(availableContainer)

    // 渲染未选字段
    for (const col of groupColumns) {
      // 跳过已选字段
      if (this.currentGroupKeys.includes(col.key)) continue

      const item = this.createGroupFieldItem(col, false, MAX_GROUP_LEVELS)
      availableContainer.appendChild(item)
    }

    // ======= 小计行开关 =========
    const subtotalToggle = document.createElement('div')
    subtotalToggle.className = 'pivot-subtotal-toggle'

    const subtotalLabel = document.createElement('label')
    subtotalLabel.className = 'pivot-subtotal-label'
    
    const subtotalCheckbox = document.createElement('input')
    subtotalCheckbox.type = 'checkbox'
    subtotalCheckbox.checked = this.pivotConfig.showSubtotals ?? true 
    subtotalCheckbox.addEventListener('change', () => {
      this.pivotConfig.showSubtotals = subtotalCheckbox.checked 
      this.emitPivotConfig(valueList) // 触发配置更新
    })

    const labelText = document.createElement('span')
    labelText.textContent = '显示小计行'

    // 挂载
    subtotalLabel.appendChild(subtotalCheckbox)
    subtotalLabel.appendChild(labelText)
    subtotalToggle.appendChild(subtotalLabel)
    this.pivotConfgSection.appendChild(subtotalToggle)

    // ======= 数值字段 选择区 =====
    const valueLabel = document.createElement('div')
    valueLabel.className = 'pivot-config-label'
    valueLabel.textContent = '数值字段'
    this.pivotConfgSection.appendChild(valueLabel)

    const valueList = document.createElement('div')
    valueList.className = 'pivot-value-fields-list'

    // 只显示数值字段, 且排除已选为分组的字段
    const valueColumns = this.originalColumns.filter(
      col => col.dataType === 'number' && !this.currentGroupKeys.includes(col.key)
    )

    // 没有数值字段就提前返回
    if (valueColumns.length === 0) {
      return 
    }

    // 一个字段一行; (checkbox, lable, title, aggType); 
    for (const col of valueColumns) {
      const item = document.createElement('div')
      item.className = 'pivot-value-field-item'
      item.dataset.colKey = col.key 

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.dataset.colKey = col.key
      // 数值字段默认值显示前 3个, 都显示就看不到重点了
      const index = valueColumns.indexOf(col)
      checkbox.checked = (index < 3)

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

  /** 创建分组字段项 (已选或未选) */
  private createGroupFieldItem(
    col: IColumn,
    isSelected: boolean,
    maxLevels: number

  ): HTMLDivElement {
    const item = document.createElement('div')
    item.className = 'pivot-group-field-item'
    item.dataset.fieldKey = col.key
    // 勾选框
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.id = `pivot-group-${col.key}`
    checkbox.dataset.fieldKey = col.key
    checkbox.checked = isSelected

    // 若已选 3 个且当前未选中, 则禁用
    const selectedCount = this.currentGroupKeys.length
    if (selectedCount >= maxLevels && !isSelected) {
      checkbox.disabled = true
    }

    // 勾选事件
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        if (this.currentGroupKeys.length < maxLevels) {
          this.currentGroupKeys.push(col.key)
          this.renderPivotConfig() // 重新渲染, 字段会移到已选区域
        }

      } else {
        // 取消勾选, 从 currentGroupKeys 移除
        const index = this.currentGroupKeys.indexOf(col.key)
        if (index > -1) {
          this.currentGroupKeys.splice(index, 1)
          this.renderPivotConfig() // 也是要重新渲染
        }
      }
    })

    // 标签
    const label = document.createElement('label')
    label.htmlFor = `pivot-group-${col.key}`
    label.textContent = col.title
    label.style.flex = '1'
    label.style.cursor = 'pointer'

    // 拖拽手柄 (已选字段才能显示)
    const dragHandle = document.createElement('span')
    dragHandle.className = 'pivot-drag-handle'
    dragHandle.textContent = '⋮⋮'
    dragHandle.style.cursor = 'grab'
    dragHandle.style.marginLeft = 'auto'
    dragHandle.style.fontSize = '16px'
    dragHandle.style.color = '#999'
    dragHandle.style.userSelect = 'none'
    dragHandle.style.visibility = isSelected ? 'visible': 'hidden'

    // 只有已选字段才能拖拽
    if (isSelected) {
      item.draggable = true 
      // 这里绑定的是已选区域的容器, 需要在拖拽事件中动态获取容器
      this.bindGroupFieldDragEvents(item)
    }

    // 挂载
    item.appendChild(checkbox)
    item.appendChild(label)
    item.appendChild(dragHandle)

    return item 
  }

  /** 绑定分组字段拖拽事件, 只在已选区域内拖拽 */
  private bindGroupFieldDragEvents(item: HTMLDivElement) {
    // 拖拽开始
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging')
      e.dataTransfer!.effectAllowed = 'move'
      // 改变拖拽手柄样式
      const handle = item.querySelector('.pivot-drag-handle') as HTMLDivElement
      if (handle) {
        handle.style.cursor = 'grabbing'
      }
    })

    // 拖拽结束
    item.addEventListener('dragend', () => {
      // 移除拖拽样式
      item.classList.remove('dragging')
      // 恢复拖拽手柄样式
      const handle = item.querySelector('.pivot-drag-handle') as HTMLDivElement
      if (handle) {
        handle.style.cursor = 'grab'
      }
      // 移除所有插入提示线
      const container = item.closest('.pivot-selected-fields') as HTMLDivElement
      container.querySelectorAll('.drop-indicator').forEach(el => el.remove())
      
      // 更新 currentGroupKeys 顺序
      this.updateGroupKeysOrder()
    })

    // 拖拽经过时的视觉反馈
    item.addEventListener('dragover', (e) => {
      e.preventDefault()

      const container = item.closest('.pivot-selected-fields') as HTMLDivElement
      const draggingItem = container.querySelector('.dragging')
      if (!draggingItem || draggingItem === item) return 

      // 只允许在选中的字段之间拖拽
      const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
      if (!checkbox.checked) return 

      const rect = item.getBoundingClientRect()
      const minY = rect.top + rect.height / 2 

      // 先移除之前的提示线
      container.querySelectorAll('.drop-indicator').forEach(el => el.remove())
      // 添加蓝色提示线
      const indicator = document.createElement('div')
      indicator.className = 'drop-indicator'

      if (e.clientY < minY) {
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
      const container = item.closest('.pivot-selected-fields') as HTMLDivElement
      if (!container) return 

      container.querySelectorAll('.drop-indicator').forEach(el => el.remove())
      // 更新 currentGroupKeys 顺序
      this.updateGroupKeysOrder()
    })
  }

  /** 根据 DOM 顺序, 更新 currentGroupKeys, 并触发透视表重建 */
  private updateGroupKeysOrder(): void {
    // 获取所有选中的字段, 按 dom 排序
    const container = this.pivotConfgSection?.querySelector('.pivot-selected-fields')
    if (!container) return 

    // 获取所有已选字段, 按 dom 顺序
    const items = Array.from(container.children) as HTMLDivElement[]
    const newGroupKeys: string[] = []

    for (const item of items) {
      // 跳过空提示
      if (item.classList.contains('pivot-empty-hint')) continue 

      const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement
      if (checkbox.checked) {
        const fieldKey = checkbox.dataset.fieldKey
        if (fieldKey) {
          newGroupKeys.push(fieldKey)
        }
      }
    }

    // 更新 currentGroupKeys 
    this.currentGroupKeys = newGroupKeys

    // 触发透视表重建, 通过 emitPivotConfig 
    const valueList = this.pivotConfgSection?.querySelector('.pivot-value-fields-list') as HTMLDivElement
    if (valueList) {
      this.emitPivotConfig(valueList)
    }
  }

  /** 从 DOM 收集透视表配置, 并触发回调 */
  private emitPivotConfig(valueList: HTMLDivElement): void {
    // 使用 currentGroupKeys (已按拖拽顺序排列)
    const rowGroups = this.currentGroupKeys
    if (rowGroups.length === 0) return 

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
      valueFields,
      showSubtotals: this.pivotConfig.showSubtotals ?? true // 传递小计行开关状态
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