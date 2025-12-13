import { TableConfig } from '@/config/TableConfig'
import { DataManager } from '@/data/DataManager'
import { DOMRenderer } from '@/dom/DOMRenderer'
import { VirtualScroller } from '@/scroll/VirtualScroller'
import { IConfig, IUserConfig } from '@/types'
import { caculatePageRange } from '@/utils/pageUtils'

// 主协调者, 表格缝合怪;  只做调度, 不包含业务逻辑
export class VirtualTable {
  private config: IConfig // 内部用完整配置
  private dataManager: DataManager
  private renderer: DOMRenderer
  private scroller: VirtualScroller

  private scrollContainer!: HTMLDivElement
  private virtualContent!: HTMLDivElement
  private summaryRow?: HTMLDivElement

  private visibleRows = new Set<number>() // 可见的行
  private rowElementMap = new Map<number, HTMLDivElement>() // 缓存已见的行

  constructor(userConfig: IUserConfig) {
    // 初始化配置
    const tableConfig = new TableConfig(userConfig)
    this.config = tableConfig.getAll()

    this.dataManager = new DataManager(this.config)
    this.renderer = new DOMRenderer(this.config)
    this.scroller = new VirtualScroller(this.config)
    this.init()
  }

  // 组装主流程
  private init() {
    this.createDOM()
    this.bindEvents()
    // 初始加载可视区
    this.updateVisibleRows()
  }

  // 子流程补充
  private createDOM() {
    // 创建外层滚动容器, 对应 .table-container
    this.scrollContainer = document.querySelector(
      this.config.container
    ) as HTMLDivElement

    if (!this.scrollContainer) {
      throw new Error(`Container ${this.config.container} not found`)
    }

    // 清空并设置容器类名 (样式由 css 控制)
    this.scrollContainer.className = 'table-container'
    this.scrollContainer.innerHTML = ''
    // 表格宽高需要配置
    this.scrollContainer.style.width = `${this.config.tableWidth}px`
    this.scrollContainer.style.height = `${this.config.tableHeight}px`

    // 注入 css 变量
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

    // 创建 wrapper, 用户包裹表格数据, 横向滚动
    const tableWrapper = document.createElement('div')
    tableWrapper.className = 'table-wrapper'
    // 计算总列宽给到 wrpper 以支持横向滚动
    const totalWidth = this.config.columns.reduce(
      (sum, col) => sum + col.width,
      0
    )
    tableWrapper.style.width = `${totalWidth}px`

    // 创建表头行-必有
    const header = this.renderer.createHeaderRow()
    tableWrapper.appendChild(header)

    // 创建总结行-可能有
    if (this.config.showSummary) {
      this.summaryRow = this.renderer.createSummaryRow()
      tableWrapper.appendChild(this.summaryRow)
      // 立即加载合计行数据, 或者延迟到首屏渲染也行
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

  // 监听 scroll 事件
  private bindEvents() {
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

  // 清空
  public destroy() {
    this.scrollContainer.innerHTML = ''
    this.rowElementMap.clear()
    this.visibleRows.clear()
  }
}
