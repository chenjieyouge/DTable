// 拓展排序, 筛选参数
export interface SortFilterParmas {
  sortField?: string
  sortOrer?: 'asc' | 'desc'
  filterText: string
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
}

// 对外: 用户传入的配置 (宽松)
export interface IUserConfig {
  container?: string
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

  fetchPageData?(pageIndex: number): Promise<IPageResponse>
  fetchSummaryData?(): Promise<Record<string, any>>

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
        | keyof ITableCallbacks
      >
    >,
    Pick<
      IUserConfig,
      'fetchSummaryData' | 'fetchPageData' | 'initialData' | 'fetchAllData'
    >,
    ITableCallbacks {}
