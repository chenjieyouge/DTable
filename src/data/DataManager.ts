import type { IConfig, ITableQuery, ColumnFilterValue, IColumn } from '@/types'

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
      filterText: next.filterText ?? '',
      columnFilters: next.columnFilters ?? {} // 缓存 key / fetchPageData 入参都依赖它
    }
    this.clearCache()
  }

  // 在 VirtualTAble 刷新 scroller 时获取最新 totalRows 
  public getServerTotalRows() {
    return this.serverTotalRows
  }

  // 手动序列化: 拼接 queryKey, 避免 JSON.stringify 顺序导致 key 错乱
  private getQueryKey(query?: ITableQuery) {
    const q = query ?? this.currentQuery 
    const sortKey = q.sortKey ?? ''
    const sortDirection = q.sortDirection ?? ''
    const filterText = (q.filterText ?? '').toLowerCase()
    // 序列化 columnFilters (保证顺序稳定, 支持 set/text/dateRange/numberRange 等类型)
    let filterStr = ''
    if (q.columnFilters && Object.keys(q.columnFilters).length > 0) {
      const sorted = Object.keys(q.columnFilters).sort()
      //  sorted-item: { kind: 'set', values: string[] }
      filterStr = sorted
        // .map(k => `${k}:[${q.columnFilters![k].sort().join(',')}]`)
        .map(k => {
          const f = q.columnFilters![k]
          if (f.kind === 'set') {
            return `${k}:set:[${f.values.sort().join(',')}]`

          } else if (f.kind === 'text') {
            return `${k}:text:${f.value}`

          } else if (f.kind === 'dateRange') {
            return `${k}:date:${f.start ?? ''}~${f.end ?? ""}`

          } else if (f.kind === 'numberRange') {
            return `${k}:num:${f.min ?? ''}~${f.max ?? ''}`

          } // else if 后续有其他值类型也能加
          return ''
        })
        .join('|') // 将数组拼接为字符串, 按照 "|" 分割项
    }
    // ":" 和 "|" 是自定义分隔符
    return `${sortKey}:${sortDirection}|f=${filterText}|cf=${filterStr}` 
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

  // 获取全量数据
  public getOriginalFullData(): Record<string, any>[] {
    return this.originalFullData ?? []
  }

  // 获取全量长度, 拥有更新 totalRows
  public getFullDataLength(): number {
    return this.fullData?.length || 0
  }

  // 异步: 获取某页数据 (带防重, 缓存)
  public async getPageData(pageIndex: number, query?: ITableQuery): Promise<Record<string, any>[]> {
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
  public getRowData(rowIndex: number): Record<string, any> | undefined {
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

  // clinet 模式下排序 (内存模式), sever 端是端在接口就处理好了的
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

  // 辅助方法: 统一的筛选匹配逻辑
  public matchesFilters(row: Record<string, any>, columnFilters: Record<string, ColumnFilterValue>): boolean {
    for (const key in columnFilters) {
      const filter = columnFilters[key]
      const cellVal = row[key]
      // 按类型分别匹配
      if (filter.kind === 'set') {
        if (filter.values.length === 0) continue 
        if (!filter.values.includes(String(cellVal ?? ''))) return false 

      } else if (filter.kind === 'text') {
        if (!filter.value) continue
        if (!String(cellVal ?? '').toLowerCase().includes(filter.value.toLowerCase())) {
          return false 
        }

      } else if (filter.kind === 'dateRange') {
        const dateStr = String(cellVal ?? '') // 日期字符串比较不确定是否对
        if (filter.start && dateStr < filter.start) return false 
        if (filter.end && dateStr > filter.end) return false 

      } else if (filter.kind === 'numberRange') {
        const num = Number(cellVal)
        if (isNaN(num)) return false 
        if (filter.min !== undefined && num < filter.min) return false 
        if (filter.max !== undefined && num > filter.max) return false

      } // else if 未来可能还有其他值类型
    }
    return true
  }

  // client 筛选 (仅内存模式用), 支持 set/text/dateRange/numRange 筛选
  public filterData(params: {
    globalText?: string 
    columnFilters?: Record<string, ColumnFilterValue>

  }): void {
    if (!this.originalFullData) return 
    const { globalText = '', columnFilters = {}} = params
    this.fullData = this.originalFullData.filter((row) => {
      // 全局文本筛选
      if (globalText) {
        const match = Object.values(row).some((val) => 
        String(val).toLowerCase().includes(globalText.toLowerCase()))
        if (!match) return false
      }
      // 使用统一的筛选逻辑
      return this.matchesFilters(row, columnFilters)
    })
    this.pageCache.clear()
  }

  // client 模式下, 重置排序
  public resetClientOrder(params: {
    filterText?: string 
    columnFilters?: Record<string, ColumnFilterValue>
  }) {
    // 恢复 client 模式下的 "自然顺序", 否则用户第三次点击排序字段无法复原
    if (!this.originalFullData) return 
    
    const { filterText = '', columnFilters = {} } = params
    const kw = (filterText ?? '').trim().toLowerCase()
    const hasColFilter = Object.keys(columnFilters).length > 0  // 是否有筛选, 等下也要还原筛选状态

    // 若无筛选, 则会原始数据数据顺序即可
    if (!kw && !hasColFilter) {
      this.fullData = [...this.originalFullData] // 不确定是否有性能问题
    } else {
      // 有筛选, 则恢复为原始状态下的筛选结果, 遍历每行
      this.fullData = this.originalFullData.filter(row => {
        if (kw) {
          const match = Object.values(row).some(val => 
            String(val).toLowerCase().includes(kw)
          )
          if (!match) return false
        }
        // 使用统一的筛选逻辑
        return this.matchesFilters(row, columnFilters)
      })
    }
    this.pageCache.clear()
  }

  // client 模式下, 动态计算总结行, 支持 sum, avg, count, max, min, none 聚合
  public computeSummary(columns: IColumn[]): Record<string, any> {
    const summary: Record<string, any> = {}
    // 第一列默认显示 "合计"
    if (columns.length > 0) {
      summary[columns[0].key] = '合计'
    }
    // 从 fullData 中遍历每列, 根据列配置计算聚合值
    columns.forEach((col, index) => {
      if (index === 0) return

      // 若列没配置了 summaryType, 或配置为 none 则直接跳过
      if (!col.summaryType || col.summaryType === 'none') {
        summary[col.key] = ''
        return 
      }

      // 从当前 fullData 中提取该列的所有值, 遍历每行去找, 应该是个耗时操作
      const values = (this.fullData ?? [])
        .map(row => row[col.key])
        .filter(val => val !== null && val !== undefined && val !== '')

      if (values?.length === 0) {
        summary[col.key] = ''
        return 
      }
      // 若配置了 count, 则直接返回计数 (不区分数值, 非数值)
      if (col.summaryType === 'count') {
        summary[col.key] = values.length + ' 项'
        return 
      }
      // 判断是否为数值列, 先强转字符, 在解析为浮点数, 若解析不了则为 NaN, 过滤即可
      const numericValues = values 
        ?.map(v => typeof v === 'number' ? v : parseFloat(String(v)))
        .filter(v =>!isNaN(v))
      
      if (numericValues!.length > 0) {
        // 根据 summaryType 计算不同聚合值
        const summaryType = col.summaryType ?? 'sum' // 默认求和

        switch (summaryType) {
          case 'sum':
            const sum = numericValues.reduce((acc, val) => acc + val, 0)
            summary[col.key] = sum.toFixed(2)
            break

          case 'avg':
            const avg = numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length
            summary[col.key] = avg.toFixed(2)
            break
        
          default:
            summary[col.key] = ''
        }
      } else {
        // 非数值列显示空
        summary[col.key] = ''
      }
    })
    return summary
  }

  // 重置或者测试用
  public clearCache() {
    this.pageCache.clear()
    this.loadingPromises.clear()
  }
}
