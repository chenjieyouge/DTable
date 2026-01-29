import type { IConfig, IColumn } from "@/types";
import type { DataStrategy } from "@/table/data/DataStrategy";
import type { TableStore } from "@/table/state/createTableStore";
import { createTableStore } from "@/table/state/createTableStore";
import { TableStateSync } from "@/table/core/TableStateSync";
import { TableLifecycle } from "@/table/core/TableLifecycle";
import { ServerDataStrategy } from "@/table/data/ServerDataStrategy";
import { bootstrapStrategy } from "@/table/data/bootstrapStrategy";

/** 模式, 数据策略, 状态, 状态同步, 声明周期 */
export interface InitResult {
  dataStrategy: DataStrategy
  mode: 'client' | 'server'
  store: TableStore
  stateSync: TableStateSync
  lifecycle: TableLifecycle
}

/** 
 * server 模式初始化
 *  */
export function initServerMode(
  config: IConfig,
  originalColumns: IColumn[]
): InitResult {

  const mode = 'server'
  const dataStrategy = new ServerDataStrategy(config.fetchPageData!, config.pageSize)
  const store = createTableStore({
    columns: originalColumns,
    mode,
    frozenCount: config.frozenColumns
  })

  const stateSync = new TableStateSync({ config, store, originalColumns })
  stateSync.syncColumnOrderToState() 

  const lifecycle = new TableLifecycle({
    config,
    dataStrategy,
    store,
    originalColumns
  })

  return { mode, dataStrategy, store, stateSync, lifecycle }
}

/**
 * client 模式初始化
 */
export async function initClientMode(
  config: IConfig,
  originalColumns: IColumn[]
): Promise<InitResult> {

  const { strategy: dataStrategy, mode, totalRows } = await bootstrapStrategy(config)
  config.totalRows = totalRows

  const store = createTableStore({
    columns: originalColumns,
    mode,
    frozenCount: config.frozenColumns
  })
  store.dispatch({ type: 'SET_TOTAL_ROWS', payload: { totalRows } })

  const stateSync = new TableStateSync({ config, store, originalColumns })
  stateSync.syncColumnOrderToState()

  const lifecycle = new TableLifecycle({
    config,
    dataStrategy,
    store,
    originalColumns
  })

  return { mode, dataStrategy, store, stateSync, lifecycle }
}