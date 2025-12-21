import { TableConfig } from '@/config/TableConfig'
import { DataManager } from '@/data/DataManager'
import { DOMRenderer } from '@/dom/DOMRenderer'
import { VirtualScroller } from '@/scroll/VirtualScroller'
import type { IConfig, ITableQuery, IUserConfig } from '@/types'
import { SortState } from '@/table/core/SortState'
import { HeaderSortBinder } from '@/table/interaction/HeaderSortBinder'
import { bootstrapTable } from '@/table/data/bootstrapTable'
import { VirtualViewport } from '@/table/viewport/VirtualViewport'
import type { ITableShell } from '@/table/TableShell'
import { mountTableShell } from '@/table/TableShell'


// 主协调者, 表格缝合怪;  只做调度, 不包含业务逻辑
export class VirtualTable {
  private config: IConfig // 内部用完整配置

  private shell!: ITableShell

  private mode: 'client' | 'server' = 'server' // 走全量还是走分页
  private sortState: SortState = new SortState()
  private headerSortBinder = new HeaderSortBinder()
  private serverQuery: ITableQuery = { filterText: '' } // 默认 server 空筛选
  private clientFilterText = '' // client 下清空筛选排序后恢复原样
  private viewport!: VirtualViewport

  private dataManager: DataManager
  private renderer: DOMRenderer
  private scroller: VirtualScroller

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
    this.config.totalRows = totalRows
    // 挂载 TableShell, DOM 表头, 事件等都在 shell 内部处理
    this.shell = mountTableShell({
      config: this.config,
      renderer: this.renderer,
      headerSortBinder: this.headerSortBinder,
      onToggleSort: (key) => this.toggleSort(key),
      onNeedLoadSummary: (summaryRow) => {
        this.loadSummaryData(summaryRow).catch(console.warn)
      }
    })

    // 首次挂载后, 就立刻同步一次滚动高度
    this.shell.setScrollHeight(this.scroller)
    // 创建 viewport: 将 "可视区更新/骨架行/数据渲染" 的职责下放
    this.viewport = new VirtualViewport({
      config: this.config,
      dataManager: this.dataManager,
      renderer: this.renderer,
      scroller: this.scroller,
      scrollContainer: this.shell.scrollContainer,
      virtualContent: this.shell.virtualContent
    })

    // 滚动监听由 shell 统一绑定, 而 VirtualTable 只提供滚动后做什么
    this.shell.bindScroll(() => {
      this.viewport.updateVisibleRows()
    })
    this.viewport.updateVisibleRows()
    this.config.onModeChange?.(this.mode) // 通知外部,模式的变化(可选)
  }

  // 加载总结行数据 (传参)
  private async loadSummaryData(summaryRow: HTMLDivElement) {
    const summaryData = await this.dataManager.getSummaryData()
    if (summaryData) {
      // 值更新传入的那一行, 不再由 VirtualTable 保存 dom 引用
      this.renderer.updateSummaryRow(summaryRow, summaryData)
    }
  }

  // 未来因拓展排序, 筛选,刷新等功能, 则需更新总计行数据
  public async refreshSummary() {
    if (!this.config.showSummary) return 
    const row = this.shell?.summaryRow
    if (!row) return 
    await this.loadSummaryData(row)
  }

  // 对外暴露: 是否为客户端模式
  public get isClientMode(): boolean {
    return this.mode === 'client'
  }

  // 排序入口, 兼容 client 和 server 模式
  public sort(sortKey: string, direction: 'asc' | 'desc') {
    if (this.mode === 'client') {
      this.dataManager.sortData(sortKey, direction)
      // 排序完就刷新表格 (交由 viewport 统一调度), 原始数据还存了一份其实(浅拷贝)
      this.viewport.refresh()
    } else {
      // console.warn('pagination mode need backend and add money')
      this.applyServerQuery({
        ...this.serverQuery,
        sortKey,
        sortDirection: direction
      }).catch(console.warn)
    }
  }

  // 切换排序方法
  private toggleSort(sortKey: string) {
    const next = this.sortState.toggle(sortKey)
    // 第三态: next === null 表示清空排序, 数据复原
    if (!next) {
      this.shell.setSortIndicator(null)
      if (this.mode === 'client') {
        // client 清空排序: 恢复原始顺序, 若有筛选, 则回复筛选后的原始顺序
        this.dataManager.resetClientOrder(this.clientFilterText)
        this.viewport.refresh()
        return 
      }
      // server 清空排序: 下发 query, 去掉 filterText
      this.applyServerQuery({
        ...this.serverQuery,
        sortKey: undefined,
        sortDirection: undefined
      }).catch(console.warn)
      return 
    }
    // 若还有排序的话, 走正常的 sort 
    this.sort(next.key, next.direction)
    this.shell.setSortIndicator(next)
  }

  // private clearSortIndicator() {
  //   // 清除现有的排序指示器, 用于第三次点击 "复原"
  //   const allHeaders = this.scrollContainer.querySelectorAll('.header-cell')
  //   allHeaders.forEach((header) => {
  //     const indicator = header.querySelector('.sort-indicator')
  //     if (indicator) indicator.remove()
  //   })
  // }


  // 筛选入口
  public filter(filterText: string) {
    if (this.mode === 'client') {
      this.clientFilterText = filterText
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
      this.shell.setScrollHeight(this.scroller)
      this.viewport.refresh() // 刷新表格数据
    } else {
      // console.warn('pagination mode need backend and add money')
      this.applyServerQuery({
        ...this.serverQuery,
        filterText,
      }).catch(console.warn)
    }
  }

  // server 模式下的筛选 
  // 更新 query -> 清缓存 -> 拉取第一页 -> 更新 totalRows \
  // -> 重建 VirtualScroller -> 通知 viewport.setScroller 和 refresh table
  private async applyServerQuery(next: ITableQuery) {
    this.serverQuery = {
      sortKey: next.sortKey,
      sortDirection: next.sortDirection,
      filterText: next.filterText ?? ""
    }
    // 更新 DataManager 的 query, 缓存也会自动清除
    this.dataManager.setQuery(this.serverQuery)
    // 筛选排序后回到顶部, 避免当前滚动位置超出 新 totalRows
    this.shell.scrollContainer.scrollTop = 0
    // 主动来取第 0 页, 让 totalRows 先有值并缓存 page0
    await this.dataManager.getPageData(0)
    const totalRows = this.dataManager.getServerTotalRows()
    if (typeof totalRows === 'number') {
      this.config.totalRows = totalRows
    }
    // totalRows 变化后必须重建 scroller, 否则滚动高度不准
    this.scroller = new VirtualScroller(this.config)
    this.viewport.setScroller(this.scroller)
    // 一定要记得重设滚动容器的高
    this.shell.setScrollHeight(this.scroller)
    // 最后再刷新可视区
    this.viewport.refresh()
  }

  // 清空
  public destroy() {
    this.shell?.destroy()
    this.viewport?.destroy()
  }
}
