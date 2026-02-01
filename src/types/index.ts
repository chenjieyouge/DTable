import type { IPanelConfig } from "@/table/panel/IPanel"

// ======== 基础类型 ==========

// 列筛选值的联合类型 (统一表达四种筛选)
export type ColumnFilterType = 'set' | 'text' | 'dateRange' | 'numberRange'

export interface IColumnFilterConfig {
  enabled: boolean // 是否允许出现 "筛选" 按钮
  type: ColumnFilterType // 筛选的列值类型, 决定弹窗层渲染形态和 query 结构
}

export type ColumnFilterValue = 
  | { kind: 'set', values: string[] }
  | { kind: 'text', value: string } 
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

// sever模式: 标准分页响应
export interface IPageResponse<T = Record<string, any>> {
  list: T[]
  totalRows: number
  summary?: Record<string, any> // 总结行数据(可选), 随分页数据一并返回
}

// server模式: 页码展示
export interface IPageInfo {
  startPage: number
  endPage: number
  totalPages: number
  currentPage: number
}

// 列字段配置, 文档约定必传哦!
export interface IColumn {
  key: string
  title: string
  width?: number  // 宽度不传则自动计算
  minWidth?: number // 最小没款, 默认 100px
  flex?: number // flex 布局权重
  sortable?: boolean
  filter?: IColumnFilterConfig  // 列筛选配置 (不配置则表示不可筛选)
  summaryType?: 'sum' | 'avg' | 'count' | 'none' // 总结行聚合类型
  // 自定义渲染器: 支持返回 html 字符串或 dom 元素
  render?: (value: any, row: Record<string, any>, rowIndex: number) => string | HTMLDivElement
  // 单元格样式制定: 根据值返回 className
  cellClassName?: (value: any, row: Record<string, any>) => string
  // 单元格行内样式, 支持各种 html 元素 (条件格式更方便)
  cellStyle?: (value: any, row: Record<string, any>, rowIndex: number) => Partial<CSSStyleDeclaration> | null 
}

// ======= 右侧面板配置 =========
// 用户输入版本: panels 必填, 其他可选 
export interface SidePanelConfig {
  enabled: boolean // 是否启用右侧面板
   panels: IPanelConfig[] // 要启用的面板列表, 必填!
  position?: 'left' | 'right'  // 面板位置默认 right
  width?: number // 面板宽度, 默认 250px
  defaultPanel?: string // 默认显示面板 id 
  defaultOpen?: boolean // 默认是否展开, 默认 true
 
}

// 内部运行版本, 所有字段必填
export interface SidePanelConfigInternal {
  enabled: boolean 
  position: 'left' | 'right'  
  width: number 
  defaultPanel?: string 
  defaultOpen: boolean 
  panels: IPanelConfig[] 
}


// ======= 回调函数类型 ===========
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

// =========== 内部配置 (运行时, 所有字段必填) ===========
export interface IConfig extends ITableCallbacks {
  // 容器
  container: string | HTMLDivElement
  tableId: string // 表格的唯一标识, 用于 localstorage 存储等
  // 尺寸
  tableWidth: number | string  // 支持数值 或者 '100%'
  tableHeight: number
  headerHeight: number
  summaryHeight: number
  rowHeight: number
  minColumnWidth?: number // 默认最新列宽, 默认 100
  // 数据
  totalRows: number 
  columns: IColumn[] // 约定必填
  // 功能
  frozenColumns: number
  showSummary: boolean
  // 分页
  pageSize: number // 每页多少行
  bufferRows: number // 缓冲区行数
  maxCachedPages: number // 最大缓存页面数 (仅数据)
  // 可选功能-右侧管理面板
  sidePanel?: SidePanelConfig
  // 底部栏状态
  showStatusBar?: boolean  // 是否显示底部状态, 默认 true
  statusBarHeight?: number // 状态栏高度, 默认 32px
  // 数据源配置(可选)
  initialData?: Record<string, any>[] // 全量数据
  fetchAllData?: () => Promise<Record<string, any>[]>
  fetchPageData?(pageIndex: number, query?: ITableQuery): Promise<IPageResponse>
  fetchSummaryData?(query?: ITableQuery): Promise<Record<string, any>>
  fetchFilterOptions?: (params: { // server 模式下拉取某列的可选筛选值
    key: string 
    query: ITableQuery
  }) => Promise<string[]>
  
}

// ======== 用户配置(几乎全部可选, 约定大于配置) ========
export type IUserConfig = Partial<IConfig> & {
  columns: IColumn[]  // 列配置要必填哦!
}


