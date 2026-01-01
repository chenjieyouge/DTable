// 列筛选类型 (目前支持 4 种)
export type ColumnFilterType = 'set' | 'text' | 'dateRange' | 'numberRange'

// 列筛选配置 (控制某列是否筛选, 以及配置类型)
export interface IColumnFilterConfig {
  enabled: boolean // 是否允许出现 "筛选" 按钮
  type: ColumnFilterType // 筛选的列值类型, 决定弹窗层渲染形态和 query 结构
}

// 列筛选值的联合类型 (统一表达四种筛选)
export type ColumnFilterValue = 
  | { kind: 'set', values: string[] }
  | { kind: 'text', value: string } // 先做 contains, 后扩展 op 
  | { kind: 'dateRange', start?: string, end?: string } // yyyy-MM-dd
  | { kind: 'numberRange', min?: number, max?: number }



// 拓展排序, 筛选参数
export interface SortFilterParmas {
  sortField?: string
  sortOrer?: 'asc' | 'desc'
  filterText: string
}

// 服务端查询参数, 用于分页接口, 如排序, 筛选等
// 关键点: 字段要尽量扁平, 方便拼接缓存 key 和后端处理
export interface ITableQuery {
  sortKey?: string // 排序字段名 key
  sortDirection?: 'asc' | 'desc'
  filterText?: string // 模糊搜索关键词
  columnFilters?: Record<string, ColumnFilterValue> // 列值筛选 (key -> 筛选值结构)
}

// 标准分页响应
export interface IPageResponse<T = Record<string, any>> {
  list: T[]
  totalRows: number
}

// 定义所有可选的回调接口
export interface ITableCallbacks {
  // 可视区页面变化时触发
  onPageChange?: (info: IPageInfo) => void
  onModeChange?: (mode: 'client' | 'server') => void
  // TODO: 添加更多回调
  // onSortChange?: ...
  // onFilterChange?: ...
  // onRowClick?: ...
}

export interface IPageInfo {
  startPage: number
  endPage: number
  totalPages: number
}

export interface IColumn {
  key: string
  title: string
  width: number
  sortable?: boolean
  filter?: IColumnFilterConfig  // 列筛选配置 (不配置则表示不可筛选)
  summaryType?: 'sum' | 'avg' | 'count' | 'none' // 总结行聚合类型

}

// 对外: 用户传入的配置 (宽松)
export interface IUserConfig extends Partial<ITableCallbacks> {
  container?: string
  tableId?: string // 表格的唯一标识, 用于 localstorage 存储
  tableWidth?: number
  tableHeight?: number
  headerHeight?: number
  summaryHeight?: number
  rowHeight?: number
  totalRows?: number // 这个可不传
  frozenColumns?: number
  showSummary?: boolean

  pageSize?: number // 每页多少行
  bufferRows?: number // 缓冲区行数
  maxCachedPages?: number // 最大缓存页面数 (仅数据)

  columns: IColumn[] // 用户必填

  fetchPageData?(pageIndex: number, query?: ITableQuery): Promise<IPageResponse>
  fetchSummaryData?(query?: ITableQuery): Promise<Record<string, any>>
  fetchFilterOptions?: (params: { // server 模式下拉取某列的可选筛选值
    key: string 
    query: ITableQuery
  }) => Promise<string[]>

  initialData?: Record<string, any>[] // 全量数据
  fetchAllData?: () => Promise<Record<string, any>[]>
}

// 对内: 使用严格完整配置
// 注意: 回调函数保持可选, 因为它们也不是 "必需配置", 可选都放在 Omit 中
// IConfig 让所有 IUserConfig 变成必填, 除 (fetchSummaryData)
export interface IConfig
  extends Required<
      Omit<
        IUserConfig,
        | 'fetchSummaryData'
        | 'fetchPageData'
        | 'initialData'
        | 'fetchAllData'
        | 'fetchFilterOptions'
        | keyof ITableCallbacks
      >
    >,
    Pick<
      IUserConfig,
      'fetchSummaryData' | 'fetchPageData' | 'initialData' | 'fetchAllData' | 'fetchFilterOptions'
    >,
    ITableCallbacks {}
