import type { IConfig, ITableQuery } from "@/types";
import type { DataStrategy } from "@/table/data/DataStrategy";
import type { TableStore } from "@/table/state/createTableStore";
import type { VirtualViewport } from "@/table/viewport/VirtualViewport";
import type { ITableShell } from "@/table/TableShell";
import { VirtualScroller } from "@/scroll/VirtualScroller";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { RenderScenario, RenderMethod, RenderProtocalValidator } from "@/table/viewport/RenderProtocol";

/**
 * 表格查询协调器
 * 
 * 职责: 
 * - 统一处理排序, 筛选等查询操作
 * - 协调 dataStrategy, viewport, scroller 等的更新
 * - 管理总结行和状态栏的更新
 */
export class TableQueryCoordinator {
  private config: IConfig
  private dataStrategy: DataStrategy 
  private store: TableStore
  private viewport: VirtualViewport
  private shell: ITableShell
  private renderer: DOMRenderer
  private getScroller: () => VirtualScroller
  private setScroller: (scroller: VirtualScroller) => void 

  constructor(params: {
    config: IConfig,
    dataStrategy: DataStrategy,
    store: TableStore,
    viewport: VirtualViewport,
    shell: ITableShell,
    renderer: DOMRenderer,
    getScroller: () => VirtualScroller,
    setScroller: (scroller: VirtualScroller) => void

  }) {
    this.config = params.config
    this.dataStrategy = params.dataStrategy
    this.store = params.store
    this.viewport = params.viewport
    this.shell = params.shell
    this.renderer = params.renderer
    this.getScroller = params.getScroller
    this.setScroller = params.setScroller
  }

  /**
   * 应用查询 (统一入口)
   */
  public async applyQuery(query: ITableQuery): Promise<void> {
    // 1. 调用 strategy 应用查询
    const result = await this.dataStrategy.applyQuery(query)
    // 2. 更新 totalRows 和 scroller 
    this.config.totalRows = result.totalRows
    this.store.dispatch({ type: 'SET_TOTAL_ROWS', payload: { totalRows: result.totalRows } })

    const newScroller = new VirtualScroller(this.config)
    this.setScroller(newScroller)
    this.viewport.setScroller(newScroller)
    this.shell.setScrollHeight(newScroller)
    // 3. 若需要回到顶部
    if (result.shouldResetScroll) {
      this.shell.scrollContainer.scrollTop = 0
    }
    // 4. 协议校验
    if (process.env.NODE_ENV === 'development') {
      RenderProtocalValidator.validate(
        RenderScenario.QUERY_CHANGE,
        RenderMethod.REFRESH,
        'TableQueryCoordinator.applyQuery'
      )
    }
    // 5. 刷新可视区, 状态栏
    this.viewport.refresh()
    this.updateStatusBar()
    // 6. 刷新总结行
    await this.refreshSummary()
  }

  /** 刷新总结行 */
  public async refreshSummary(): Promise<void> {
    // 检查总结行是否存在先
    if (!this.config.showSummary) return 
    const row = this.shell?.summaryRow
    if (!row) return 

    const state = this.store.getState()
    const query: ITableQuery = {
      sortKey: state.data.sort?.key,
      sortDirection: state.data.sort?.direction,
      filterText: state.data.mode === 'client' ? state.data.clientFilterText : state.data.query.filterText,
      columnFilters: state.data.columnFilters
    }

    const summaryData = await this.dataStrategy.getSummary(query)
    if (summaryData) {
      this.renderer.updateSummaryRow(row, summaryData)
    }
  }

  /** 更新状态栏 (使用 DOM id 查找) */
  public updateStatusBar(): void {

    if (!this.store) {
      console.warn('[updateStatusBar] store 未初始化')
      return 
    }

    const tableId = this.config.tableId || 'default'
    const totalRowsEl = document.getElementById(`table-total-rows-${tableId}`)
    const pageIndicator = document.getElementById(`table-page-indicator-${tableId}`)
    const currentPageEl = document.getElementById(`table-current-page-${tableId}`)
    const totalPagesEl = document.getElementById(`table-total-pages-${tableId}`)

    const mode = this.store.getState().data.mode 

    if (totalRowsEl) {
      const state = this.store.getState()
      // 显示总行数
      totalRowsEl.textContent = state.data.totalRows.toString()
      // 只在 server 模式, 才显示页码指示器
      if (mode === 'server' && pageIndicator && currentPageEl && totalPagesEl) {
        pageIndicator.style.display = 'flex'
        // 页码计算: 总页数, 当前页
        const totalPages = Math.ceil(state.data.totalRows / this.config.pageSize)
        currentPageEl.textContent = (state.data.currentPage + 1).toString()
        totalPagesEl.textContent = totalPages.toString()

      } else if (pageIndicator) {
        pageIndicator.style.display = 'none'
      }
    }
  }

}