import type { IColumn, IConfig } from "@/types";
import type { TableStore } from "@/table/state/createTableStore";
import type { TableState } from "@/table/state/types";

/**
 * 表格状态同步器
 * 
 * 职责: 
 * - 同步 config.columns 和 state.columns 之间的状态
 * - 处理列顺序, 列宽, 冻结列等配置
 */
export class TableStateSync {
  private config: IConfig 
  private store: TableStore 
  private originalColumns: IColumn[]

  constructor(params: {
    config: IConfig,
    store: TableStore,
    originalColumns: IColumn[]
  }) {
    this.config = params.config
    this.store = params.store
    this.originalColumns = params.originalColumns
  }

  /** 将 config.columns 的顺序同步到 state */
  public syncColumnOrderToState(): void {
    const order = this.config.columns.map(col => col.key)
    this.store.dispatch({ type: 'COLUMN_ORDER_SET', payload: { order } })
  }

  /** 将 state 中的列配置, 应用会 config */
  public applyColumnsFromState(): void {
    // 1. 先从状态中取出来
    const state = this.store.getState()
    const { order, widthOverrides, frozenCount, hiddenKeys } = state.columns

    // 2. 按 state.order 重新排列列
    const orderedColumns: IColumn[] = []
    for (const key of order) {
      const col = this.originalColumns.find(col => col.key === key)
      if (col) {
        orderedColumns.push({ ...col })
      }
    }

    // 3. 应用列宽覆盖
    for (const col of orderedColumns) {
      if (widthOverrides[col.key]) {
        col.width = widthOverrides[col.key]
      }
    }

    // 4. 过滤掉隐藏列
    const visibleColumns = orderedColumns.filter(col => !hiddenKeys.includes(col.key))
    
    // 5. 更新 config 
    this.config.columns = visibleColumns
    this.config.frozenColumns = frozenCount
  }

  /** 获取原始列配置 */
  public getOriginalColumns(): IColumn[] {
    return this.originalColumns
  }

  /** 更新原始列配置 */
  public setOriginalColumns(columns: IColumn[]) : void {
    this.originalColumns = columns
  }

}