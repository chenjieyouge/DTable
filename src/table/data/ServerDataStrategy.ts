import type { DataStrategy } from "@/table/data/DataStrategy";
import type { IPageResponse, ITableQuery } from "@/types";

/**
 * Server 数据策略
 * 
 * - 管理分页缓存 pageCache
 * - 调用 fetchPageData 拉取数据
 * - query 变化时清空缓存
 */
export class ServerDataStrategy implements DataStrategy {
  readonly mode = 'server' as const 

  private pageCache = new Map<number, Record<string, any>[]>()
  private loadingPromises = new Map<number, Promise<void>>() // 防止重复请求
  private currentQuery: ITableQuery = {}
  private totalRows: number = 0
  private pageSize: number 

  private fetchPageData: (pageIndex: number, query: ITableQuery) => Promise<IPageResponse>

  private fetchSummaryData?: (query: ITableQuery) => Promise<Record<string, any>>

  // 初始化, 用户需要传入的参数: fetchData, pageSize, fetchSummaryData 可选 
  constructor(
    fetchPageData: (pageIndex: number, query: ITableQuery) => Promise<IPageResponse>,
    pageSize: number,
    fetchSummaryData?: (query: ITableQuery) => Promise<Record<string, any>>
  ) {
    // 将用户传入的属性, 绑定给实例对象上
    this.fetchPageData = fetchPageData
    this.pageSize = pageSize
    this.fetchSummaryData = fetchSummaryData
  }

  public async bootstrap(): Promise<{ totalRows: number; }> {
    // 加载第 1 页数据, 页面索引也是从 0 开始的
    await this.ensurePageForRow(0)
    return { totalRows: this.totalRows }
  }

  public getRow(rowIndex: number): Record<string, any> | undefined {
    // 1. 根据行索引 和 每页多少条数据, 计算出页码, 然后去从缓存中找到该页面数据
    const pageIndex = Math.floor(rowIndex / this.pageSize)
    const page = this.pageCache.get(pageIndex)

    if (!page) return undefined
    // 2. 用行索引 和 每页多少条数据 取余, 得出该行数据在页面中的偏移量
    const indexInPage = rowIndex % this.pageSize
    return page[indexInPage]
  }

  public async ensurePageForRow(rowIndex: number): Promise<void> {
    // 计算该行数据应该在 第几页
    const pageIndex = Math.floor(rowIndex / this.pageSize)

    // 若页面已缓存, 直接返回
    if (this.pageCache.has(pageIndex)) {
      return 
    }

    // 若正在加载, 等待加载完成
    if (this.loadingPromises.has(pageIndex)) {
      await this.loadingPromises.get(pageIndex)
      return 
    }

    // 开始加载
    const loadingPromises = this.loadPage(pageIndex)
    this.loadingPromises.set(pageIndex, loadingPromises)

    try {
      await loadingPromises
    } finally {
      this.loadingPromises.delete(pageIndex)
    }
  }

  public async applyQuery(query: ITableQuery): Promise<{ totalRows: number; shouldResetScroll: boolean; }> {
    // 1. 清空缓存
    this.pageCache.clear()
    this.loadingPromises.clear()
    // 2. 更新 currentQuery
    this.currentQuery = query
    // 3. 加载第 0 页
    await this.ensurePageForRow(0)
    
    return Promise.resolve({
      totalRows: this.totalRows,
      shouldResetScroll: true  // server 模式也回调顶部
    })
  }

  public async getSummary(query: ITableQuery): Promise<Record<string, any> | null> {
    if (!this.fetchSummaryData) {
      return null 
    }

    try {
      const summaryData = await this.fetchSummaryData(query || this.currentQuery)
      return summaryData

    } catch (err) {
      console.error('[ServerDataStrategy] 加载中结婚失败: ', err)
      return null 
    }
  }

  public getTotalRows(): number {
    return this.totalRows
  }

  /** 异步加载某一页数据 */
  private async loadPage(pageIndex: number): Promise<void> {
    try {
      const result = await this.fetchPageData(pageIndex, this.currentQuery)
      // 适配统一的分页返回结构: IPageResponse: { list totalRows } 
      this.pageCache.set(pageIndex, result.list)
      this.totalRows = result.totalRows
      
    } catch (err) {
      console.error(`[ServerDataStrategy] 加载第 ${pageIndex} 页失败:`, err)
      throw err
    }
  }


}