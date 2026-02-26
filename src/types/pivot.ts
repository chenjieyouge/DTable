/**
 * 透视表类型定义
 * 
 * 核心概念
 * 1. IPivotConfig: 透视表配置, 定义如何分组和聚合
 * 2. IPivotTreeNode: 树形节点, 表示分组层级结构
 * 3. IPivotFlatRow: 展平后的行, 用于虚拟滚动渲染
 */

// 聚合类型
export type AggregationType = 'sum' | 'count' | 'avg' | 'max' | 'min'

// 最大分组层级限制 (业务经验: 最多5层, 3层最佳)
export const MAX_GROUP_LEVELS = 5

// 透视表配置
export interface IPivotConfig {
  enabled: boolean // 是否启用透视模式
  rowGroups: string[] // 行分组字段数字, 顺序决定层级 (最多 5 层)
  valueFields: {  // 数值字段配置
    key: string
    aggregation: AggregationType
    label?: string // 显示名称(可选)
  }[]
  showSubtotals?: boolean // 是否显示分组小计行, 默认 true
}

// 树节点类型: 分组行 or 数据行
export type NodeType = 'group' | 'data'

// 透视表树节点 (递归结构)
export interface IPivotTreeNode {
  id: string                              // 唯一id, 用于展开/折叠状态管理
  type: NodeType                         // 节点类型: 分组节点 or 数据节点
  level: number                         // 层级 (0 为第一层分组, -1 为根节点)
  groupValue: any                      // 分组值
  aggregatedData: Record<string, any>  // 聚合数据(分组节点) 或者 原始数据 (数据节点)
  children: IPivotTreeNode[]         // 子节点数组 (递归)
  isExpanded: boolean               // 是否展开
  rowCount: number                 // 包含的原始行数
  rawRows?: Record<string, any>[] // 原始数据行, 仅对数据节点有效
}

// 展平后的行 (用于虚拟滚动)
export interface IPivotFlatRow {
  nodeId: string                 // 节点id, 对应 IPivotTreeNode.id 
  type: NodeType                  // 行类型, 分组行 or 数据行
  rowType?: 'nomal' | 'subtotal' | 'grandtotal'  // 行类型: 普通行, 分组小计行, 总计行
  groupVale?: any 
  level: number                     // 层级, 用于计算缩进
  data: Record<string, any>           // 显示数据, 分组节点的聚合 or 数据节点的原始值
  rowCount?: number
  isExpanded?: boolean                  // 是否展开 (仅分组行有效)
  parentId?: string
}


/**
 * 向后兼容: 将旧的字段配置转为数组格式
 * 
 * 用法: 
 * const config = normalizeRowGroups({ rowGroup: 'region', ...})
 * 返回: { rowGroup: ['regin'], ....}
 */
export function normalizeRowGroups(config: any): IPivotConfig {
  // 若是旧格式, 单个字段, 则转为新格式的数组字段
  if ('rowGroup' in config && typeof config.rowGroup === 'string') {
    return {
      ...config,
      rowGroups: [config.rowGroup]
    }
  }
  return config
}


