import type { IColumn } from '@/types'
import type { IPivotConfig } from '@/types/pivot'

/**
 * 生成「开箱即用」的默认透视配置:
 * - 行维度: 优先第 2 列 (索引 1, 业务数据里通常是品牌/分类等核心维度), 兜底第 1 列
 * - 值: 所有带 summaryType 的度量列 (sum/avg/count ...)
 *
 * 用于用户首次进入「透视表」时, 面板与表格主体共享同一份默认配置,
 * 避免"表格显示了透视、面板四区域却为空"的不一致。
 */
export function buildDefaultPivotConfig(columns: IColumn[]): IPivotConfig {
  const firstRowKey = columns[1]?.key || columns[0]?.key || ''

  const valueFields: IPivotConfig['valueFields'] = columns
    .filter(col => col.summaryType && col.summaryType !== 'none')
    .map(col => ({
      key: col.key,
      aggregation: (col.summaryType as any) || 'sum',
      label: col.title,
    }))

  return {
    enabled: true,
    rowGroups: firstRowKey ? [firstRowKey] : [],
    valueFields,
  }
}
