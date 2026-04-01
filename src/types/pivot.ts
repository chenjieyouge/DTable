/**
 * 透视表类型定义
 *
 * 核心概念:
 * 1. IPivotConfig    : 透视表配置, 定义行分组/列分组/聚合方式
 * 2. IPivotTreeNode  : 行树节点 (递归), 表示行分组层级结构
 * 3. IPivotColNode   : 列树节点 (递归), 表示列分组层级结构
 * 4. IPivotFlatRow   : 展平后的行, 用于虚拟滚动渲染
 */

// 聚合类型
export type AggregationType = 'sum' | 'count' | 'avg' | 'max' | 'min'

// 最大分组层级限制
export const MAX_GROUP_LEVELS = 5

// 透视表配置 (Excel 风格: 行分组 × 列分组 × 数值字段)
export interface IPivotConfig {
  enabled: boolean
  rowGroups: string[]   // 行分组字段数组, 顺序决定层级 (最多 5 层)
  colGroups?: string[]  // 列分组字段数组, 顺序决定层级 (最多 3 层, 防止列爆炸)

  valueFields: {
    key: string
    aggregation: AggregationType
    label?: string
  }[]

  showSubtotals?: boolean     // 是否显示行小计, 默认 true
  showColSubtotals?: boolean  // 是否显示列小计, 默认 false
  colMaxLeafCols?: number     // 限制最大叶子列数, 默认 50

  // 行分组字段过滤: key=groupField, value=允许显示的值集合（空数组=不过滤）
  rowFilters?: Record<string, string[]>

  // 组内排序: 按某个聚合值字段升/降序
  sortBy?: { cellKey: string; direction: 'asc' | 'desc' } | null
}

// 树节点类型: 分组行 or 数据行
export type NodeType = 'group' | 'data'

// 行树节点 (递归结构)
export interface IPivotTreeNode {
  id: string
  type: NodeType
  level: number                        // 层级 (0 为第一层分组, -1 为根节点)
  groupValue: any
  aggregatedData: Record<string, any>  // 聚合数据 (key 格式: 'salary__华东__Product-0')
  children: IPivotTreeNode[]
  isExpanded: boolean
  rowCount: number
  rawRows?: Record<string, any>[]
}

// 展平后的行 (用于虚拟滚动)
export interface IPivotFlatRow {
  nodeId: string
  type: NodeType
  rowType?: 'nomal' | 'subtotal' | 'grandtotal'
  groupVale?: any
  level: number
  data: Record<string, any>
  rowCount?: number
  isExpanded?: boolean
  parentId?: string
}

/**
 * 列树节点 (与行树 IPivotTreeNode 对称)
 *
 * 构建原理:
 *   colGroups = ['region', 'product'], valueFields = [销售额, 利润]
 *   列树:
 *     root (level=-1)
 *     ├─ 华东 (level=0, colKey='region')
 *     │   ├─ Product-0 (level=1, colKey='product')
 *     │   │   ├─ 销售额 (level=2, colKey='__value__', isLeaf=true)
 *     │   │   └─ 利润   (level=2, colKey='__value__', isLeaf=true)
 *     │   └─ Product-1 ...
 *     └─ 华北 ...
 *
 * cellKey 格式 (对应 aggregatedData 的 key):
 *   'salary__华东__Product-0'  (valueField.key + '__' + 各列分组值)
 *
 * ancestorColValues: 叶子节点上记录的祖先列分组值路径 (不含 __value__ 层)
 *   如: ['华东', 'Product-0']  → 用于 Renderer 直接计算 cellKey, 无需遍历树
 */
export interface IPivotColNode {
  id: string
  level: number
  colValue: any         // 该节点的列分组值, 如 '华东' / 'Product-0' / '销售额'
  colKey: string        // 对应的列分组字段, 如 'region' / 'product' / '__value__'
  children: IPivotColNode[]
  isLeaf: boolean       // 是否为叶子 (__value__ 层的节点)
  leafCount: number     // 子树中叶子节点数量, 用于渲染表头 colspan 比例
  ancestorColValues?: string[]  // 仅叶子节点有值: 从根到本节点的列分组值路径
}

/**
 * 向后兼容: 将旧的单字段格式转为数组格式
 */
export function normalizeRowGroups(config: any): IPivotConfig {
  if ('rowGroup' in config && typeof config.rowGroup === 'string') {
    return { ...config, rowGroups: [config.rowGroup] }
  }
  return config
}
