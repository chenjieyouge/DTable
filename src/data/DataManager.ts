import type { IConfig, ITableQuery } from '@/types'

// 剥离数据逻辑, 支持 mock / api 切换
export class DataManager {
  private config: IConfig

  private currentQuery: ITableQuery = {}
  private serverTotalRows: number | null = null 
  // 缓存 key = `${queryKey}::${pageIndex}`, 避免不同筛选排序条件互相串数据
  private pageCache = new Map<string, Record<string, any>[]>()
  private loadingPromises = new Map<string, Promise<Record<string, any>[]>>()

  private summaryData: Record<string, any> | null = null
  // 全量数据 + 原始备份 (用于筛选后还原)
  private fullData: Record<string, any>[] | null = null
  private originalFullData: Record<string, any>[] | null = null // 筛选/排序等用

  constructor(config: IConfig) {
    this.config = config
  }

  // 外部更新 query, 在 sever 模式排序/筛选变化时调用
  public setQuery(next: ITableQuery) {
    this.currentQuery = {
      sortKey: next.sortKey,
      sortDirection: next.sortDirection,
      filterText: next.filterText ?? ''
    }
    this.clearCache()
  }

  // 在 VirtualTAble 刷新 scroller 时获取最新 totalRows 
  public getServerTotalRows() {
    return this.serverTotalRows
  }

  // 手动拼接 queryKey, 避免 JSON.stringify 顺序导致 key 错乱
  private getQueryKey(query?: ITableQuery) {
    const q = query ?? this.currentQuery 
    const sortKey = q.sortKey ?? ''
    const sortDirection = q.sortDirection ?? ''
    const filterText = (q.filterText ?? '').toLowerCase()
    return `${sortKey}:${sortDirection}|f=${filterText}` // ":" 和 "|" 是自定义分隔符
  }

  private getPageCacheKey(pageIndex: number, query?: ITableQuery) {
    return `${this.getQueryKey(query)}::${pageIndex}` // "::" 也是自定义分隔符
  }

  // 缓存整页数据-后端分页
  public cachePage(pageIndex: number, data: Record<string, any>[]) {
    const cacheKey = this.getPageCacheKey(pageIndex)
    this.pageCache.set(cacheKey, data)
  }

  // 缓存全量数据 (同时保存原始副本)
  public cacheFullData(data: Record<string, any>[]) {
    this.fullData = [...data] // 浅拷贝
    this.originalFullData = [...data]
    this.pageCache.clear() // 清理分页缓存
  }

  // 获取全量长度, 拥有更新 totalRows
  public getFullDataLength(): number {
    return this.fullData?.length || 0
  }

  // 异步: 获取某页数据 (带防重, 缓存)
  async getPageData(pageIndex: number, query?: ITableQuery): Promise<Record<string, any>[]> {
    const cacheKey = this.getPageCacheKey(pageIndex, query)
    // 同一个 page + query 的请求防重复
    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey)!
    }

    // 若该页面数据已经在缓存池中了, 则取出来即可
    if (this.pageCache.has(cacheKey)) {
      return this.pageCache.get(cacheKey)!
    }

    // 若该页面, 既没在当前请求中, 也没在缓存中, 则请求后端数据
    if (!this.config.fetchPageData) return []
    const promise = this.config
      .fetchPageData(pageIndex, query ?? this.currentQuery)
      .then((res) => {
        // server 模式下, totalRows 可能随着筛选变化, 要记录更新
        this.serverTotalRows = res.totalRows
        // 先缓存页面数据, 并标记该页面已加载完
        this.pageCache.set(cacheKey, res.list)
        this.loadingPromises.delete(cacheKey)

        // 缓存队列淘汰策略: 超过阈值, 则就删除最早插入的一条, 先进先出
        // new -> {1: data, 2: data, 10: data} => {2: data, ..., nnew}
        if (this.pageCache.size > this.config.maxCachedPages) {
          const firstKey = this.pageCache.keys().next().value!
          this.pageCache.delete(firstKey) // 满员后, 每后排一个, 则前面处理一个
        }
        return res.list
      })
      .catch((err) => {
        this.loadingPromises.delete(cacheKey)
        throw new Error(`Faild to load page ${pageIndex}, ${String(err)}`)
      })
    // 标记当前页面数据加载OK
    this.loadingPromises.set(cacheKey, promise)
    return promise
  }

  // 同步: 仅从缓存中读取某行, 不触发网络请求
  // 假设要获取第 88行数据, 每页20条, 则坐标为: (88 / 20) -> 第4页 + (88 % 20)-> 8 位
  getRowData(rowIndex: number): Record<string, any> | undefined {
    if (rowIndex < 0 || !this.config.totalRows) {
      return undefined
    }

    // 内存模式下, 直接走索引
    if (this.fullData) {
      return this.fullData[rowIndex]
    }

    // 分页模式, 原有逻辑
    const { pageSize } = this.config // 分页配置的, 每页加载多少条
    const pageIndex = Math.floor(rowIndex / this.config.pageSize) // 数据在第几页
    const offset = rowIndex % pageSize

    const cacheKey = this.getPageCacheKey(pageIndex)
    const pageData = this.pageCache.get(cacheKey) // 只让从缓存中读取
    if (!pageData) return undefined // 未加载

    return pageData[offset]
  }

  // 获取总结行数据 (若有)
  async getSummaryData(): Promise<Record<string, any> | null> {
    if (this.summaryData) return this.summaryData
    if (!this.config.fetchSummaryData) return null
    if (typeof this.config.fetchPageData !== 'function') {
      return null
    }

    try {
      this.summaryData = await this.config.fetchSummaryData()
      return this.summaryData
    } catch (err) {
      console.error('Failed to load summary: ' + err)
      return null
    }
  }

  // 客户端排序 (内存模式), sever 端是端在接口就处理好了的
  public sortData(sortKey: string, direction: 'asc' | 'desc') {
    if (!this.fullData) return

    // sort(() => n): n
    this.fullData.sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]

      // 处理 null / undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (aVal < bVal) return direction === 'asc' ? -1 : 1
      if (aVal > bVal) return direction === 'asc' ? 1 : -1
      return 0
    })

    this.pageCache.clear() // 排序后, 清除数据缓存
  }

  // 客户端筛选 (仅内存模式用)
  public filterData(predicate: (row: Record<string, any>) => boolean): void {
    if (!this.originalFullData) return
    this.fullData = this.originalFullData.filter(predicate)
    this.pageCache.clear()
  }

  public resetClientOrder(filterText: string) {
    // 恢复 client 模式下的 "自然顺序", 否则用户第三次点击排序字段无法复原
    if (!this.originalFullData) return 
    const kw = (filterText ?? '').trim().toLowerCase()
    if (!kw) {
      // 无筛选, 则回原始数据顺序, (量大可能回有性能问题呀)
      this.fullData = [...this.originalFullData]
    } else {
      // 有筛选, 则恢复为, 原始状态下的筛选结果
      this.fullData = this.originalFullData.filter((row) => {
        Object.values(row).some((val) => 
          String(val).toLowerCase().includes(kw)
        )
      })
    }
    this.pageCache.clear()
  }

  // 重置或者测试用
  clearCache() {
    this.pageCache.clear()
    this.loadingPromises.clear()
  }
}
