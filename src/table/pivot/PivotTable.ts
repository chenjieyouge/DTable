import type { IColumn, IConfig } from "@/types";
import type { IPivotConfig, IPivotFlatRow, IPivotTreeNode, IPivotColNode } from "@/types/pivot";
import { PivotDataProcessor } from "@/table/pivot/PivotDataProcessor";
import { PivotRenderer } from "@/table/pivot/PivotRenderer";
import { PivotConfigPanel } from "@/table/pivot/PivotConfigPanel";
import { PivotTreeNode } from "@/table/pivot/PivotTreeNode";

/**
 * 透视表主类 (虚拟滚动)
 * 
 * 职责: 
 * 1. 整合数据处理器, 渲染器
 * 2. 管理透视表生命周期 (挂载, 刷新, 销毁)
 * 3. 虚拟滚动, 只渲染可视区行, 支持大数据量
 * 4. 处理用户交互 (展开/折叠, 配置变更)
 * 
 * 虚拟滚动原理 (与项目中 VirtualViewport 一致)
 * - scrollSpacer 撑出总高度 = flatRows.lenght * ROW_HEIGHT
 * - virtualContent 用 translateY 定位到可视区起始位置
 * - 只创建 [startRow, endRow] 范围内的行 DOM 
 * - 滚动时增量更新: 新进入的行创建, 离开的行销毁
 */
export class PivotTable {
  private pivotConfig: IPivotConfig
  private columns: IColumn[]
  private data: Record<string, any>[]
  private processor: PivotDataProcessor
  private renderer: PivotRenderer
  private configPanel: PivotConfigPanel

  private treeRoot: IPivotTreeNode | null = null 
  private flatRows: IPivotFlatRow[] = []

  private container: HTMLDivElement | null = null 
  private tableArea: HTMLDivElement | null = null 
  private emptyStateEl: HTMLDivElement | null = null  // 空状态提示元素

  // 工具栏 + 面包屑
  private headerEl: HTMLDivElement | null = null 
  private breadcrumbEl: HTMLDivElement | null = null

  // 冻结区（行分组列，左侧固定）
  private bodyContainer: HTMLDivElement | null = null
  private frozenCol: HTMLDivElement | null = null
  private frozenHeaderEl: HTMLDivElement | null = null
  private frozenScrollContainer: HTMLDivElement | null = null
  private frozenScrollSpacer: HTMLDivElement | null = null
  private frozenVirtualContent: HTMLDivElement | null = null
  private frozenStickyGroupEl: HTMLDivElement | null = null
  private frozenVisibleRowMap = new Map<number, HTMLDivElement>()

  // 滚动区（值列，右侧可滚动）
  private scrollHeaderEl: HTMLDivElement | null = null
  private scrollContainer: HTMLDivElement | null = null 
  private scrollSpacer: HTMLDivElement | null = null 
  private virtualContent: HTMLDivElement | null = null 
  private stickyGroupEl: HTMLDivElement | null = null 

  private visibleRowMap = new Map<number, HTMLDivElement>()
  private visibleSet = new Set<number>()

  private readonly ROW_HEIGHT = 32 //  暂时写死行高就 32px
  private readonly BUFFER_ROWS =10 //  暂时写死缓存行 10行

  // 绑定 scroll handler 引用, 方便 destroy 时移除
  private scrollHandler = () => this.updateVisibleRows()

  constructor(pivotConfig: IPivotConfig, columns: IColumn[], data: Record<string, any>[]) {
    this.pivotConfig = pivotConfig
    this.columns = columns
    this.data = data

    this.processor = new PivotDataProcessor(pivotConfig)
    this.renderer = new PivotRenderer(pivotConfig, columns)
    this.configPanel = new PivotConfigPanel(
      pivotConfig, 
      columns,
      (newConfig) => this.onConfigChange(newConfig)
    )
  }

  /**
   * 挂载到容器
   * 
   * DOM 结构: 
   * container
   *  └─ pivot-table (flex column, 100% height)
   *      ├─ pivot-header-wrapper (固定表头)
   *      └─ pivot-scroll-container (flex:1, overflow:auto)
   *          └─ pivot-scroll-spacer (height = totalRows * ROW_HEIGHT)
   *              └─ pivot-virtual-content (translateY 定位, 只渲染可视行)
   */
  public mount(container: HTMLDivElement): void {
    this.container = container
    container.innerHTML = ''
    // 直接作为表格区域, 配置面板已又侧边栏 PivotPanel 管理
    this.tableArea = container

    this.buildScrollStructure() // 构建虚拟滚动骨架
    this.refresh() // 初始化渲染
  }

