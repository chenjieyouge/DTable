import { CLIENT_SIDE_MAX_ROWS } from '@/config/Constant'
import { TableConfig } from '@/config/TableConfig'
import { DataManager } from '@/data/DataManager'
import { DOMRenderer } from '@/dom/DOMRenderer'
import { VirtualScroller } from '@/scroll/VirtualScroller'
import type { IConfig, IUserConfig, IPageResponse } from '@/types'
import { caculatePageRange } from '@/utils/pageUtils'
import { SortState } from '@/table/core/SortState'
import type { SortDirection } from '@/table/core/SortState'
import { HeaderSortBinder } from '@/table/interaction/HeaderSortBinder'
import { bootstrapTable } from '@/table/data/bootstrapTable'

// 主协调者, 表格缝合怪;  只做调度, 不包含业务逻辑
export class VirtualTable {
  private config: IConfig // 内部用完整配置

  private mode: 'client' | 'server' = 'server' // 走全量还是走分页

  private sortState: SortState = new SortState()
  private headerSortBinder = new HeaderSortBinder()

  private dataManager: DataManager
  private renderer: DOMRenderer
  private scroller: VirtualScroller

  private scrollContainer!: HTMLDivElement
  private virtualContent!: HTMLDivElement // 非虚拟模式下不创建
  private summaryRow?: HTMLDivElement

  private visibleRows = new Set<number>() // 可见的行
  private rowElementMap = new Map<number, HTMLDivElement>() // 缓存已见的行

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
    this.bindScrollEvents()
    this.updateVisibleRows()

    // 通知外部,模式的变化(可选)
    this.config.onModeChange?.(this.mode)
  }

  // 兜底: 通过多次分页请求加载全量数据, 优化浏览器来处理, 用户体验更流畅呀
  private async loadAllDataByPaging(
    totalRows: number
  ): Promise<Record<string, any>[]> {
    const allData: Record<string, any>[] = []
    const totalPages = Math.ceil(totalRows / this.config.pageSize)

    for (let page = 0; page < totalPages; page++) {
      if (!this.config.fetchPageData) {
        return []
      }
      const res = await this.config.fetchPageData(page)
      allData.push(...res.list)
    }
    return allData
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
          this.updateVisibleRows()
        })
      },
      {
        passive: true,
      }
    )
  }

  // 核心调度方法: 计算可见行 -> 创建骨架 -> 加载数据 -> 更新可视区
  private async updateVisibleRows() {
    // 获取当前滚动位置和可视区高度
    const { scrollTop, clientHeight } = this.scrollContainer

    // 计算可视区高度, 排除表头和汇总行
    const viewportHeight =
      clientHeight -
      this.config.headerHeight -
      (this.config.showSummary ? this.config.summaryHeight : 0)

    // 计算可视行范围 [startRow, endRow] 及内容高, translateY 等信息
    const { startRow, endRow, translateY, contentHeight } =
      this.scroller.getScrollInfo(scrollTop, viewportHeight)
    // 拓展: 记录页码更新
    const pageInfo = caculatePageRange(
      startRow,
      endRow,
      this.config.totalRows,
      this.config.pageSize
    )
    this.config.onPageChange?.(pageInfo) // 通知外部, 页面变化啦

    // 设置虚拟内容区的位置和高度
    this.virtualContent.style.transform = `translateY(${translateY}px)`
    this.virtualContent.style.height = `${contentHeight}px`

    // 渲染 [startRow, endRow] 范围内的行
    const newVisibleSet = new Set<number>()
    const fragment = document.createDocumentFragment()

    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
      // 若该行不在就先渲染骨架屏
      newVisibleSet.add(rowIndex)

      if (!this.visibleRows.has(rowIndex)) {
        const rowEl = this.renderer.createSkeletonRow(rowIndex)

        // eg. 行高 20px, 第一行: 0px, 第二行 20px, 第三行高, 40px ...
        rowEl.style.top = `${(rowIndex - startRow) * this.config.rowHeight}px`
        rowEl.dataset.rowIndex = String(rowIndex)

        fragment.appendChild(rowEl)
        this.rowElementMap.set(rowIndex, rowEl)
        this.updateRowData(rowIndex).catch(console.warn)
      } else {
        const rowEl = this.rowElementMap.get(rowIndex)!
        rowEl.style.top = `${(rowIndex - startRow) * this.config.rowHeight}px`
      }
    }

    // 插入新行
    if (fragment.children.length > 0) {
      this.virtualContent.appendChild(fragment)
    }

    // 清理掉移除视口的行
    for (const oldIndex of this.visibleRows) {
      if (!newVisibleSet.has(oldIndex)) {
        const rowEl = this.rowElementMap.get(oldIndex)
        if (rowEl) {
          rowEl.remove()
          this.rowElementMap.delete(oldIndex)
        }
      }
    }

    // 7. 更新 visibleRows 缓存
    this.visibleRows = newVisibleSet
  }

  // 更新某行数据
  private async updateRowData(rowIndex: number) {
    try {
      // 先同步检查缓存
      let rowData = this.dataManager.getRowData(rowIndex)
      if (!rowData) {
        // 若缓存中没有数据, 则触发分页加载
        const pageIndex = Math.floor(rowIndex / this.config.pageSize)
        await this.dataManager.getPageData(pageIndex)
        // 再次同步去获取数据,应该就稳了
        rowData = this.dataManager.getRowData(rowIndex)
      }

      if (rowData !== undefined) {
        const rowEl = this.rowElementMap.get(rowIndex)
        if (rowEl) {
          // 填充上该行的每个单元格数据
          this.renderer.updateDataRow(rowEl, rowData)
        }
      }
    } catch (err) {
      console.warn(`[VirtualTable] Faild to update row ${rowIndex}`, err)
    }
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

  // 刷新表格 (不重建 DOM)
  private refreshTable() {
    // 重新计算滚动区高度
    const dataContainer = this.scrollContainer.querySelector(
      '.data-container'
    ) as HTMLDivElement

    // 先更新滚动容器高度
    if (dataContainer) {
      dataContainer.style.height = `${this.scroller.getActualScrollHeight()}px`
    }
    // 再移除所有已存在的行元素
    // for (const rowEl of this.rowElementMap.values()) {
    //   rowEl.remove()
    // }

    // 先批量处理得了, 应该不会有内存泄露
    if (this.virtualContent) {
      this.virtualContent.replaceChildren()
    }

    // 再清空当前渲染状态, 和缓存
    this.visibleRows.clear()
    this.rowElementMap.clear()
    // 重新渲染可见行
    this.updateVisibleRows()
  }

  // 对外暴露: 是否为客户端模式
  public get isClientMode(): boolean {
    return this.mode === 'client'
  }

  // 排序入口 (当前仅内存模式实现了)
  public sort(sortKey: string, direction: 'asc' | 'desc') {
    if (this.mode === 'client') {
      this.dataManager.sortData(sortKey, direction)
      this.refreshTable() // 排序完就刷新表格, 原始数据还存了一份其实(浅拷贝)
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
      // 更新 totalRows
      this.config.totalRows = this.dataManager.getFullDataLength()
      this.refreshTable() // 刷新表格数据
    } else {
      // TOTO: 分页模式, 得加钱
      console.warn('pagination mode need backend and add money')
    }
  }


  /// 切换排序方法
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
    this.scrollContainer.innerHTML = ''
    this.rowElementMap.clear()
    this.visibleRows.clear()
    
  }
}
