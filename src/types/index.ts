export interface IColumn {
  key: string
  title: string
  width: number
}

export interface IPageInfo {
  startPage: number
  endPage: number
  totalPages: number
}

// 定义所有可选的回调接口
export interface ITableCallbacks {
  // 可视区页面变化时触发
  onPageChange?: (info: IPageInfo) => void

  // TODO: 添加更多回调
  // onSortChange?: ...
  // onFilterChange?: ...
  // onRowClick?: ...
}

// 对外: 用户传入的配置 (宽松)
export interface IUserConfig {
  container?: string
  tableWidth?: number
  tableHeight?: number
  headerHeight?: number
  summaryHeight?: number
  rowHeight?: number
  totalRows?: number
  frozenColumns?: number
  showSummary?: boolean

  pageSize?: number // 每页多少行
  bufferRows?: number // 缓冲区行数
  maxCachedPages?: number // 最大缓存页面数 (仅数据)

  columns: IColumn[] // 用户必填

  fetchPageData(pageIndex: number): Promise<Record<string, any>[]>
  fetchSummaryData?(): Promise<Record<string, any>>
}

// 对内: 使用严格完整配置
// 注意: 回调函数保持可选, 因为它们也不是 "必需配置"
// IConfig 让所有 IUserConfig 变成必填, 除 (fetchSummaryData)
export interface IConfig
  extends Required<
      Omit<IUserConfig, 'fetchSummaryData' | keyof ITableCallbacks>
    >,
    Pick<IUserConfig, 'fetchSummaryData'>,
    ITableCallbacks {}
