import { IConfig, IColumn, ITableQuery, ColumnFilterValue } from "@/types";
import { TableStore } from "@/table/state/createTableStore";
import type { ITableShell } from "@/table/TableShell";
import { ColumnWidthStorage } from "@/utils/ColumnWidthStorage";


/**
 * TableShell 回调函数集合
 * 
 * 职责: 
 * - 封装 VirtualTable 传递给 TableShell 的所有回调函数
 * - 简化 VirtualTable 的 mount 方法
 * - 提供代码可维护性
 */
export class ShellCallbacks {
  constructor(
    private config: IConfig,
    private store: TableStore,
    private mode: 'client' | 'server',
    private originalColumns: IColumn[],
    private widthStorage: ColumnWidthStorage | null,
    private getClientFilterOptions: (key: string) => string[],
    private loadSummaryData: (summaryRow: HTMLDivElement) => void | Promise<void>,
    private onToggleSidePanel?: (panelId: string) => void
  ) {}

  // 获取所有回调函数
  public getCallbacks() {
    return {
      // 回调函数
      onToggleSort: (key: string) => {
        this.store.dispatch({type: 'SORT_TOGGLE', payload: {key}})
      },
      onNeedLoadSummary: (summaryRow: HTMLDivElement) => {
          this.loadSummaryData(summaryRow)
      }, 
      onColumnResizeEnd: (key: string, width: number) => {
        this.store.dispatch({ type: 'COLUMN_WIDTH_SET', payload: { key, width}})
      },
      onColumnOrderChange: (order: string[]) => {
        this.store.dispatch({ type: 'COLUMN_ORDER_SET', payload: { order }})
      },
      onColumnFilterChange: (key: string, filter: ColumnFilterValue | null) => {
        if (!filter) {
          this.store.dispatch({type: 'COLUMN_FILTER_CLEAR', payload: { key } })
        } else {
          this.store.dispatch({ type: 'COLUMN_FILTER_SET', payload: {key, filter } })
        }
      },
      getFilterOptions: async (key: string) => {
        // client 模式 从 originalFullData 推导出可选值 (topN 避免百万次枚举)
        if (this.mode === 'client') {
          return this.getClientFilterOptions(key)
        }
        // server 模式 若用户提供了 fetchFilterOptions 接口, 就去拉
        if (this.config.fetchFilterOptions) {
          const query = this.store.getState().data.query 
          return this.config.fetchFilterOptions({ key, query})
        }
        // 未提供或者没有数据, 则返回空数组 (UI 仍可打开, 但没有选项)
        return []
      },
      getCurrentFilter: (key: string) => {
        return this.store.getState().data.columnFilters[key]
      },
      onTableResizeEnd: (newWidth: number) => {
        this.config.tableWidth = newWidth 
        // 保存整表宽度到 localStorage
        if (this.widthStorage) {
          this.widthStorage.saveTableWidth(newWidth)
        }
        // 同步更新, 表格底部状态栏宽度
        const statusBar = document.querySelector('.vt-status-bar') as HTMLDivElement
        if (statusBar) {
          statusBar.style.width = `${newWidth - 40 }px` // 硬编码了, 40是右侧面板 tab
        }
      },
      getCurrentSort: () => {
        // 列菜单回调
        const state = this.store.getState()
        return state.data.sort
      },
      onMenuSort: (key: string, direction: 'asc' | 'desc' | null) => {
        if (direction === null) {
          this.store.dispatch({ type: 'SORT_SET', payload: { sort: null }})
        } else {
          this.store.dispatch({
            type: 'SORT_SET',
            payload: {
              sort: { key, direction }
            }
          })
        }
      },
      // 列管理面板-相关回调
      getAllColumns: () => {
        return this.originalColumns // 包含隐藏列都要有
      },
      getHiddenKeys: () => {
        return this.store.getState().columns.hiddenKeys
      },
      onColumnToggle: (key: string, visible: boolean) => {
        // 检查是否冻结列 
        const colIndex = this.originalColumns.findIndex(c => c.key === key)
        const isFrozen = colIndex < this.config.frozenColumns 
        if (isFrozen && !visible) {
          // 冻结列不让隐藏
          console.warn('冻结列不允许隐藏')
          return 
        }
        if (visible) {
          this.store.dispatch({ type: 'COLUMN_SHOW', payload: { key } })
        } else {
          this.store.dispatch({ type: 'COLUMN_HIDE', payload: { key } })
        }
      },
      onShowAllColumns: () => {
        // 批量-显示所有隐藏列
        const hiddenKeys = this.store.getState().columns.hiddenKeys
        if (hiddenKeys.length > 0) {
          this.store.dispatch({
            type: 'COLUMN_BATCH_SHOW',
            payload: { keys: hiddenKeys }
          })
        }
      },
      onHideAllColumns: () => {
        // 批量-隐藏所有列
        const allKeys = this.originalColumns.map(col => col.key)
        this.store.dispatch({
          type: 'COLUMN_BATCH_HIDE',
          payload: { keys: allKeys }
        })
      },
      onResetColumns: () => {
        // 重置, 显示所有列
        this.store.dispatch({ type: 'COLUMNS_RESET_VISIBILITY' })
      },
      onToggleSidePanel: this.onToggleSidePanel,

      // 后续更多回调拓展... virtual -> shell -> binder -> view 
    }

  }
}