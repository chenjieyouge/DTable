/**
 * dtable - 轻量级虚拟滚动表格库
 * 
 * 公开 API 入口，仅导出对外稳定的接口
 */

// 样式（构建时会提取为 dist/style.css）
import './style.css'

// 核心类
export { VirtualTable } from '@/table/VirtualTable'

// 公共类型
export type {
  IUserConfig,
  IConfig,
  IColumn,
  IColumnFilterConfig,
  ColumnFilterType,
  ColumnFilterValue,
  ColumnDataType,
  ITableQuery,
  IPageResponse,
  IPageInfo,
  ITableCallbacks,
  SidePanelConfig,
  IRowSelectionConfig,
} from '@/types'

export type {
  IPivotConfig,
  IPivotTreeNode,
  IPivotFlatRow,
  IPivotColNode,
  AggregationType,
} from '@/types/pivot'
