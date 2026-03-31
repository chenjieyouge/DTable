import type { IPanel } from "@/table/panel/IPanel";
import type { TableStore } from "@/table/state/createTableStore";
import type { IColumn } from "@/types";
import type { IPivotConfig, AggregationType } from "@/types/pivot";

// 四个区域的名称
type ZoneName = 'filters' | 'columns' | 'rows' | 'values'

// 字段在某区域中的配置
interface ZoneField {
  key: string
  aggregation?: AggregationType  // 仅 values 区使用
}

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
  private allColumnKeys: string[] = []
  private pivotConfgSection: HTMLDivElement | null = null 
  private footerEl: HTMLDivElement | null = null

  // Excel 四区域的字段状态
  private zones: Record<ZoneName, ZoneField[]> = {
    filters: [],
    columns: [],
    rows: [],
    values: [],
  }

  // 正在拖拽的字段信息
  private dragState: { key: string; fromZone: ZoneName | 'pool' } | null = null

  // 显示小计行开关
  private showSubtotals = true

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
    container.className = 'vt-column-panel'

    // Pivot Mode 开关
    const pivotToggleRow = document.createElement('div')
    pivotToggleRow.className = 'vt-column-panel-pivot-toggle'

    const pivotLable = document.createElement('span')
    pivotLable.className = 'vt-pivot-mode-title'
    pivotLable.textContent = 'Pivot'
    
    const pivotSwitch = document.createElement('label')
    pivotSwitch.className = 'vt-pivot-switch'

    const pivotInput = document.createElement('input')
    pivotInput.className = 'vt-pivot-switch-input'
    pivotInput.type = 'checkbox'

    const pivotSlider = document.createElement('span')
    pivotSlider.className = 'vt-pivot-switch-slider'

    pivotSwitch.appendChild(pivotInput)
    pivotSwitch.appendChild(pivotSlider)
    pivotToggleRow.appendChild(pivotLable)
    pivotToggleRow.appendChild(pivotSwitch)
    container.appendChild(pivotToggleRow)

    // Pivot 配置区, 默认隐藏
    this.pivotConfgSection = document.createElement('div')
    this.pivotConfgSection.className = 'vt-column-panel-pivot-config'
    this.pivotConfgSection.style.display = 'none'
    container.appendChild(this.pivotConfgSection)

    // 开关事件
    pivotInput.addEventListener('change', () => {
      const enabled = pivotInput.checked
      this.onPivotModeToggle?.(enabled)
      this.pivotConfgSection!.style.display = enabled ? 'flex': 'none'

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

      // 透视模式下移除 container padding，让四区域撑满高度
      container.style.padding = enabled ? '0' : ''
      // 开关行保留 padding
      pivotToggleRow.style.padding = enabled ? '10px 12px 8px' : ''

      if (enabled) {
        this.renderPivotConfig()
      }
    })


    // 搜索框 (暂时保留, 后续实现)
    const searchBox = document.createElement('div')
    searchBox.className = 'vt-column-panel-search'
    this.searchInput = document.createElement('input')
    this.searchInput.type = 'text'
    this.searchInput.className = 'vt-column-panel-search-input'
    this.searchInput.placeholder = '搜索列名...'
    searchBox.appendChild(this.searchInput)
    container.appendChild(searchBox)

    this.searchBox = searchBox // 保养搜索框引用

    // 列列表容器
    this.listContainer = document.createElement('div')
    this.listContainer.className = 'vt-column-panel-list'
    container.appendChild(this.listContainer)

    // 底部操作按钮
    const footer = document.createElement('div')
    footer.className = 'vt-column-panel-footer'

    const btnShowAll = document.createElement('button')
    btnShowAll.className = 'vt-column-panel-btn'
    btnShowAll.textContent = '全选'

    const btnHideAll = document.createElement('button')
    btnHideAll.className = 'vt-column-panel-btn'
    btnHideAll.textContent = '全隐藏'

    const btnReset = document.createElement('button')
    btnReset.className = 'vt-column-panel-btn'
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
      item.className = 'vt-column-panel-item'
      item.draggable = true // 开启可拖拽
      item.dataset.columnKey = key 
      item.dataset.index = String(index)

      // 给隐藏列添加样式提示
      if (!isVisible) {
        item.classList.add('vt-column-panel-item--hidden')
      }

      // 拖拽图标, 出现在每列元素左侧
      const dragHandle = document.createElement('span')
      dragHandle.className = 'vt-column-panel-drag-handle'
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
      item.classList.add('vt-dragging')
      e.dataTransfer!.effectAllowed = 'move'  // 拖拽只允许 'move' 效果
    })

    // 拖拽结束
    item.addEventListener('dragend', () => {
      item.classList.remove('vt-dragging')
      // 移除所有插入提示
      this.listContainer?.querySelectorAll('.vt-drop-indicator').forEach(el => el.remove())
    })

    // 拖拽经过时的视觉反馈
    item.addEventListener('dragover', (e) => {
      e.preventDefault()

      const draggingItem = this.listContainer?.querySelector('.vt-dragging')
      if (!draggingItem || draggingItem === item) return 

      const rect = item.getBoundingClientRect()
      const midY = rect.top + rect.height / 2 

      // 先移除之前的提示线
      this.listContainer?.querySelectorAll('.vt-drop-indicator').forEach(el => el.remove())
      // 再添加蓝色提示线
      const indicator = document.createElement('div')
      indicator.className = 'vt-drop-indicator'

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
      this.listContainer?.querySelectorAll('.vt-drop-indicator').forEach(el => el.remove())
      // 获取新的顺序
      const items = Array.from(this.listContainer?.children || []) as HTMLDivElement[]
      const newOrder = items.map(el => el.dataset.columnKey).filter(key => key) as string[]
      
      // 更新列顺序, 包括隐藏列
      this.store.dispatch({ type: 'COLUMN_ORDER_SET', payload: { order: newOrder }})
    })
  }

  // ─────────────────────────────────────────────────────────
  //  Excel 四区域透视配置 UI
  // ─────────────────────────────────────────────────────────

  /** 渲染透视配置区（Excel 四区域风格） */
  private renderPivotConfig(): void {
    if (!this.pivotConfgSection) return
    this.pivotConfgSection.innerHTML = ''

    // ── 1. 字段列表区 ──────────────────────────────────────
    const poolSection = document.createElement('div')
    poolSection.className = 'vt-px-pool-section'

    const poolHeader = document.createElement('div')
    poolHeader.className = 'vt-px-section-header'
    poolHeader.textContent = '字段列表'
    poolSection.appendChild(poolHeader)

    const poolSearch = document.createElement('input')
    poolSearch.type = 'text'
    poolSearch.className = 'vt-px-pool-search'
    poolSearch.placeholder = '搜索字段...'
    poolSection.appendChild(poolSearch)

    const poolList = document.createElement('div')
    poolList.className = 'vt-px-pool-list'
    poolSection.appendChild(poolList)

    this.pivotConfgSection.appendChild(poolSection)

    // 渲染字段池
    this.renderPool(poolList, '')
    poolSearch.addEventListener('input', () => {
      this.renderPool(poolList, poolSearch.value.trim())
    })

    // ── 2. 分割线 ──────────────────────────────────────────
    const divider = document.createElement('div')
    divider.className = 'vt-px-divider'
    divider.textContent = '在下面区域中拖动字段'
    this.pivotConfgSection.appendChild(divider)

    // ── 3. 四区域网格 ──────────────────────────────────────
    const grid = document.createElement('div')
    grid.className = 'vt-px-zones-grid'

    const zonesMeta: { name: ZoneName; icon: string; label: string }[] = [
      { name: 'filters', icon: '▼', label: '筛选器' },
      { name: 'columns', icon: '⫿', label: '列' },
      { name: 'rows',    icon: '≡', label: '行' },
      { name: 'values',  icon: 'Σ', label: '值' },
    ]

    for (const meta of zonesMeta) {
      const zone = this.createZone(meta.name, meta.icon, meta.label)
      grid.appendChild(zone)
    }

    this.pivotConfgSection.appendChild(grid)

    // ── 4. 小计行开关 ──────────────────────────────────────
    const subtotalRow = document.createElement('label')
    subtotalRow.className = 'vt-px-subtotal-row'

    const subtotalCb = document.createElement('input')
    subtotalCb.type = 'checkbox'
    subtotalCb.checked = this.showSubtotals
    subtotalCb.addEventListener('change', () => {
      this.showSubtotals = subtotalCb.checked
      this.emitConfig()
    })

    subtotalRow.appendChild(subtotalCb)
    subtotalRow.appendChild(document.createTextNode(' 显示小计行'))
    this.pivotConfgSection.appendChild(subtotalRow)

    // ── 5. 初始触发 ────────────────────────────────────────
    this.emitConfig()
  }

  /** 渲染字段池列表 */
  private renderPool(container: HTMLDivElement, filter: string): void {
    container.innerHTML = ''
    const usedKeys = new Set([
      ...this.zones.filters.map(f => f.key),
      ...this.zones.columns.map(f => f.key),
      ...this.zones.rows.map(f => f.key),
      ...this.zones.values.map(f => f.key),
    ])

    const keyword = filter.toLowerCase()
    for (const col of this.originalColumns) {
      if (usedKeys.has(col.key)) continue
      if (keyword && !col.title.toLowerCase().includes(keyword)) continue

      const item = document.createElement('div')
      item.className = 'vt-px-pool-item'
      item.draggable = true
      item.dataset.fieldKey = col.key

      const handle = document.createElement('span')
      handle.className = 'vt-px-handle'
      handle.textContent = '⠿'

      const name = document.createElement('span')
      name.className = 'vt-px-field-name'
      name.textContent = col.title

      // 类型标记
      const badge = document.createElement('span')
      badge.className = 'vt-px-field-badge'
      badge.textContent = col.dataType === 'number' ? 'Σ' : 'A'
      badge.title = col.dataType === 'number' ? '数值字段' : '文本字段'

      item.appendChild(handle)
      item.appendChild(name)
      item.appendChild(badge)

      // 拖拽事件：从字段池拖出
      item.addEventListener('dragstart', (e) => {
        this.dragState = { key: col.key, fromZone: 'pool' }
        e.dataTransfer!.effectAllowed = 'move'
        item.classList.add('vt-dragging')
      })
      item.addEventListener('dragend', () => {
        item.classList.remove('vt-dragging')
        this.dragState = null
        this.clearAllDropIndicators()
      })

      // 双击快速添加到默认区域
      item.addEventListener('dblclick', () => {
        const targetZone: ZoneName = col.dataType === 'number' ? 'values' : 'rows'
        this.addToZone(col.key, targetZone)
      })

      container.appendChild(item)
    }

    if (container.children.length === 0) {
      const hint = document.createElement('div')
      hint.className = 'vt-px-pool-empty'
      hint.textContent = filter ? '无匹配字段' : '所有字段已分配'
      container.appendChild(hint)
    }
  }

  /** 创建一个区域（筛选/列/行/值） */
  private createZone(zoneName: ZoneName, icon: string, label: string): HTMLDivElement {
    const zone = document.createElement('div')
    zone.className = 'vt-px-zone'
    zone.dataset.zone = zoneName

    // 区域标题行
    const header = document.createElement('div')
    header.className = 'vt-px-zone-header'

    const headerLeft = document.createElement('span')
    headerLeft.className = 'vt-px-zone-label'
    headerLeft.innerHTML = `<span class="vt-px-zone-icon">${icon}</span>${label}`

    const addBtn = document.createElement('button')
    addBtn.className = 'vt-px-zone-add'
    addBtn.textContent = '+'
    addBtn.title = `添加字段到${label}`
    addBtn.addEventListener('click', () => this.showFieldPicker(zoneName, addBtn))

    header.appendChild(headerLeft)
    header.appendChild(addBtn)
    zone.appendChild(header)

    // 字段列表容器
    const body = document.createElement('div')
    body.className = 'vt-px-zone-body'
    body.dataset.zone = zoneName

    this.renderZoneFields(body, zoneName)

    // 区域拖拽接收事件
    body.addEventListener('dragover', (e) => {
      e.preventDefault()
      if (!this.dragState) return
      e.dataTransfer!.dropEffect = 'move'
      zone.classList.add('vt-px-zone--over')
    })
    body.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget as Node)) {
        zone.classList.remove('vt-px-zone--over')
      }
    })
    body.addEventListener('drop', (e) => {
      e.preventDefault()
      zone.classList.remove('vt-px-zone--over')
      if (!this.dragState) return
      const { key, fromZone } = this.dragState
      this.dragState = null
      this.moveField(key, fromZone, zoneName)
    })

    zone.appendChild(body)
    return zone
  }

  /** 渲染某个区域的字段 chip 列表 */
  private renderZoneFields(body: HTMLDivElement, zoneName: ZoneName): void {
    body.innerHTML = ''
    const fields = this.zones[zoneName]

    if (fields.length === 0) {
      const hint = document.createElement('div')
      hint.className = 'vt-px-zone-hint'
      hint.textContent = '拖入字段'
      body.appendChild(hint)
      return
    }

    for (const field of fields) {
      const col = this.originalColumns.find(c => c.key === field.key)
      if (!col) continue

      const chip = document.createElement('div')
      chip.className = 'vt-px-chip'
      chip.draggable = true
      chip.dataset.fieldKey = field.key

      const chipHandle = document.createElement('span')
      chipHandle.className = 'vt-px-handle'
      chipHandle.textContent = '⠿'

      const chipName = document.createElement('span')
      chipName.className = 'vt-px-chip-name'

      // values 区域显示聚合方式
      if (zoneName === 'values') {
        const aggSelect = document.createElement('select')
        aggSelect.className = 'vt-px-agg-select'
        aggSelect.title = '聚合方式'
        for (const agg of ['sum', 'count', 'avg', 'max', 'min']) {
          const opt = document.createElement('option')
          opt.value = agg
          opt.textContent = agg
          aggSelect.appendChild(opt)
        }
        aggSelect.value = field.aggregation ?? (
          (col.summaryType && col.summaryType !== 'none') ? col.summaryType : 'sum'
        )
        aggSelect.addEventListener('change', () => {
          field.aggregation = aggSelect.value as AggregationType
          this.emitConfig()
        })
        chipName.textContent = col.title
        chip.appendChild(chipHandle)
        chip.appendChild(chipName)
        chip.appendChild(aggSelect)
      } else {
        chipName.textContent = col.title
        chip.appendChild(chipHandle)
        chip.appendChild(chipName)
      }

      // 移除按钮
      const removeBtn = document.createElement('button')
      removeBtn.className = 'vt-px-chip-remove'
      removeBtn.textContent = '×'
      removeBtn.title = '移出区域'
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.removeFromZone(field.key, zoneName)
      })
      chip.appendChild(removeBtn)

      // chip 内部拖拽排序
      chip.addEventListener('dragstart', (e) => {
        this.dragState = { key: field.key, fromZone: zoneName }
        e.dataTransfer!.effectAllowed = 'move'
        chip.classList.add('vt-dragging')
      })
      chip.addEventListener('dragend', () => {
        chip.classList.remove('vt-dragging')
        this.dragState = null
        this.clearAllDropIndicators()
        this.refreshAllZones()
      })
      chip.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!this.dragState || this.dragState.key === field.key) return
        const dragging = body.querySelector('.vt-dragging')
        if (!dragging) return
        this.clearDropIndicatorsIn(body)
        const indicator = document.createElement('div')
        indicator.className = 'vt-drop-indicator'
        const rect = chip.getBoundingClientRect()
        if (e.clientY < rect.top + rect.height / 2) {
          body.insertBefore(indicator, chip)
          body.insertBefore(dragging, chip)
        } else {
          body.insertBefore(indicator, chip.nextSibling)
          body.insertBefore(dragging, chip.nextSibling)
        }
      })
      chip.addEventListener('drop', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.clearDropIndicatorsIn(body)
        // 同区域排序：从 DOM 顺序同步到 zones 数组
        if (this.dragState?.fromZone === zoneName) {
          this.syncZoneOrderFromDOM(body, zoneName)
          this.dragState = null
        }
      })

      body.appendChild(chip)
    }
  }

  /** 将字段移动到某个区域（来自字段池或其他区域） */
  private moveField(key: string, fromZone: ZoneName | 'pool', toZone: ZoneName): void {
    // 先从来源移除
    if (fromZone !== 'pool') {
      this.zones[fromZone] = this.zones[fromZone].filter(f => f.key !== key)
    }

    // 加入目标区域（避免重复）
    const alreadyIn = this.zones[toZone].some(f => f.key === key)
    if (!alreadyIn) {
      const col = this.originalColumns.find(c => c.key === key)
      const defaultAgg: AggregationType =
        (col?.summaryType && col.summaryType !== 'none') ? col.summaryType as AggregationType : 'sum'
      this.zones[toZone].push({
        key,
        aggregation: toZone === 'values' ? defaultAgg : undefined,
      })
    }

    this.refreshAllZones()
    this.emitConfig()
  }

  /** 从区域移除字段（返回字段池） */
  private removeFromZone(key: string, zoneName: ZoneName): void {
    this.zones[zoneName] = this.zones[zoneName].filter(f => f.key !== key)
    this.refreshAllZones()
    this.emitConfig()
  }

  /** 将字段添加到指定区域（双击或 + 按钮） */
  private addToZone(key: string, zoneName: ZoneName): void {
    // 从其他区域移除（一个字段只能在一个区域）
    for (const z of Object.keys(this.zones) as ZoneName[]) {
      this.zones[z] = this.zones[z].filter(f => f.key !== key)
    }
    this.moveField(key, 'pool', zoneName)
  }

  /** 弹出字段选择器（点击 + 按钮时） */
  private showFieldPicker(zoneName: ZoneName, anchor: HTMLElement): void {
    // 移除已存在的 picker
    document.querySelectorAll('.vt-px-picker').forEach(el => el.remove())

    const usedKeys = new Set([
      ...this.zones.filters.map(f => f.key),
      ...this.zones.columns.map(f => f.key),
      ...this.zones.rows.map(f => f.key),
      ...this.zones.values.map(f => f.key),
    ])

    const availCols = this.originalColumns.filter(c => !usedKeys.has(c.key))
    if (availCols.length === 0) return

    const picker = document.createElement('div')
    picker.className = 'vt-px-picker'

    for (const col of availCols) {
      const opt = document.createElement('div')
      opt.className = 'vt-px-picker-item'
      opt.textContent = col.title
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault()
        picker.remove()
        this.addToZone(col.key, zoneName)
      })
      picker.appendChild(opt)
    }

    // 定位在 anchor 旁
    const rect = anchor.getBoundingClientRect()
    picker.style.position = 'fixed'
    picker.style.top = `${rect.bottom + 4}px`
    picker.style.left = `${rect.left}px`
    document.body.appendChild(picker)

    // 点外部关闭
    const close = (e: MouseEvent) => {
      if (!picker.contains(e.target as Node)) {
        picker.remove()
        document.removeEventListener('mousedown', close)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', close), 0)
  }

  /** 从 DOM 顺序同步同区域字段顺序 */
  private syncZoneOrderFromDOM(body: HTMLDivElement, zoneName: ZoneName): void {
    const chips = Array.from(body.querySelectorAll('.vt-px-chip')) as HTMLDivElement[]
    const newOrder: ZoneField[] = []
    for (const chip of chips) {
      const key = chip.dataset.fieldKey
      if (!key) continue
      const existing = this.zones[zoneName].find(f => f.key === key)
      if (existing) newOrder.push(existing)
    }
    this.zones[zoneName] = newOrder
    this.emitConfig()
  }

  /** 刷新所有区域和字段池的显示 */
  private refreshAllZones(): void {
    if (!this.pivotConfgSection) return

    // 刷新字段池
    const poolList = this.pivotConfgSection.querySelector('.vt-px-pool-list') as HTMLDivElement
    const poolSearch = this.pivotConfgSection.querySelector('.vt-px-pool-search') as HTMLInputElement
    if (poolList) this.renderPool(poolList, poolSearch?.value.trim() ?? '')

    // 刷新四区域
    const zoneBodies = this.pivotConfgSection.querySelectorAll('.vt-px-zone-body')
    zoneBodies.forEach(body => {
      const zoneEl = body as HTMLDivElement
      const z = zoneEl.dataset.zone as ZoneName
      if (z) this.renderZoneFields(zoneEl, z)
    })
  }

  /** 清除所有放置提示线 */
  private clearAllDropIndicators(): void {
    this.pivotConfgSection?.querySelectorAll('.vt-drop-indicator').forEach(el => el.remove())
  }

  /** 清除某容器内的放置提示线 */
  private clearDropIndicatorsIn(container: HTMLElement): void {
    container.querySelectorAll('.vt-drop-indicator').forEach(el => el.remove())
  }

  /** 收集配置并触发回调 */
  private emitConfig(): void {
    const rowGroups = this.zones.rows.map(f => f.key)
    if (rowGroups.length === 0) return

    const colGroups = this.zones.columns.map(f => f.key)
    const valueFields: IPivotConfig['valueFields'] = this.zones.values.map(f => {
      const col = this.originalColumns.find(c => c.key === f.key)
      return {
        key: f.key,
        aggregation: f.aggregation ?? 'sum',
        label: col?.title,
      }
    })

    if (valueFields.length === 0) return

    this.onPivotConfigChange?.({
      enabled: true,
      rowGroups,
      colGroups: colGroups.length > 0 ? colGroups : undefined,
      valueFields,
      showSubtotals: this.showSubtotals,
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