  /** 
   * 构建虚拟滚动 DOM 骨架（冻结列 + 滚动区双容器）
   * 
   * DOM 结构:
   * wrapper (vt-pivot-table, flex column)
   *  ├── headerEl (工具栏按钮)
   *  ├── breadcrumbEl (面包屑导航)
   *  └── bodyContainer (flex row, flex: 1)
   *      ├── frozenCol (左侧固定 220px, flex column)
   *      │   ├── frozenHeaderEl (行分组列表头)
   *      │   └── frozenScrollContainer (overflow hidden, 垂直同步)
   *      │       ├── frozenStickyGroupEl
   *      │       ├── frozenScrollSpacer
   *      │       └── frozenVirtualContent
   *      └── scrollArea (flex: 1, flex column)
   *          ├── scrollHeaderEl (值列表头, 水平同步)
   *          └── scrollContainer (overflow auto, 主滚动驱动)
   *              ├── stickyGroupEl
   *              ├── scrollSpacer
   *              └── virtualContent
   */
  private buildScrollStructure(): void {
    if (!this.tableArea) return 

    const wrapper = document.createElement('div')
    wrapper.className = 'vt-pivot-table'
    wrapper.style.height = '100%'
    wrapper.style.display = 'flex'
    wrapper.style.flexDirection = 'column'

    // ── 工具栏 ──
    this.headerEl = document.createElement('div')
    this.headerEl.className = 'vt-pivot-header-area'
    wrapper.appendChild(this.headerEl)

    // ── 面包屑导航 ──
    this.breadcrumbEl = document.createElement('div')
    this.breadcrumbEl.className = 'vt-pivot-breadcrumb-wrapper'
    wrapper.appendChild(this.breadcrumbEl)

    // ── 主体容器（flex row: 冻结区 + 滚动区）──
    this.bodyContainer = document.createElement('div')
    this.bodyContainer.className = 'vt-pivot-body-container'

    // ═══ 冻结区（左侧固定，显示行分组列）═══
    this.frozenCol = document.createElement('div')
    this.frozenCol.className = 'vt-pivot-frozen-col'

    this.frozenHeaderEl = document.createElement('div')
    this.frozenHeaderEl.className = 'vt-pivot-frozen-header'
    this.frozenCol.appendChild(this.frozenHeaderEl)

    this.frozenScrollContainer = document.createElement('div')
    this.frozenScrollContainer.className = 'vt-pivot-frozen-scroll-container'

    this.frozenStickyGroupEl = document.createElement('div')
    this.frozenStickyGroupEl.className = 'vt-pivot-frozen-sticky-group'
    this.frozenStickyGroupEl.style.display = 'none'

    this.frozenScrollSpacer = document.createElement('div')
    this.frozenScrollSpacer.className = 'vt-pivot-scroll-spacer'

    this.frozenVirtualContent = document.createElement('div')
    this.frozenVirtualContent.className = 'vt-pivot-virtual-content'

    this.frozenScrollContainer.appendChild(this.frozenStickyGroupEl)
    this.frozenScrollContainer.appendChild(this.frozenScrollSpacer)
    this.frozenScrollContainer.appendChild(this.frozenVirtualContent)
    this.frozenCol.appendChild(this.frozenScrollContainer)

    // ═══ 滚动区（右侧可滚动，显示值列）═══
    const scrollArea = document.createElement('div')
    scrollArea.className = 'vt-pivot-scroll-area'

    this.scrollHeaderEl = document.createElement('div')
    this.scrollHeaderEl.className = 'vt-pivot-scroll-header-area'
    scrollArea.appendChild(this.scrollHeaderEl)

    this.scrollContainer = document.createElement('div')
    this.scrollContainer.className = 'vt-pivot-scroll-container'

    this.stickyGroupEl = document.createElement('div')
    this.stickyGroupEl.className = 'vt-pivot-sticky-group'
    this.stickyGroupEl.style.display = 'none'

    this.scrollSpacer = document.createElement('div')
    this.scrollSpacer.className = 'vt-pivot-scroll-spacer'

    this.virtualContent = document.createElement('div')
    this.virtualContent.className = 'vt-pivot-virtual-content'

    this.scrollContainer.appendChild(this.stickyGroupEl)
    this.scrollContainer.appendChild(this.scrollSpacer)
    this.scrollContainer.appendChild(this.virtualContent)
    scrollArea.appendChild(this.scrollContainer)

    // ═══ 组装 ═══
    this.bodyContainer.appendChild(this.frozenCol)
    this.bodyContainer.appendChild(scrollArea)
    wrapper.appendChild(this.bodyContainer)
    this.tableArea.appendChild(wrapper)
    
    // 绑定滚动事件
    this.scrollContainer.addEventListener('scroll', this.scrollHandler)
    // 绑定冻结区 ↔ 滚动区同步
    this.setupScrollSync()
  }

  /** 设置冻结区和滚动区的滚动同步 */
  private setupScrollSync(): void {
    if (!this.scrollContainer) return

    this.scrollContainer.addEventListener('scroll', () => {
      // 同步冻结区垂直滚动
      if (this.frozenScrollContainer) {
        this.frozenScrollContainer.scrollTop = this.scrollContainer!.scrollTop
      }
      // 同步滚动区表头水平滚动
      if (this.scrollHeaderEl) {
        const headerWrapper = this.scrollHeaderEl.querySelector('.vt-pivot-header-wrapper') as HTMLElement
        if (headerWrapper) {
          headerWrapper.scrollLeft = this.scrollContainer!.scrollLeft
        }
      }
    })
  }

