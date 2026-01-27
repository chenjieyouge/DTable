import type { IPageResponse, ITableQuery } from "@/types";

/**
 * 数据策略接口
 * 
 * 目的: 将 client/server 的数据逻辑完全隔离
 * 让 VirtualTable 和 VirtualViewport 不再关心 mode
 */
export interface DataStrategy {
  /** 模式标识 */
  readonly mode: 'client' | 'server'

  /**
   * 初始化引导: 加载初始化数据
   * @returns totalRows - 总行数
   */
  bootstrap(): Promise<{ totalRows: number }>

  /**
   * 同步获取某行数据
   * @param rowIndex - 行索引
   * @returns 行数据, 若未缓存则返回 undefined
   */
  getRow(rowIndex: number): Record<string, any> | undefined

  /**
   * 确保某行数据已加载 (异步)
   * @param rowIndex - 行索引
   */
  ensurePageForRow(rowIndex: number): Promise<void>

  /**
   * 应用查询条件 (排序/筛选等)
   * @param query - 查询条件
   * @returns totalRows - 新的总行数
   * @returns shouldResetScroll - 是否需要回到顶部
   */
  applyQuery(query: ITableQuery): Promise<{
    totalRows: number,
    shouldResetScroll: boolean 
  }>

  /**
   * 获取总结行数据 
   * @param query - 当前查询条件, server 摸刷新需要
   * @returns 总结行数据
   */
  getSummary(query: ITableQuery): Promise<Record<string, any> | null>

  /**
   * 获取当前总行数 (同步)
   */
  getTotalRows(): number 

  /**
   * 获取列的筛选选项 (用于下拉列表)
   * @param columnKey - 列 key 
   * @returns 该列所有的可选值 (去重后)
   */
  getFilterOptions(columnKey: string): string[]
  
}

/**
 * 数据策略工厂参数
 */
export interface DataStrategyFactoryParams {
  mode: 'client' | 'server'

  initialData?: Record<string, any>[]  // clinet 模式下会直接配置上数据

  pageSize: number // server 分页下, 配置每页多少数据
  columns: any[]  // 用于 client 模式计算总结行

  fetchPageData?: (pageIndex: number, query: ITableQuery) => Promise<IPageResponse>

  fetchSummaryData?: (query: ITableQuery) => Promise<Record<string, any>>
}