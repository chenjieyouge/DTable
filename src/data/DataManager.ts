// 数据加载与缓存

import { IConfig } from '@/types'

// 剥离数据逻辑, 支持 mock / api 切换
export class DataManager {
  private pageCache = new Map<number, Record<string, any>[]>()
  private loadingPromises = new Map<number, Promise<Record<string, any>[]>>()
  private config: IConfig
  private summaryData: Record<string, any> | null = null

  constructor(config: IConfig) {
    this.config = config
  }

  // 缓存整页数据
  cachePage(pageIndex: number, data: Record<string, any>[]) {
    this.pageCache.set(pageIndex, data)
  }

  // 异步: 获取某页数据 (带防重, 缓存)
  async getPageData(pageIndex: number): Promise<Record<string, any>[]> {
    // 若该页面正在请求数据中, 则原地等待, 勿重复请求(防抖)
    if (this.loadingPromises.has(pageIndex)) {
      return this.loadingPromises.get(pageIndex)!
    }

    // 若该页面数据已经在缓存池中了, 则取出来即可
    if (this.pageCache.has(pageIndex)) {
      return this.pageCache.get(pageIndex)!
    }

    // 若该页面, 既没在当前请求中, 也没在缓存中, 则请求后端数据
    const promise = this.config
      .fetchPageData(pageIndex)
      .then((res) => {
        // 先缓存页面数据, 并标记该页面已加载完
        this.pageCache.set(pageIndex, res.list)
        this.loadingPromises.delete(pageIndex)

        // 控制缓存页面队列动态平衡, 超过设置的阈值, 则清理掉队列头部的
        // new -> {1: data, 2: data, 10: data} => {2: data, ..., nnew}
        if (this.pageCache.size > this.config.maxCachedPages) {
          const firstKey = this.pageCache.keys().next().value!
          this.pageCache.delete(firstKey) // 满员后, 每后排一个, 则前面处理一个
        }
        return res.list
      })
      .catch((err) => {
        this.loadingPromises.delete(pageIndex)
        throw new Error(`Faild to load page ${pageIndex}, err`)
      })

    this.loadingPromises.set(pageIndex, promise) // 标记当前页面数据加载OK
    return promise
  }

  // 同步: 仅从缓存中读取某行, 不触发网络请求
  // 假设要获取第 88行数据, 每页20条, 则坐标为: (88 / 20) -> 第4页 + (88 % 20)-> 8 位
  getRowData(rowIndex: number): Record<string, any> | undefined {
    const { pageSize } = this.config // 分页配置的, 每页加载多少条
    const pageIndex = Math.floor(rowIndex / this.config.pageSize) // 数据在第几页
    const offset = rowIndex % pageSize

    const pageData = this.pageCache.get(pageIndex) // 只让从缓存中读取
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

  // 重置或者测试用
  clearCache() {
    this.pageCache.clear()
    this.loadingPromises.clear()
  }
}
