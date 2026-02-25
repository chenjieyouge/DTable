import type { IPivotConfig, IPivotTreeNode, AggregationType } from "@/types/pivot";
import { PivotTreeNode } from "@/table/pivot/PivotTreeNode";

/**
 * 透视表数据处理器 (支持多层递归分组)
 * 
 * 职责: 
 * 1. 将平铺数据 转为 树形结构
 * 2. 按 rowGrops 数组递归分组 (支持 1~5 层)
 * 3. 计算聚合值 (sum, avg, count, max min)
 * 
 * 核心算法: 
 * - 递归深度 = rowGroups.length, 业务限定最多 5层, 不会栈溢出
 * - 时间复杂度: O(nxm),  n 为数据行数, m 为分组层数
 * - 50w 行 x 3 层 = 150w 次 Map 操作, 约占用 200-500ms
 * 
 * 时间复杂度: O(n), n 为数据行数
 */
export class PivotDataProcessor {
  private config: IPivotConfig

  constructor(config: IPivotConfig) {
    this.config = config 
  }

  /**
   * 构建透视树 (入口方法)
   * 
   * @param data 原始数据数组
   * @returns 树形结构的根节点
   */
  public buildPivotTree(data: Record<string, any>[]): IPivotTreeNode {
    const rowGroups = this.config.rowGroups

    // 创建根节点 (虚拟节点, level = -1, 不展示)
    const root: IPivotTreeNode = {
      id: 'root',
      type: 'group',
      level: -1, // 约定根节点层级为 -1
      groupValue: null, 
      aggregatedData: {}, // 先初始化为空, 后面计算
      children: [],
      isExpanded: true,  // 根节点始终展开
      rowCount: data.length
    }

    // 从第 0 层开始递归构建子树
    root.children = this.buildSubTree(data, rowGroups, 0, 'root')

    // 计算根节点的聚合数据, 用于总结行
    root.aggregatedData = this.computeRootAggregatedData(data)

    return root 
  }

  /**
   * 递归构建子树 (核心递归方法)
   * 
   * 原理: 
   * 1. 若 level >= rowGroups.length, 达到叶子层, 创建数据节点
   * 2. 否则按 rowGroups[level] 分组
   * 3. 为每个分组值创建分组节点, 递归构建下一层
   * 
   * @param data 当前层数据
   * @param rowGroups 分组字段数组
   * @param level 当前层级 (0 为第一层)
   * @param parentId 父节点 id, 用于生成唯一 id 
   * @returns 当前层的所有节点
   */
  private buildSubTree(
    data: Record<string, any>[],
    rowGroups: string[],
    level: number,
    parentId: string,

  ): IPivotTreeNode[] {
    // 递归终止条件: 达到叶子层, 创建数据节点
    if (level >= rowGroups.length) {
      return data.map((row, i) => 
        PivotTreeNode.createDataNode(`${parentId}-data-${i}`, level, row)
      )
    }

    // 当前层的分组字段
    const groupKey = rowGroups[level]
    // 按当前字段分组
    const groups = this.groupByField(data, groupKey)

    // 为每个分组值创建分组节点
    const nodes: IPivotTreeNode[] = []
    let index = 0

    for (const [groupValue, rows] of groups.entries()) {
      // 计算当前分组的聚合数据
      const aggregatedData = this.computeAggregatedData(rows, groupKey, groupValue)
      // 创建分组节点
      const nodeId = `${parentId}-g${level}-${index}`
      const groupNode = PivotTreeNode.createGroupNode(
        nodeId,
        level,
        groupValue,
        aggregatedData,
        rows.length
      )
      // 递归下一层子树
      groupNode.children = this.buildSubTree(rows, rowGroups, level + 1, nodeId)

      nodes.push(groupNode)
      index++
    }
    return nodes
  }
 
  /**
   * 按字段分组
   * 
   * @param data 数据数组
   * @param fieldKey 分组字段 key
   * @returns Map<分组值, 该分组的所有行>
   * 
   * 原理: 使用 Map 结构, key 作为分组值, value 为该分组的所有行
   * 
   * 示例:
   * 输入: [{ country: 'ABC', sales: 100 }, { country: 'ABC', sales: 200 }]
   * 输出: Map { 'ABC' => [ { country: 'ABC', sales: 100 }, { country: 'ABC', sales: 200 }] }
   */
  private groupByField(
    data: Record<string, any>[], 
    fieldKey: string

  ): Map<any, Record<string, any>[]> {
    // 按 分组 key 重组织行数据
    const groups = new Map<any, Record<string, any>[]>()

    for (const row of data) {
      const value = row[fieldKey]

      // 分组 key 的值, 若首次出现, 则添加进 Map 作为 k, v 则默认为 []
      if (!groups.has(value)) {
        groups.set(value, [])
      }
      // 上面已处理好首次情况, 这里一定是保证每行都能有 key 关联
      groups.get(value)!.push(row)
    }

    return groups 
  }

  /**
   * 计算聚合数据
   * 
   * @param rows 当前分组的所有行
   * @param groupKey 当前分组字段
   * @param groupValue 当前分组值
   * @returns 聚合后的数据对象
   */
  private computeAggregatedData(
    rows: Record<string, any>[],
    groupKey: string,
    groupValue: any,

  ): Record<string, any> {
    // 分组字段值
    const aggregatedData: Record<string, any> = {
      [groupKey]: groupValue  
    }

    // 计算每个数值字段的聚合值
    for (const valueField of this.config.valueFields) {
      const aggValue = this.aggregate(rows, valueField.key, valueField.aggregation)
      
      aggregatedData[valueField.key] = aggValue
    }

    return aggregatedData
  }


  /** 聚合计算,
   * 
   * @param rows 数据行数据
   * @param fieldKey 字段 key 
   * @param aggregation 目前支持 sum, count, avg, max, min 
   * @returns 聚合结果
   * */
  private aggregate(
    rows: Record<string, any>[], 
    fieldKey: string, 
    aggregation: AggregationType

  ): any {

    // count 直接返回行数
    if (aggregation === 'count') {
      return rows.length
    }

    // 提取数值, 目前这种算法稳定, 但内存占用高一些
    const values = rows
      .map(row => Number(row[fieldKey]))
      .filter(v => !isNaN(v))

    if (values.length === 0) return 0

    // 常用聚合函数应用
    switch (aggregation) {
      case 'sum': {
        return values.reduce((acc, val) => acc + val, 0)
      }

      case 'avg': {
        const sum = values.reduce((acc, val) => acc + val, 0)
        return Math.round((sum / values.length) * 100) / 100 // 保留两位小数
      }

      case 'min': {
        return Math.min(...values)
      }

      case 'max': {
        return Math.max(...values)
      }

      // 更多聚合操作

      default: 
        return 0
    }
  }

  /**
   * 计算根节点的聚合数据 (用户总计行)
   * 
   * @param data 全部的原始数据
   * @returns 聚合后的数据对象
   */
  private computeRootAggregatedData(data: Record<string, any>[]): Record<string, any> {
    const aggregatedData: Record<string, any> = {}
    // 计算每个数值字段的聚合值
    for (const valueField of this.config.valueFields) {
      const aggValue = this.aggregate(data, valueField.key, valueField.aggregation)
      aggregatedData[valueField.key] = aggValue
    }

    return aggregatedData
  }

  /** 更新配置 */
  public updateConfig(config: IPivotConfig): void {
    this.config = config
  }
  
}