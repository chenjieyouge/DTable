import type { IColumn, ITableQuery, ColumnFilterValue, SortEntry } from "@/types";

export type TableMode = 'client' | 'server'
export type SortValue = SortEntry | null 

export interface TableState {
  // 数据域状态: 决定是 client/server + query
  data: {
    mode: TableMode
    query: ITableQuery // 当前 serverQuery, 未来拓展列级别的过滤, 类似飞书表格
    clientFilterText: string // client下, 全局关键字搜索
    sort: SortValue  // 排序三态:  desc->asc-null (单列, 兼容旧字段)
    sorts: SortEntry[] // 多列排序 (优先级从前到后, 空数组 = 无排序)
    columnFilters: Record<string, ColumnFilterValue> // 列值筛选 (升级为联合类型)
    totalRows: number // 总行数
    currentPage: number // server 模式下的当前页码
    groupCollapsed: string[] // 已折叠的分组 key 数组 (行分组)
  }
  // 列域状态: 当前只做顺序, 冻结前 N 列, 宽度覆写, 不做隐藏列
  columns: {
    order: string[] // 列 key 的顺序, 未来拖拽列就靠它
    frozenCount: number // 冻结前 N 列
    widthOverrides: Record<string, number>  // 列宽重写(px 数值), 未设置用默认配置
    hiddenKeys: string[] // 隐藏的列 key 数组
  }
}

// ======= Action 设计 (先覆盖排序/筛选/列顺序/冻结列/列宽) ============
export type TableAction = 
  | { type: 'INIT_FROM_CONFIG'; payload: { mode: TableMode; columns: IColumn[]; frozenCount: number }}
  | { type: 'SET_MODE'; payload: { mode: TableMode }}
  | { type: 'SET_FILTER_TEXT'; payload: { text: string }}
  | { type: 'CLEAR_FILTER_TEXT' } // 清空筛选
  | { type: 'CLEAR_ALL_FILTERS' } // 一键清空: 全局搜索 + 所有列筛选
  | { type: 'SORT_TOGGLE'; payload: { key: string, multi?: boolean }} // 单列三态 / Shift 多列追加
  | { type: 'SORT_SET'; payload: { sort: SortValue }} // 列值排序
  | { type: 'SORTS_SET'; payload: { sorts: SortEntry[] }} // 多列排序整体设置
  | { type: 'COLUMN_ORDER_SET'; payload: { order: string[]} }  // 设置列顺序
  | { type: 'COLUMN_REORDER'; payload: { fromIndex: number; toIndex: number } } // 拖拽面板列字段调顺序
  | { type: 'COLUMN_WIDTH_SET'; payload: { key: string; width: number }}  // 设置列宽
  | { type: 'FROZEN_COUNT_SET'; payload: { count: number }}  // 冻结前 N 列设置
  | { type: 'COLUMN_FILTER_SET'; payload: { key: string; filter: ColumnFilterValue } } // 列值筛选
  | { type: 'COLUMN_FILTER_CLEAR'; payload: { key: string } } // 清空筛选
  | { type: 'COLUMN_HIDE'; payload: { key: string } }  // 隐藏列
  | { type: 'COLUMN_SHOW'; payload: { key: string } }  // 显示列
  | { type: 'COLUMN_BATCH_HIDE'; payload: { keys: string[] } }  // 批量隐藏
  | { type: 'COLUMN_BATCH_SHOW'; payload: { keys: string[] } }  // 批量显示
  | { type: 'COLUMNS_RESET_VISIBILITY'; payload?: {} }
  | { type: 'SET_TOTAL_ROWS'; payload: { totalRows: number } }  // 设置总行数
  | { type: 'SET_CURRENT_PAGE'; payload: { page: number } } // server 模式下设置当前页码
  | { type: 'GROUP_TOGGLE'; payload: { groupKey: string } } // 行分组折叠/展开
  | { type: 'GROUP_EXPAND_ALL' }
  | { type: 'GROUP_COLLAPSE_ALL'; payload: { keys: string[] } } // 全部折叠 (携带全部组 key)