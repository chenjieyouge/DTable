import { CLIENT_SIDE_MAX_ROWS} from '@/config/Constant'
import type {IConfig} from '@/types'
import { DataManager } from '@/data/DataManager'

export async function bootstrapTable(config: IConfig, dataManager: DataManager) {
  let totalRows: number  
  let firstPageList: Record<string, any>[]

  // 若用户传了全量数据, 则用索引获取第一页数据
  if (config.initialData) {
    totalRows = config.initialData.length 
    firstPageList = config.initialData.slice(0, config.pageSize)
  } else {
    // 用户不传初始化数据, 也不提供分页接口, 则直接报错处理, 不可能启动表格嘛
    if (!config.fetchPageData) {
      throw new Error(' no initial data and no page data fetch function!')
    }
    const res = await config.fetchPageData(0)
    totalRows = res.totalRows
    firstPageList = res.list
  }

  // 智能决策模式, 根据数据量大小, 选走内存模式, 还是大数据模式
  const mode: 'client' | 'server' = totalRows <= CLIENT_SIDE_MAX_ROWS ? 'client' : 'server'
  if (mode === 'client') {
    if (config.initialData) {
      // 用户传了全量数据, 将将其全部缓存下来 
      dataManager.cacheFullData(config.initialData)
    } else {
      // 用户没有传初始数据, 且也没有配置请求数据接口, 则缓存个毛线
      if (!config.fetchPageData) {
        dataManager.cacheFullData([])
      } else {
        // 用户没有传初始数据, 但是配置了分页请求接口, 则循环分页读取全部数据, 重复利用 client 模式走内存优势
        const totalPages = Math.ceil(totalRows / config.pageSize)
        const allData: Record<string, any>[] = []
        for (let page = 0; page < totalPages; page++) {
          const res = await config.fetchPageData(page)
          allData.push(...res.list)
        }
        dataManager.cacheFullData(allData) // 将全部数据缓存下来
      }
    }

  } else {
    // 服务器模式, 只缓存第一页数据
    dataManager.cachePage(0, firstPageList)
  }

  return { mode, totalRows }
}