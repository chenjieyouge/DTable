import { CLIENT_SIDE_MAX_ROWS } from "@/config/Constant";
import { ClientDataStrategy } from "@/table/data/ClientDataStrategy";
import type { DataStrategy } from "@/table/data/DataStrategy";
import { ServerDataStrategy } from "@/table/data/ServerDataStrategy";
import type { IConfig } from "@/types";


/**
 * 只能决策 并 创建对应的 DataStrategy 
 * - 根据数据量决定 client / server 模式
 * - 返回创建好的 strategy 和 totalRows 
 */
export async function bootstrapStrategy(config: IConfig): Promise<{
  strategy: DataStrategy,
  mode: 'client' | 'server',
  totalRows: number
}> {
  let totalRows: number
  let mode: 'client' | 'server'

  // 场景1: 用户传了全量数据
  if (config.initialData) {
    totalRows = config.initialData?.length
    mode = totalRows <= CLIENT_SIDE_MAX_ROWS ? 'client' : 'server'

    if (mode === 'client') {
      // 直接用全量数据创建 ClientDataStrategy
      const strategy = new ClientDataStrategy(config.initialData, config.columns)
      return { strategy, mode, totalRows }

    } else {
      // 数据量太大, 改用 server 模式
      const strategy = new ServerDataStrategy(
        config.fetchPageData!,
        config.pageSize,
        config.fetchSummaryData
      )
      await strategy.bootstrap()
      return { strategy, mode, totalRows: strategy.getTotalRows() }
    }
  }

  // 场景2: 用户没有传全量数据, 必须有 fetchPageData
  if (!config.fetchPageData) {
    throw new Error('必须提供 initialData 或 fetchPageData 之一!')
  }

  // 先拉取第一页, 判断总数
  const res = await config.fetchPageData(0)
  totalRows = res.totalRows
  mode = totalRows <= CLIENT_SIDE_MAX_ROWS ? 'client' : 'server'

  // 若数据量小, 直接循环拉取全部数据到内存来,  用 cLient 模式爽飞天
  if (mode === 'client') {
    const totalPages = Math.ceil(totalRows / config.pageSize)
    const allData: Record<string, any>[] = []

    for (let page = 0; page < totalPages; page++) {
      const pageRes = await config.fetchPageData(page)
      allData.push(...pageRes.list)
    }

    const strategy = new ClientDataStrategy(allData, config.columns)
    return { strategy, mode, totalRows}

  } else {
    // 大数据量了已经, 则用 server 分页模式
    const strategy = new ServerDataStrategy(
      config.fetchPageData,
      config.pageSize,
      config.fetchSummaryData
    )
    await strategy.bootstrap()
    return { strategy, mode, totalRows: strategy.getTotalRows() }
  }
  
}