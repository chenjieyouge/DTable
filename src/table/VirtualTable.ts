import { TableConfig } from '@/config/TableConfig'
import { DataManager } from '@/data/DataManager'
import { DOMRenderer } from '@/dom/DOMRenderer'
import { VirtualScroller } from '@/scroll/VirtualScroller'
import type { IConfig, IUserConfig } from '@/types'
import { SortState } from '@/table/core/SortState'
import { HeaderSortBinder } from '@/table/interaction/HeaderSortBinder'
import { bootstrapTable } from '@/table/data/bootstrapTable'
import { VirtualViewport } from '@/table/viewport/VirtualViewport'


// 主协调者, 表格缝合怪;  只做调度, 不包含业务逻辑
export class VirtualTable {
  private config: IConfig // 内部用完整配置
  private mode: 'client' | 'server' = 'server' // 走全量还是走分页
  private sortState: SortState = new SortState()
  private headerSortBinder = new HeaderSortBinder()
  private viewport!: VirtualViewport

  private dataManager: DataManager
  private renderer: DOMRenderer
  private scroller: VirtualScroller
  private scrollContainer!: HTMLDivElement
  private virtualContent!: HTMLDivElement // 非虚拟模式下不创建
  private summaryRow?: HTMLDivElement

  constructor(userConfig: IUserConfig) {
    // 初始化配置 (此时的 totalRows 是默认值, 后续会被覆盖)
    const tableConfig = new TableConfig(userConfig)
    this.config = tableConfig.getAll()

    this.dataManager = new DataManager(this.config)
    this.renderer = new DOMRenderer(this.config)
    this.scroller = new VirtualScroller(this.config)

    // 启动异步初始化流程
    this.initializeAsync()
  }

  // 异步初始化
  private async initializeAsync() {
    const { mode, totalRows } = await bootstrapTable(this.config,this.dataManager)
    this.mode = mode
    // 统一全局更新 totalRows 防止状态混乱造成滚你滚动卡屏
    this.config.totalRows = totalRows
    // 始终虚拟滚动模式, 坚决不降智, 否则得维护两套代码
    this.createVirtualDOM()
    // 创建 viewport: 将 "可视区更新/骨架行/数据渲染" 的职责下放
    this.viewport = new VirtualViewport({
      config: this.config,
      dataManager: this.dataManager,
      renderer: this.renderer,
      scroller: this.scroller,
      scrollContainer: this.scrollContainer,
      virtualContent: this.virtualContent
    })

    this.bindScrollEvents()
    this.viewport.updateVisibleRows()

    // 通知外部,模式的变化(可选)
    this.config.onModeChange?.(this.mode)
  }

  private createVirtualDOM() {
    this.scrollContainer = this.getContainer()
    this.scrollContainer.className = 'table-container'
    this.scrollContainer.innerHTML = ''
    this.scrollContainer.style.width = `${this.config.tableWidth}px`
    this.scrollContainer.style.height = `${this.config.tableHeight}px`
    this.applyContainerStyles()
    // 表头
    const tableWrapper = this.createTableWrapper()
    const headerRow = this.renderer.createHeaderRow()
    // 绑定表头事件
    this.headerSortBinder.bind(headerRow, (key) => {
      if (this.dataManager.getFullDataLength() === 0) return 
      this.toggleSort(key)
    })
    tableWrapper.appendChild(headerRow)
    // 总结行
    if (this.config.showSummary) {
      this.summaryRow = this.renderer.createSummaryRow()
      tableWrapper.appendChild(this.summaryRow)
      this.loadSummaryData()
    }

    // 创建数据区域容器 (.dataContainer)
    const dataContainer = document.createElement('div')
    dataContainer.className = 'data-container'
    dataContainer.style.height = `${this.scroller.getActualScrollHeight()}px`

    // 创建可滚动内容区 (必须 absolute)
    this.virtualContent = document.createElement('div')
    this.virtualContent.className = 'virtual-content'

    dataContainer.appendChild(this.virtualContent)
    tableWrapper.appendChild(dataContainer)
    this.scrollContainer.appendChild(tableWrapper)
  }

  // 公共工具方法: 获取容器
  private getContainer(): HTMLDivElement {
    const el = document.querySelector(this.config.container)
    if (!el) throw new Error(`Container ${this.config.container} not found`)
    return el as HTMLDivElement
  }

