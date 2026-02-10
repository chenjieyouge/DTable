import type { IPivotConfig, IPivotTreeNode, AggregationType } from "@/types/pivot";
import { PivotTreeNode } from "@/table/pivot/PivotTreeNode";

/**
 * 透视表数据处理器
 * 
 * 职责: 
 * 1. 将平铺数据 转为 树形结构
 * 2. 按分组字段 进行 分组 group 
 * 3. 计算聚合值 (sum, avg, count, max 等)
 * 
 * 核心算法: 
 * 1. 遍历原始数据, 按分组字段提取唯一值
 * 2. 对每个唯一值, 过滤出对应的子数据
 * 3. 计算聚合值
 * 4. 构建树节点
 * 
 * 时间复杂度: O(n), n 为数据行数
 */
export class PivotDataProcessor {
  private config: IPivotConfig

  constructor(config: IPivotConfig) {
    this.config = config 
  }

  /**
   * 构建透视树 (核心方法)
   * 
   * 原理: 
   * 1. 按分组字段分组数据
   * 2. 为每个分组 创建 分组节点
   * 3. 为每个分组的数据行, 创建数据节点
   * 
   * @param data 原始数据数组
   * @returns 树形结构的根节点
   */
  public buildPivotTree(data: Record<string, any>[]): IPivotTreeNode {
    // 分组 key 
    const groupKey = this.config.rowGroup
    // 按照分组字段分组, grops: Map<any, Record<string, any>[]
    const groups = this.groupByField(data, groupKey)
    // 创建根节点 (虚拟节点, 不展示)
    const root: IPivotTreeNode = {
      id: 'root',
      type: 'group',
      level: -1, // 约定根节点层级为 -1
      groupValue: null, 
      aggregatedData: {},
      children: [],
      isExpanded: true,  // 根节点始终展开
      rowCount: data.length
    }
    // 为每个分组, 创建子节点
    let index = 0
    for (const [groupValue, rows] of groups.entries()) {
      const groupNode = this.createGroupNode(groupValue, rows, index++)
      root.children.push(groupNode)
    }
    
    return root 
  }
 
  /**
   * 按字段分组
   * 
   * 原理: 使用 Map 结构, key 作为分组值, value 为该分组的所有行
   * 
   * 示例:
   * 输入: [{ country: 'ABC', sales: 100 }, { country: 'ABC', sales: 200 }]
   * 输出: Map { 'ABC' => [ { country: 'ABC', sales: 100 }, { country: 'ABC', sales: 200 }] }
   */
  private groupByField(data: Record<string, any>[], fieldKey: string): Map<any, Record<string, any>[]> {
    // 按 分组 key 重组织行数据
    const groups = new Map<any, Record<string, any>[]>()

    for (const row of data) {
      const value = row[fieldKey]

      if (!groups.has(value)) {
        groups.set(value, [])
      }
      groups.get(value)!.push(row)
    }
    return groups 
  }

  /** 创建分组节点
   * 
   * 原理: 
   * 1. 计算聚合数据 (sum, count, avg 等)
   * 2. 创建分组节点
   * 3. 为每个原始行创建数据节点, 作为子节点
   */
  private createGroupNode(
    groupValue: any,
    rows: Record<string, any>[],
    index: number
  ): IPivotTreeNode {
    // 计算聚合数据
    const aggregatedData: Record<string, any> = {
      [this.config.rowGroup]: groupValue // 分组字段值
    }

    // 计算每个数值字段的聚合值
    for (const valueField of this.config.valueFields) {
      const aggValue = this.aggregate(rows, valueField.key, valueField.aggregation)
      aggregatedData[valueField.key] = aggValue
    }

    // 创建分组节点
    const groupNode = PivotTreeNode.createGroupNode(
      `group-${index}`,
      0, // MVP 先实现一层, level 固定为 0
      groupValue,
      aggregatedData,
      rows.length
    )

    // 创建子数据节点
    // 注意: 这里直接创建所有子节点, 展开时才渲染 (懒渲染)
    groupNode.children = rows.map((row, i) => 
      PivotTreeNode.createDataNode(`data-${index}-${i}`, 1, row)
    )

    return groupNode
  }

  /** 聚合计算, 目前支持 sum, count, avg, max, min */
  private aggregate(rows: Record<string, any>[], fieldKey: string, aggregation: AggregationType): any {
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

  /** 更新配置 */
  public updateConfig(config: IPivotConfig): void {
    this.config = config
  }
  
}