  /** 渲染空状态引导 UI（无行分组或无值字段时显示） */
  private renderEmptyState(): void {
    if (!this.tableArea) return

    // 隐藏 scroll 区域，但保留 DOM 引用不销毁
    if (this.headerEl) this.headerEl.style.display = 'none'
    if (this.breadcrumbEl) this.breadcrumbEl.style.display = 'none'
    if (this.bodyContainer) this.bodyContainer.style.display = 'none'

    // 已有则直接显示
    if (this.emptyStateEl) {
      this.emptyStateEl.style.display = 'flex'
      return
    }

    const wrapper = this.tableArea.querySelector<HTMLDivElement>('.vt-pivot-table')
    if (!wrapper) return

    const empty = document.createElement('div')
    empty.className = 'vt-pivot-empty-state'
    empty.innerHTML = `
      <div class="vt-pivot-empty-icon">
        <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
          <rect x="4" y="12" width="48" height="34" rx="3" stroke="#c7d2fe" stroke-width="2" fill="#f5f7ff"/>
          <rect x="4" y="12" width="14" height="34" rx="0" stroke="none" fill="#e0e7ff"/>
          <line x1="4" y1="22" x2="52" y2="22" stroke="#c7d2fe" stroke-width="1.5"/>
          <line x1="18" y1="12" x2="18" y2="46" stroke="#c7d2fe" stroke-width="1.5"/>
          <circle cx="40" cy="34" r="10" fill="#6366f1" opacity="0.15"/>
          <path d="M40 29v10M35 34h10" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="vt-pivot-empty-title">透视表尚未配置</div>
      <div class="vt-pivot-empty-desc">在右侧面板将字段拖拽到对应区域</div>
      <div class="vt-pivot-empty-steps">
        <div class="vt-pivot-empty-step">
          <span class="vt-pivot-empty-step-num">1</span>
          <span>拖拽 <strong>文本字段</strong> 到「≡ 行」区域，设置分组维度</span>
        </div>
        <div class="vt-pivot-empty-step">
          <span class="vt-pivot-empty-step-num">2</span>
          <span>拖拽 <strong>数值字段</strong> 到「Σ 值」区域，设置聚合指标</span>
        </div>
        <div class="vt-pivot-empty-step">
          <span class="vt-pivot-empty-step-num">3</span>
          <span>可选：拖拽字段到「⫿ 列」区域，展开列维度</span>
        </div>
      </div>
    `
    wrapper.appendChild(empty)
    this.emptyStateEl = empty
  }

  /**
   * 刷新透视表
   * 
   * 流程: 
   * 1. 构建透视树 (PivotDataProcessor)
   * 2. 展平树结构 (PivotTreeNode.flattenTree)
   * 3. 渲染表头
   * 4. 更新滚动高度
   * 5. 清空可视区缓存 并 重新渲染可视区
   */
  private refresh(): void {
    if (!this.tableArea) return

    // 无有效字段配置时显示引导空状态
    const hasRows = this.pivotConfig.rowGroups?.length > 0
    const hasValues = this.pivotConfig.valueFields?.length > 0
    if (!hasRows || !hasValues) {
      this.renderEmptyState()
      return
    }

    // 有字段：隐藏空状态，恢复 scroll 区域
    if (this.emptyStateEl) this.emptyStateEl.style.display = 'none'
    if (this.headerEl) this.headerEl.style.display = ''
    if (this.breadcrumbEl) this.breadcrumbEl.style.display = ''
    if (this.bodyContainer) this.bodyContainer.style.display = ''

    // 1. 先构建列树 (有 colGroups 时生成多层列树, 无则生成 valueField 叶子)
    this.processor.buildColTree(this.data)
    const colLeaves = this.processor.getColLeaves()
    const colTree = this.processor.getColTree()

    // 2. 注入列叶子给渲染器
    this.renderer.setColLeaves(colLeaves)

    // 3. 构建行树
    this.treeRoot = this.processor.buildPivotTree(this.data)

    // 4. 展平为虚拟滚动行
    this.flatRows = PivotTreeNode.flattenTree(this.treeRoot, this.pivotConfig.showSubtotals ?? true)

    // 5. 渲染表头 (列结构变了需要重建)
    this.renderHeader(colTree)

    // 6. 更新滚动高度 + 重渲染
    this.updateScrollHeight()
    this.clearVisibleRows()
    this.updateVisibleRows()
  }