  // 公共工具方法: 给容器注入 css 变量
  private applyContainerStyles() {
    this.scrollContainer.style.setProperty(
      '--header-height',
      `${this.config.headerHeight}px`
    )
    this.scrollContainer.style.setProperty(
      '--summary-height',
      `${this.config.summaryHeight}px`
    )
    this.scrollContainer.style.setProperty(
      '--row-height',
      `${this.config.rowHeight}px`
    )
    this.scrollContainer.style.setProperty(
      '--summary-height',
      `${this.config.summaryHeight}px`
    )
  }

  // 公共工具方法: 创建包裹表格的 wrapper
  private createTableWrapper(): HTMLDivElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'table-wrapper'
    const totalWidth = this.config.columns.reduce(
      (sum, col) => sum + col.width,
      0
    )
    wrapper.style.width = `${totalWidth}px`
    return wrapper
  }

  // 监听 scroll 事件
  private bindScrollEvents() {
    let rafId: number | null = null
    this.scrollContainer.addEventListener(
      'scroll',
      () => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        rafId = requestAnimationFrame(() => {
          this.viewport.updateVisibleRows() // 交给 viewport 统一调度
        })
      },
      {
        passive: true,
      }
    )
  }


  // 加载总结行数据
  private async loadSummaryData() {
    if (!this.summaryRow) return
    const summaryData = await this.dataManager.getSummaryData()
    if (summaryData && this.summaryRow) {
      this.renderer.updateSummaryRow(this.summaryRow, summaryData)
    }
  }

  // 未来因拓展排序, 筛选,刷新等功能, 则需更新总计行数据
  public async refreshSummary() {
    if (this.config.showSummary) {
      await this.loadSummaryData()
    }
  }

  // 对外暴露: 是否为客户端模式
  public get isClientMode(): boolean {
    return this.mode === 'client'
  }

  // 排序入口 (当前仅内存模式实现了)
  public sort(sortKey: string, direction: 'asc' | 'desc') {
    if (this.mode === 'client') {
      this.dataManager.sortData(sortKey, direction)
      // 排序完就刷新表格 (交由 viewport 统一调度), 原始数据还存了一份其实(浅拷贝)
      this.viewport.refresh()
    } else {
      // TOTO: 分页模式, 得加钱
      console.warn('pagination mode need backend and add money')
    }
  }

  // 筛选入口
  public filter(filterText: string) {
    if (this.mode === 'client') {
      this.dataManager.filterData((row) =>
        Object.values(row).some((val) =>
          String(val).toLowerCase().includes(filterText.toLowerCase())
        )
      )
      // 更新 totalRows, 注意要同步更新 scroller, 滚动高度也要变哦
      this.config.totalRows = this.dataManager.getFullDataLength()
      this.scroller = new VirtualScroller(this.config)
      this.viewport.setScroller(this.scroller)
      // 同步更新 data-container 高度
      const dataContainer = this.scrollContainer.querySelector('.data-container') as HTMLDivElement
      if (dataContainer) {
        dataContainer.style.height = `${this.scroller.getActualScrollHeight()}px`
      }

      this.viewport.refresh() // 刷新表格数据
    } else {
      // TOTO: 分页模式, 得加钱
      console.warn('pagination mode need backend and add money')
    }
  }

  // 切换排序方法
  private toggleSort(sortKey: string) {
    const next = this.sortState.toggle(sortKey)
    if (!next) return 
    this.sort(next.key, next.direction)
    this.updateSortIndicator(next.key, next.direction)
  }

  // 添加排序指示器更新方法
  private updateSortIndicator(sortKey: string, direction: 'asc' | 'desc') {
    // 清除所有现有排序指示器
    const allHeaders = this.scrollContainer.querySelectorAll('.header-cell')
    allHeaders.forEach((header) => {
      const indicator = header.querySelector('.sort-indicator')
      if (indicator) indicator.remove()
    })

    // 为当前排序列添加指示器
    const targetHeader = this.scrollContainer.querySelector<HTMLDivElement>(
      `.header-cell[data-column-key="${sortKey}"]`
    )
    if (!targetHeader) return 
    const indicator = document.createElement('span')
    indicator.className = 'sort-indicator'
    indicator.textContent = direction === 'asc' ? '↑' : '↓'
    targetHeader.appendChild(indicator)
  }

  // 清空
  public destroy() {
    this.headerSortBinder.unbind(
      this.scrollContainer.querySelector('.sticky-header') as HTMLDivElement
    )
    this.scrollContainer.innerHTML = ''
    this.viewport?.destory()
  }
}