  /** 渲染表头（拆分为冻结区表头 + 滚动区表头） */
  private renderHeader(colTree: IPivotColNode | null): void {
    if (!this.headerEl || !this.frozenHeaderEl || !this.scrollHeaderEl) return

    this.headerEl.innerHTML = ''
    this.frozenHeaderEl.innerHTML = ''
    this.scrollHeaderEl.innerHTML = ''

    // ── 工具栏 ──
    const buttonGroup = document.createElement('div')
    buttonGroup.className = 'vt-pivot-button-group'

    const expandAllBtn = document.createElement('button')
    expandAllBtn.className = 'vt-pivot-control-btn'
    expandAllBtn.textContent = '展开'
    expandAllBtn.addEventListener('click', () => this.expandAll())

    const collapseAllBtn = document.createElement('button')
    collapseAllBtn.className = 'vt-pivot-control-btn'
    collapseAllBtn.textContent = '折叠'
    collapseAllBtn.addEventListener('click', () => this.collapseAll())

    // 行分组字段筛选按钮（每个 rowGroup 一个）
    for (const groupKey of this.pivotConfig.rowGroups) {
      const col = this.columns.find(c => c.key === groupKey)
      const title = col?.title ?? groupKey
      const activeFilters = this.pivotConfig.rowFilters?.[groupKey] ?? []
      const filterBtn = document.createElement('button')
      filterBtn.className = `vt-pivot-control-btn vt-pivot-filter-btn${activeFilters.length ? ' vt-pivot-filter-active' : ''}`
      filterBtn.title = `筛选行「${title}」`
      filterBtn.innerHTML = `≡ ${title} <span class="vt-pivot-filter-icon">${activeFilters.length ? `(${activeFilters.length})` : ''}</span>`
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.showFilterDropdown('row', groupKey, filterBtn)
      })
      buttonGroup.appendChild(filterBtn)
    }

    // 列分组字段筛选按钮（每个 colGroup 一个，仅有列分组时显示）
    for (const groupKey of (this.pivotConfig.colGroups ?? [])) {
      const col = this.columns.find(c => c.key === groupKey)
      const title = col?.title ?? groupKey
      const activeFilters = this.pivotConfig.colFilters?.[groupKey] ?? []
      const filterBtn = document.createElement('button')
      filterBtn.className = `vt-pivot-control-btn vt-pivot-filter-btn${activeFilters.length ? ' vt-pivot-filter-active' : ''}`
      filterBtn.title = `筛选列「${title}」`
      filterBtn.innerHTML = `⫿ ${title} <span class="vt-pivot-filter-icon">${activeFilters.length ? `(${activeFilters.length})` : ''}</span>`
      filterBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        this.showFilterDropdown('col', groupKey, filterBtn)
      })
      buttonGroup.appendChild(filterBtn)
    }

    // 导出按钮
    const exportBtn = document.createElement('button')
    exportBtn.className = 'vt-pivot-control-btn vt-pivot-export-btn'
    exportBtn.textContent = '导出 CSV'
    exportBtn.addEventListener('click', () => this.exportPivotCSV())

    buttonGroup.appendChild(expandAllBtn)
    buttonGroup.appendChild(collapseAllBtn)
    buttonGroup.appendChild(exportBtn)
    this.headerEl.appendChild(buttonGroup)

    // ── 排序回调 ──
    const onSort = (cellKey: string, direction: 'asc' | 'desc' | null) => {
      this.pivotConfig.sortBy = direction ? { cellKey, direction } : null
      this.processor.updateConfig(this.pivotConfig)
      this.renderer.updateConfig(this.pivotConfig, this.columns)
      this.refresh()
    }

    // ── 冻结区表头（行分组列名）──
    const frozenHeader = this.renderer.renderFrozenHeader(colTree)
    this.frozenHeaderEl.appendChild(frozenHeader)

    // ── 滚动区表头（值列）──
    const scrollHeader = this.renderer.renderScrollHeader(colTree, onSort)
    this.scrollHeaderEl.appendChild(scrollHeader)
  }

  /** 弹出分组字段值筛选下拉框（type: 'row' | 'col'） */
  private showFilterDropdown(type: 'row' | 'col', groupKey: string, anchor: HTMLElement): void {
    // 关闭已有下拉
    document.querySelectorAll('.vt-pivot-filter-dropdown').forEach(el => el.remove())

    const allValues = this.getUniqueValues(groupKey)
    const filtersMap = type === 'row' ? this.pivotConfig.rowFilters : this.pivotConfig.colFilters
    const activeSet = new Set(filtersMap?.[groupKey] ?? [])

    const dropdown = document.createElement('div')
    dropdown.className = 'vt-pivot-filter-dropdown'

    // 全选 / 清空 操作行
    const actions = document.createElement('div')
    actions.className = 'vt-pivot-filter-actions'
    const selectAll = document.createElement('span')
    selectAll.textContent = '全选'
    selectAll.addEventListener('click', () => {
      dropdown.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb => { cb.checked = true })
    })
    const clearAll = document.createElement('span')
    clearAll.textContent = '清空'
    clearAll.addEventListener('click', () => {
      dropdown.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach(cb => { cb.checked = false })
    })
    actions.appendChild(selectAll)
    actions.appendChild(clearAll)
    dropdown.appendChild(actions)

    // 复选框列表
    const list = document.createElement('div')
    list.className = 'vt-pivot-filter-list'
    for (const val of allValues) {
      const item = document.createElement('label')
      item.className = 'vt-pivot-filter-item'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.value = val
      cb.checked = activeSet.size === 0 || activeSet.has(val)
      item.appendChild(cb)
      item.appendChild(document.createTextNode(val))
      list.appendChild(item)
    }
    dropdown.appendChild(list)

    // 确认按钮
    const confirmBtn = document.createElement('button')
    confirmBtn.className = 'vt-pivot-filter-confirm'
    confirmBtn.textContent = '确认'
    confirmBtn.addEventListener('click', () => {
      const checked = Array.from(dropdown.querySelectorAll<HTMLInputElement>('input:checked')).map(cb => cb.value)
      // 若全选则清空过滤（等于不过滤）
      const newFilter = checked.length === allValues.length ? [] : checked
      if (type === 'row') {
        if (!this.pivotConfig.rowFilters) this.pivotConfig.rowFilters = {}
        this.pivotConfig.rowFilters[groupKey] = newFilter
      } else {
        if (!this.pivotConfig.colFilters) this.pivotConfig.colFilters = {}
        this.pivotConfig.colFilters[groupKey] = newFilter
      }
      this.processor.updateConfig(this.pivotConfig)
      this.renderer.updateConfig(this.pivotConfig, this.columns)
      dropdown.remove()
      this.refresh()
    })
    dropdown.appendChild(confirmBtn)

    // 定位：fixed + 挂 body，避免被祖先 overflow:hidden 裁剪
    const rect = anchor.getBoundingClientRect()
    dropdown.style.position = 'fixed'
    dropdown.style.top = `${rect.bottom + 4}px`
    dropdown.style.left = `${rect.left}px`
    document.body.appendChild(dropdown)

    // 点击外部关闭
    const closeOnOutside = (e: MouseEvent) => {
      if (!dropdown.contains(e.target as Node)) {
        dropdown.remove()
        document.removeEventListener('mousedown', closeOnOutside)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 0)
  }

  /** 获取某字段的所有唯一值（用于筛选下拉） */
  private getUniqueValues(field: string): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const row of this.data) {
      const v = String(row[field] ?? '')
      if (v && !seen.has(v)) { seen.add(v); result.push(v) }
    }
    return result
  }

  /** 导出透视表当前视图为 CSV */
  private exportPivotCSV(): void {
    if (this.flatRows.length === 0) return

    const colLeaves = this.processor.getColLeaves()
    const rowGroupTitles = this.pivotConfig.rowGroups
      .map(k => this.columns.find(c => c.key === k)?.title ?? k)

    // 表头
    const headers: string[] = [...rowGroupTitles]
    for (const leaf of colLeaves) {
      const vf = this.pivotConfig.valueFields.find(
        v => (v.label ?? v.key) === leaf.colValue || v.key === leaf.colValue
      )
      const colTitle = vf
        ? `${this.columns.find(c => c.key === vf.key)?.title ?? vf.key}(${vf.aggregation})`
        : String(leaf.colValue)
      headers.push(colTitle)
    }

    const lines: string[] = [headers.map(h => this.csvEscape(h)).join(',')]

    for (const flat of this.flatRows) {
      const firstCols = this.pivotConfig.rowGroups.map(k => {
        if (flat.rowType === 'grandtotal') return k === this.pivotConfig.rowGroups[0] ? '总计' : ''
        if (flat.rowType === 'subtotal') return k === this.pivotConfig.rowGroups[flat.level] ? '小计' : ''
        return this.csvEscape(String(flat.data[k] ?? ''))
      })
      const valueCols = colLeaves.map(leaf => {
        const cellKey = leaf.colKey === '__value__' && (!leaf.ancestorColValues?.length)
          ? (this.pivotConfig.valueFields.find(v => (v.label ?? v.key) === leaf.colValue)?.key ?? String(leaf.colValue))
          : [this.pivotConfig.valueFields.find(v => (v.label ?? v.key) === leaf.colValue)?.key, ...(leaf.ancestorColValues ?? [])].filter(Boolean).join('__')
        const val = flat.data[cellKey]
        return this.csvEscape(val !== undefined && val !== null ? String(val) : '')
      })
      lines.push([...firstCols, ...valueCols].join(','))
    }

    const BOM = '\uFEFF'
    const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'pivot-export.csv'; a.style.display = 'none'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  private csvEscape(value: string): string {
    if (/[,"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
    return value
  }

  /** 更新 spacer 高度（冻结区 + 滚动区同步） */
  private updateScrollHeight(): void {
    if (!this.scrollSpacer) return 

    const totalHeight = this.flatRows.length * this.ROW_HEIGHT // 行数 * 每行高度
    this.scrollSpacer.style.height = `${totalHeight}px`
    if (this.frozenScrollSpacer) {
      this.frozenScrollSpacer.style.height = `${totalHeight}px`
    }
  }

  /** 清空可视区缓存（冻结区 + 滚动区） */
  private clearVisibleRows(): void {
    if (this.virtualContent) {
      this.virtualContent.innerHTML = ''
    }
    if (this.frozenVirtualContent) {
      this.frozenVirtualContent.innerHTML = ''
    }

    this.visibleRowMap.clear()
    this.frozenVisibleRowMap.clear()
    this.visibleSet.clear()

    if (this.stickyGroupEl) {
      this.stickyGroupEl.style.display = 'none'
    }
    if (this.frozenStickyGroupEl) {
      this.frozenStickyGroupEl.style.display = 'none'
    }
  }

  /** 
   * 增量更新可视区行 (虚拟滚动, 冻结区 + 滚动区双容器)
   * 
   * 原理与项目中 VirtualViewport.updateVisibleRowInternal 一致:
   * 1. 根据 scrollTop 计算 [startRow, endRow]
   * 2. 新进 可视区的行 -> 创建冻结区单元格 + 滚动区行, 加入 fragment
   * 3. 离开 可视区的行 -> 移除 DOM
   * 4. translateY 定位 virtualContent (冻结区和滚动区同步)
  */
  private updateVisibleRows(): void {
    if (!this.scrollContainer || !this.virtualContent || !this.frozenVirtualContent) return 

    const scrollTop = this.scrollContainer.scrollTop 
    const viewportHeight = this.scrollContainer.clientHeight
    const totalRows = this.flatRows.length

    if (totalRows === 0) return 

    // 计算可视行范围 (带缓冲区)
    const startRow = Math.max(0, Math.floor(scrollTop / this.ROW_HEIGHT) - this.BUFFER_ROWS)
    const endRow = Math.min(
      totalRows - 1,
      Math.ceil((scrollTop + viewportHeight) / this.ROW_HEIGHT + this.BUFFER_ROWS)
    )
    
    // 定位虚拟内容区（冻结区和滚动区同步 translateY）
    const translateY = `translateY(${startRow * this.ROW_HEIGHT}px)`
    this.virtualContent.style.transform = translateY
    this.frozenVirtualContent.style.transform = translateY

    const newVisibleSet = new Set<number>()
    const scrollFragment = document.createDocumentFragment()
    const frozenFragment = document.createDocumentFragment()

    for (let i = startRow; i <= endRow; i++) {
      newVisibleSet.add(i)

      if (!this.visibleSet.has(i)) {
        const flatRow = this.flatRows[i]
        if (!flatRow) continue 

        // 滚动区行（值列）
        const scrollRowEl = this.renderer.renderRowScrollPart(flatRow)
        scrollRowEl.style.height = `${this.ROW_HEIGHT}px`
        scrollRowEl.style.lineHeight = `${this.ROW_HEIGHT}px`

        // 冻结区单元格（行分组标签）
        const frozenCellEl = this.renderer.renderRowFrozenPart(flatRow)
        frozenCellEl.style.height = `${this.ROW_HEIGHT}px`
        frozenCellEl.style.lineHeight = `${this.ROW_HEIGHT}px`

        // 分组行绑定 展开 / 折叠（两侧都绑定）
        if (flatRow.type === 'group') {
          const nodeId = flatRow.nodeId
          frozenCellEl.style.cursor = 'pointer'
          frozenCellEl.addEventListener('click', () => this.toggleNode(nodeId))
          scrollRowEl.style.cursor = 'pointer'
          scrollRowEl.addEventListener('click', () => this.toggleNode(nodeId))
        }

        scrollFragment.appendChild(scrollRowEl)
        frozenFragment.appendChild(frozenCellEl)
        this.visibleRowMap.set(i, scrollRowEl)
        this.frozenVisibleRowMap.set(i, frozenCellEl)
      }
    }

    // 批量插入
    if (scrollFragment.children.length > 0) {
      this.virtualContent.appendChild(scrollFragment)
    }
    if (frozenFragment.children.length > 0) {
      this.frozenVirtualContent.appendChild(frozenFragment)
    }

    // 清理离开可视区的行
    for (const idx of this.visibleSet) {
      if (!newVisibleSet.has(idx)) {
        this.visibleRowMap.get(idx)?.remove()
        this.visibleRowMap.delete(idx)
        this.frozenVisibleRowMap.get(idx)?.remove()
        this.frozenVisibleRowMap.delete(idx)
      }
    }

    this.visibleSet = newVisibleSet
    // 实际可视起始行（不含 buffer），用于吸顶判断
    const visualStartRow = Math.floor(scrollTop / this.ROW_HEIGHT)
    // 更新吸顶分组行
    this.updateStickyGroup(visualStartRow, scrollTop)
    // 更新面包屑导航 
    this.updateBreadcrumb(startRow)
  }

  /**
   * 更新吸顶分组行（冻结区 + 滚动区）
   * 
   * 原理: 
   * 从当前可视区, 第一行往前找最近的 group 行
   * - 若该 group 行已经滚出视口, 则在顶部显示一个固定的副本
   * - 若该 group 行本身还在视口, 则隐藏吸顶行, 避免重复
   */
  private updateStickyGroup(visualStartRow: number, scrollTop: number): void {
    if (!this.stickyGroupEl || !this.frozenStickyGroupEl) return 

    // scrollTop 不足一行高度时不显示（内容没有真正滚动走）
    if (scrollTop < this.ROW_HEIGHT) {
      this.stickyGroupEl.style.display = 'none'
      this.frozenStickyGroupEl.style.display = 'none'
      return
    }

    // 从可视顶行往前找最近的 group 行，排除小计/总计
    let groupRow: IPivotFlatRow | null = null 
    let groupRowIndex = -1

    for (let i = visualStartRow; i >= 0; i--) {
      const row = this.flatRows[i]
      if (row?.type === 'group' && row.rowType !== 'subtotal' && row.rowType !== 'grandtotal') {
        groupRow = this.flatRows[i]
        groupRowIndex = i
        break
      }
    }

    // 没有找到分组行，或分组行就是当前可视第一行（还在屏幕里），隐藏
    if (!groupRow || groupRowIndex >= visualStartRow) {
      this.stickyGroupEl.style.display = 'none'
      this.frozenStickyGroupEl.style.display = 'none'
      return 
    }

    const nodeId = groupRow.nodeId

    // 滚动区吸顶（值列）
    this.stickyGroupEl.innerHTML = ''
    const scrollRowEl = this.renderer.renderRowScrollPart(groupRow)
    scrollRowEl.style.height = `${this.ROW_HEIGHT}px`
    scrollRowEl.style.lineHeight = `${this.ROW_HEIGHT}px`
    scrollRowEl.style.cursor = 'pointer'
    scrollRowEl.addEventListener('click', () => this.toggleNode(nodeId))
    this.stickyGroupEl.appendChild(scrollRowEl)
    this.stickyGroupEl.style.display = 'block'

    // 冻结区吸顶（行分组标签）
    this.frozenStickyGroupEl.innerHTML = ''
    const frozenCellEl = this.renderer.renderRowFrozenPart(groupRow)
    frozenCellEl.style.height = `${this.ROW_HEIGHT}px`
    frozenCellEl.style.lineHeight = `${this.ROW_HEIGHT}px`
    frozenCellEl.style.cursor = 'pointer'
    frozenCellEl.addEventListener('click', () => this.toggleNode(nodeId))
    this.frozenStickyGroupEl.appendChild(frozenCellEl)
    this.frozenStickyGroupEl.style.display = 'block'
  }
 

  /**
   * 切换节点 展开/折叠
   * 
   * 流程: 
   * 1. 在树中找到目标节点, 切换 isExpanded
   * 2. 重新展平树结构 (不需要重建树)
   * 3. 更新滚动高度 + 重新渲染可视区
   */
  private toggleNode(nodeId: string): void {
    if (!this.treeRoot) return 

    // 查找目标节点
    const targetNode = this.findNodeById(this.treeRoot, nodeId)
    if (!targetNode) return
    
    // 切换展开状态
    targetNode.isExpanded = !targetNode.isExpanded
    
    // 性能优化：懒加载子节点
    if (targetNode.isExpanded && !targetNode.childrenLoaded) {
      this.processor.loadChildren(targetNode)
    }
    
    // 重新展平 (无需重新构建树, 只需重新展平即可)
    this.flatRows = PivotTreeNode.flattenTree(
      this.treeRoot,
      this.pivotConfig.showSubtotals ?? true
    )
    // 更新滚动高度 + 清理可视区缓存 + 重渲染可视区行
    this.updateScrollHeight()
    this.clearVisibleRows()
    this.updateVisibleRows()
  }
  
  /** 查找节点（用于懒加载） */
  private findNodeById(node: IPivotTreeNode, nodeId: string): IPivotTreeNode | null {
    if (node.id === nodeId) return node
    for (const child of node.children) {
      const found = this.findNodeById(child, nodeId)
      if (found) return found
    }
    return null
  }

  /** 展开-所有分组节点 */
  private expandAll(): void {
    if (!this.treeRoot) return 
    
    // 性能检查：统计总节点数
    const totalNodes = this.countAllGroupNodes(this.treeRoot)
    const MAX_RECOMMENDED_NODES = 200
    
    if (totalNodes > MAX_RECOMMENDED_NODES) {
      if (!confirm(`检测到 ${totalNodes} 个分组节点，展开所有可能影响性能。\n\n是否继续展开所有节点？\n\n建议：只展开需要的层级以获得更好体验。`)) {
        return
      }
    }
    
    // 递归设置, 所有分组节点为 "展开" 状态
    this.setAllNodesExpanded(this.treeRoot, true)
    // 重新展平树
    this.flatRows = PivotTreeNode.flattenTree(this.treeRoot, this.pivotConfig.showSubtotals ?? true)
    // 更新视图
    this.updateScrollHeight()
    this.clearVisibleRows()
    this.updateVisibleRows()
  }

  /** 折叠-所有分子节点 */
  private collapseAll(): void {
    if (!this.treeRoot) return 
    // 递归设置, 所有分组节点为 "折叠" 状态
    this.setAllNodesExpanded(this.treeRoot, false)
    // 重新展平树
    this.flatRows = PivotTreeNode.flattenTree(this.treeRoot, this.pivotConfig.showSubtotals ?? true)
    // 更新视图
    this.updateScrollHeight()
    this.clearVisibleRows()
    this.updateVisibleRows()
  }

  /**
   * 统计所有分组节点数量（用于性能检查）
   */
  private countAllGroupNodes(node: IPivotTreeNode): number {
    if (node.level === -1) {
      // 根节点：统计所有子节点
      return node.children.reduce((total, child) => 
        total + this.countAllGroupNodes(child), 0
      )
    }
    
    let count = 1 // 当前节点
    
    // 递归统计子节点
    for (const child of node.children) {
      count += this.countAllGroupNodes(child)
    }
    
    return count
  }

  /**
   * 递归设置, 所有节点的展开状态
   * 
   * @param node 当前节点
   * @param expanded 展开状态, true 展开, false 闭合
   */
  private setAllNodesExpanded(node: IPivotTreeNode, expanded: boolean): void {
    // 根节点始终展开
    if (node.level === -1) {
      node.isExpanded = true

    } else if (node.type === 'group') {
      node.isExpanded = expanded
    }

    // 递归处理子节点
    for (const child of node.children) {
      this.setAllNodesExpanded(child, expanded)
    }
  }

  /** 更新面包屑导航 */
  private updateBreadcrumb(startRow: number): void {
    if (!this.breadcrumbEl) return 

    const currentRow = this.flatRows[startRow]
    if (!currentRow) {
      this.breadcrumbEl.style.display = 'none'
      return 
    }

    // 构建面包屑路径
    const breadcrumbs: { label: string; rowIndex: number }[] = []
    for (let i = startRow; i >= 0; i--) {
      const row = this.flatRows[i]
      if (!row || row.type !== 'group') continue

      const label = this.getBreadcrumbLabel(row)
      breadcrumbs.unshift({ label, rowIndex: i })

      // 若是顶层分组 (非小计行) 则停止 
      if (row.level === 0 && row.rowType !== 'subtotal') {
        break
      }
    }

    if (breadcrumbs.length === 0) {
      this.breadcrumbEl.style.display = 'none'
      return 
    }

    // 渲染面包屑
    this.breadcrumbEl.innerHTML = ''
    this.breadcrumbEl.style.display = 'flex'

    breadcrumbs.forEach((crumb, index) => {
      // 面包屑项
      const crumbItem = document.createElement('span')
      crumbItem.className = 'vt-pivot-breadcrumb-item'
      crumbItem.textContent = crumb.label
      crumbItem.addEventListener('click', () => this.scrollToRow(crumb.rowIndex))

      this.breadcrumbEl!.appendChild(crumbItem)

      // 分隔符
      if (index < breadcrumbs.length - 1) {
        const separator = document.createElement('span')
        separator.className = 'vt-pivot-breadcrumb-separator'
        separator.textContent = ' > '
        this.breadcrumbEl!.appendChild(separator)
      }
    })
  }

  /** 获取面包屑标签 */
  private getBreadcrumbLabel(row: IPivotFlatRow): string {
    if (row.rowType === 'subtotal') return '小计'
    if (row.rowType === 'grandtotal') return '总计'

    const groupKey = this.pivotConfig.rowGroups[row.level]
    return String(row.data[groupKey] || row.groupVale || '(空)')
  }

  /** 滚动到指定行 */
  private scrollToRow(rowIndex: number): void {
    if (!this.scrollContainer) return 
    this.scrollContainer.scrollTop = rowIndex * this.ROW_HEIGHT
  }


  /**
   * 配置变化回调
   * 
   * 当用户在配置面板中, 修改分组字段, 或数值字段时触发
   * 需要查询构建 处理器 和 渲染器, 然后刷新
   */
  private onConfigChange(newConfig: IPivotConfig): void {
    this.pivotConfig = newConfig
    this.processor.clearCache() // 清空聚合缓存
    this.processor.updateConfig(newConfig)
    this.renderer.updateConfig(newConfig, this.columns)
    this.refresh()
  }

  /** 更新数据 (外部调用) */
  public updateData(data: Record<string, any>[]): void {
    this.data = data 
    this.refresh()
  }

  /** 更新列配置 (外部调用) */
  public updateColumns(columns: IColumn[]): void {
    this.columns = columns
    this.renderer.updateConfig(this.pivotConfig, columns)
    this.refresh()
  }

  /** 更新透视配置 (由外部 PivotPanel 调用) */
  public updateConfig(config: IPivotConfig, columns: IColumn[]): void {
    this.pivotConfig = config
    this.columns = columns
    this.processor.updateConfig(config)
    this.renderer.updateConfig(config, columns)
    this.refresh()
  }

  /** 销毁 */
  public destroy(): void {
    this.scrollContainer?.removeEventListener('scroll', this.scrollHandler)
    this.clearVisibleRows()

    if (this.container) {
      this.container.innerHTML = ''
    }

    this.treeRoot = null 
    this.flatRows = []
    this.container = null 
    this.tableArea = null 
    this.emptyStateEl = null

    // 工具栏 + 面包屑
    this.headerEl = null
    this.breadcrumbEl = null

    // 冻结区
    this.bodyContainer = null
    this.frozenCol = null
    this.frozenHeaderEl = null
    this.frozenScrollContainer = null
    this.frozenScrollSpacer = null
    this.frozenVirtualContent = null
    this.frozenStickyGroupEl = null

    // 滚动区
    this.scrollHeaderEl = null
    this.scrollContainer = null 
    this.scrollSpacer = null 
    this.virtualContent = null 
    this.stickyGroupEl = null  
  }
}