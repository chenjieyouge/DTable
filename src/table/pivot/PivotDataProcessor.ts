import type { IPivotConfig, IPivotTreeNode, IPivotColNode, AggregationType } from "@/types/pivot";
import { PivotTreeNode } from "@/table/pivot/PivotTreeNode";

/**
 * 透视表数据处理器 (Excel 风格: 行树 × 列树 二维交叉聚合)
 *
 * 职责:
 * 1. buildColTree(data)   → 构建列树 (按 colGroups 递归分组)
 * 2. buildPivotTree(data) → 构建行树 (按 rowGroups 递归分组)
 * 3. 每个行节点的 aggregatedData 中, 每个 key 对应一个列叶子的聚合值
 *
 * cellKey 格式: 'salary__华东__Product-0'
 *   = valueField.key + '__' + 各列分组值 (按 colGroups 层级顺序)
 *
 * 性能说明:
 * - 50w 行 × 3行层 × 9列叶子 × 3值字段 ≈ 405w 次聚合操作 (~500ms)
 * - 建议超过 100w 行时移入 Web Worker
 */
export class PivotDataProcessor {
  private config: IPivotConfig
  private colTree: IPivotColNode | null = null   // 列树根节点
  private colLeaves: IPivotColNode[] = []         // 列叶子节点列表 (按序)
  // 列方向是否因超过 colMaxLeafCols 被截断
  private colTruncated = false
  
  // 性能优化：懒加载模式（默认开启，第3层及以后懒加载）
  private lazyLoadEnabled = true
  private lazyLoadFromLevel = 2 // 从第2层开始懒加载（0-indexed）
  
  // 性能优化：Web Worker 大数据处理
  private useWorker = false
  private workerThreshold = 100000 // 超过10w行使用Worker
  private worker: Worker | null = null

  constructor(config: IPivotConfig) {
    this.config = config
  }
  
  /** 检查是否应该使用 Worker */
  private shouldUseWorker(dataLength: number): boolean {
    return this.useWorker && dataLength >= this.workerThreshold && typeof Worker !== 'undefined'
  }
  
  /**
   * 懒加载子节点（展开时调用）
   * @param node 要加载子节点的节点
   * @returns 是否成功加载
   */
  public loadChildren(node: IPivotTreeNode): boolean {
    if (!node.lazyLoadData || node.childrenLoaded) {
      return false
    }
    
    const rowGroups = this.config.rowGroups
    const level = node.level + 1
    
    // 构建子树
    node.children = this.buildSubTree(
      node.lazyLoadData,
      rowGroups,
      level,
      node.id
    )
    
    // 标记已加载，释放数据
    node.childrenLoaded = true
    node.lazyLoadData = undefined
    
    return true
  }

  /**
   * 构建列树 (入口方法), 类似 Excel 的 colGroups 支持
   * 原理: 与行树完全堆成, 只是字段来源是 colGroups 而非 rowGrops
   * 调用时机: PivotTable.refresh() 里,  buildPivotTree 之前先调这个
   * 
   * @param data 全量原始数据 (采样唯一值用)
   */
  public buildColTree(data: Record<string, any>[]): IPivotColNode {
    const colGroups = this.config.colGroups ?? []
    const maxLeaf = this.config.colMaxLeafCols ?? 50

    this.colTruncated = false

    // 构建虚拟根节点
    const root: IPivotColNode = {
      id: 'col-root',
      level: -1,
      colValue: null,
      colKey: '',
      children: [],
      isLeaf: false,
      leafCount: 0,
    }

    if (colGroups.length === 0) {
      // 没有列分组: valueFields 本身就是叶子列
      root.children = this.config.valueFields.map((vf, i) => ({
        id: `col-vf-${i}`,
        level: 0,
        colValue: vf.label ?? vf.key,
        colKey: '__value__', // 特殊标记: 代表数值字段本身 
        children: [],
        isLeaf: true,
        leafCount: 1,
      }))
      root.leafCount = root.children.length

    } else {
      // 应用 colFilters 预过滤：仅保留各列分组字段允许的値
      let colFilteredData = data
      const colFilters = this.config.colFilters
      if (colFilters) {
        for (const [field, allowed] of Object.entries(colFilters)) {
          if (allowed.length > 0) {
            const allowedSet = new Set(allowed)
            colFilteredData = colFilteredData.filter(row => allowedSet.has(String(row[field] ?? '')))
          }
        }
      }

      // 有分组列: 递归构建列树
      root.children = this.buildColSubTree(colFilteredData, colGroups, 0, 'col-root', maxLeaf)
      root.leafCount = root.children.reduce((sum, c) => sum + c.leafCount, 0)
    }

    this.colTree = root

    // 收集叶子节点, 按深度优先顺序, 对应表头最后一行顺序
    this.colLeaves = this.collectColLeaves(root)

    return root 
  }

  /**
   * 递归构建列子树 
   * 
   * 与 buildSubTree (行树)原理一致: 
   * 1. 按 colGroups[level] 分组取唯一值
   * 2. 为每个唯一值创建列节点
   * 3. 递归到下一层, 指导叶子层
   * 叶子层: 为每个 valueField 创建一个叶子节点
   */
  private buildColSubTree(
    data: Record<string, any>[],
    colGroups: string[],
    level: number,
    parentId: string,
    remainLeaf: number,
    parentAncestors: string[] = [],  // 祖先列分组值路径
  ): IPivotColNode[] {
    if (remainLeaf <= 0) {
      this.colTruncated = true
      return []
    }

    const colKey = colGroups[level]
    // 取当前层唯一值, 保持插入顺序, 不排序, 符合用户数据原始顺序
    const uniqueVals = this.getUniqueValues(data, colKey)

    const nodes: IPivotColNode[] = []

    for (const val of uniqueVals) {
      if (remainLeaf <= 0) {
        // 列方向必须限制: 列数 = ∏(各列分组唯一值数), 会指数爆炸,
        // 几千列足以拖垮浏览器。但只记标记、由上层拒绝渲染, 不在这里静默丢一半。
        this.colTruncated = true
        break
      }

      const nodeId = `${parentId}-c${level}-${val}`
      // 筛选出改列值对应的数据行, 用于下一层递归
      const filteredData = data.filter(r => String(r[colKey] ?? '') === String(val))

      let children: IPivotColNode[] = []
      let leafCount = 0

      // 当前节点的祖先列分组值路径
      const currentAncestors = [...(parentAncestors ?? []), String(val)]

      if (level + 1 >= colGroups.length) {
        // 到达列分组末层: valueFields 是叶子
        children = this.config.valueFields.map((vf, i) => ({
          id: `${nodeId}-vf-${i}`,
          level: level + 1,
          colValue: vf.label ?? vf.key,
          colKey: '__value__',
          children: [],
          isLeaf: true,
          leafCount: 1,
          ancestorColValues: currentAncestors,  // 记录祖先路径
        }))
        leafCount = children.length

      } else {
        // 继续递归下一层分组
        children = this.buildColSubTree(filteredData, colGroups, level + 1, nodeId, remainLeaf, currentAncestors)
        leafCount = children.reduce((sum, c) => sum + c.leafCount, 0)
      }

      remainLeaf -= leafCount

      nodes.push({
        id: nodeId,
        level,
        colValue: val,
        colKey,
        children,
        isLeaf: false,
        leafCount,
        ancestorColValues: currentAncestors,
      })
    }

    return nodes 
  }

  /** 按深度优先顺序, 收集所有叶子节点 */
  private collectColLeaves(node: IPivotColNode): IPivotColNode[] {
    if (node.isLeaf) {
      return [node]
    }

    const leaves: IPivotColNode[] = []
    for (const child of node.children) {
      leaves.push(...this.collectColLeaves(child))
    }

    return leaves
  }

  /** 获取某字段的有序唯一值 */
  private getUniqueValues(data: Record<string, any>[], fieldKey: string): string[] {
    const seen = new Set<string>()
    const result: string[] = []

    for (const row of data) {
      const val = String(row[fieldKey] ?? '')
      if (val === '' || val === 'undefined') continue 
      if (!seen.has(val)) {
        seen.add(val)
        result.push(val)
      }
    }

    return result
  }

  /** 暴露给外部 (PivotTable, Renderer 使用) */
  public getColTree(): IPivotColNode | null {
    return this.colTree
  }

  public getColLeaves(): IPivotColNode[] {
    return this.colLeaves
  }

  /** 列方向是否因超过 colMaxLeafCols 而被截断 */
  public isColTruncated(): boolean {
    return this.colTruncated
  }

  /**
   * 构建透视树 (入口方法)
   * 
   * @param data 原始数据数组
   * @returns 树形结构的根节点
   */
  public buildPivotTree(data: Record<string, any>[]): IPivotTreeNode {
    const rowGroups = this.config.rowGroups

    // 先应用全局 filters 预过滤（筛选器区域）
    let filteredData = data
    const globalFilters = this.config.filters
    if (globalFilters) {
      for (const [field, filterValue] of Object.entries(globalFilters)) {
        switch (filterValue.kind) {
          case 'set':
            // 文本/布尔多选筛选
            if (filterValue.values.length > 0) {
              const allowedSet = new Set(filterValue.values)
              filteredData = filteredData.filter(row => 
                allowedSet.has(String(row[field] ?? ''))
              )
            }
            break
          
          case 'numberRange':
            // 数值范围筛选
            filteredData = filteredData.filter(row => {
              const val = Number(row[field])
              if (isNaN(val)) return false
              if (filterValue.min != null && val < filterValue.min) return false
              if (filterValue.max != null && val > filterValue.max) return false
              return true
            })
            break
          
          case 'dateRange':
            // 日期范围筛选（字符串比较 yyyy-MM-dd）
            filteredData = filteredData.filter(row => {
              const dateStr = String(row[field] ?? '')
              if (filterValue.start && dateStr < filterValue.start) return false
              if (filterValue.end && dateStr > filterValue.end) return false
              return true
            })
            break
        }
      }
    }

    // 再应用 rowFilters 预过滤
    const rowFilters = this.config.rowFilters
    if (rowFilters) {
      for (const [field, allowed] of Object.entries(rowFilters)) {
        if (allowed.length > 0) {
          const allowedSet = new Set(allowed)
          filteredData = filteredData.filter(row => allowedSet.has(String(row[field] ?? '')))
        }
      }
    }

    // 创建根节点 (虚拟节点, level = -1, 不展示)
    const root: IPivotTreeNode = {
      id: 'root',
      type: 'group',
      level: -1, // 约定根节点层级为 -1
      groupValue: null, 
      aggregatedData: {}, // 先初始化为空, 后面计算
      children: [],
      isExpanded: true,  // 根节点始终展开
      rowCount: filteredData.length
    }

    // 从第 0 层开始递归构建子树
    root.children = this.buildSubTree(filteredData, rowGroups, 0, 'root')

    // 计算根节点的聚合数据, 用于总结行
    root.aggregatedData = this.computeRootAggregatedData(filteredData)

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
    // 行方向不做任何截断。
    //
    // 之前这里有三个硬编码阈值(层级≤4、单层≤50组、每组数据行≤100), 全是静默截断:
    // 超出的分组被直接丢掉, 用户看到的是一张"看着正常但少了数据"的透视表 ——
    // 对分析场景来说这比慢严重得多。
    //
    // 行方向的代价是线性的: 每层把所有行分一遍组, 总工作量 O(行数 × 层数 × 数值字段),
    // 与分组数量无关; 渲染侧有虚拟滚动兜着。真正会爆炸的是列方向(见 colMaxLeafCols)。
    if (level >= rowGroups.length) {
      // 有列分组时不创建数据行, 分组汇总行已足够
      if (this.config.colGroups?.length) return []
      return data.map((row, i) =>
        PivotTreeNode.createDataNode(`${parentId}-data-${i}`, level, row)
      )
    }

    // 当前层的分组字段
    const groupKey = rowGroups[level]
    // 按当前字段分组
    const groups = this.groupByField(data, groupKey)

    // 保持数据原始出现顺序, 不按行数重排 ——
    // 重排会让透视表的行顺序随数据量变化而漂移, 用户无法建立稳定的阅读预期
    const groupEntries = Array.from(groups.entries())

    // 为每个分组值创建分组节点
    const nodes: IPivotTreeNode[] = []
    let index = 0

    for (const [groupValue, rows] of groupEntries) {
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
      
      // 性能优化：懒加载子节点
      if (this.lazyLoadEnabled && level >= this.lazyLoadFromLevel) {
        // 不立即构建子树，保存数据供后续展开时加载
        groupNode.childrenLoaded = false
        groupNode.lazyLoadData = rows
        groupNode.children = []
      } else {
        // 立即构建子树
        groupNode.childrenLoaded = true
        groupNode.children = this.buildSubTree(rows, rowGroups, level + 1, nodeId)
      }

      nodes.push(groupNode)
      index++
    }

    // 组内排序：若配置了 sortBy，对当层同级节点按聊合値排序
    const sortBy = this.config.sortBy
    if (sortBy) {
      const { cellKey, direction } = sortBy
      nodes.sort((a, b) => {
        const va = Number(a.aggregatedData[cellKey] ?? 0)
        const vb = Number(b.aggregatedData[cellKey] ?? 0)
        return direction === 'asc' ? va - vb : vb - va
      })
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
   * 计算一个行分组节点的聚合数据
   * 
   * 核心原理: (二维交叉聚合):
   *   无列分组: cell = aggregate (该行分组的所有行, valueField)
   *   有列分组: cell = aggregate (该分组行 交 该叶子列 过滤的行, valueField)
   * 
   * 数据 key 格式: 
   *   无列分组: 'salary', 'profit'
   *   有列分组: 'salary__华东__Product-0' (用 __ 双下划线分割, 避免字段含 _)
   * 
   * @param rows 当前行分组 包含 的所有原始数据行
   * @param groupKey 当前分组字段
   * @param groupValue 当前分组值
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

    const colLeaves = this.colLeaves

    if (colLeaves.length === 0 || !this.config.colGroups?.length) {
      // 无列分组: 原有的逻辑不变
      for (const vf of this.config.valueFields) {
        aggregatedData[vf.key] = this.aggregate(rows, vf.key, vf.aggregation)
      }

    } else {
      // 有列分组: 按叶子逐一交叉聚合
      // 直接用 leaf.ancestorColValues + colGroups 过滤行, 避免遍历树
      const colGroups = this.config.colGroups!
      for (const leaf of colLeaves) {
        const vf = this.config.valueFields.find(
          v => (v.label ?? v.key) === leaf.colValue
        ) ?? this.config.valueFields.find(v => v.key === leaf.colValue)
        if (!vf) continue

        const ancestors = leaf.ancestorColValues ?? []
        const filteredRows = rows.filter(row =>
          ancestors.every((val, i) => String(row[colGroups[i]] ?? '') === val)
        )

        const cellKey = this.buildCellKey(leaf)
        aggregatedData[cellKey] = this.aggregate(filteredRows, vf.key, vf.aggregation)
      }
    }

    return aggregatedData
  }

  /**
   * 从叶子节点 id 解析祖先的 (colKey, colValue) 链
   * 
   * 原理: 列树构建时 id 是 'col-root-c0-华东-c1-Product-0-vf-0'
   * 但解析 id 字符串容易出错, 更可靠的方式是, 在叶子节点上直接存祖先信息
   * 这里用简化方案: 遍历 colTree 找到叶子的完整路径
   */
  private resolveLeafAncestors(leaf: IPivotColNode): [string, string][] {
    const path: IPivotColNode[] = []
    this.findLeafPath(this.colTree!, leaf.id, path)
    // 过滤掉 __value__ 层 (数值字段, 不参与行过滤)
    return path 
      .filter(n => n.colKey !== '__value__' && n.level >= 0)
      .map(n => [n.colKey, String(n.colValue)])
  }

  /**
   * 深度优先搜索, 找到目标叶子节点的完整路径
   */
  private findLeafPath(node: IPivotColNode, targetId: string, path: IPivotColNode[]): boolean {
    path.push(node)
    if (node.id === targetId) return true 

    for (const child of node.children) {
      if (this.findLeafPath(child, targetId, path)) return true 
    }

    path.pop()
    return false 
  }

  /**
   * 构建单元格数据 key 
   * 格式: 'salary__华东__Product-0'
   * 规则: valueField.key + '__' + 各列分组值 (从根到叶, 不含 __value__ 层)
   */
  public buildCellKey(leaf: IPivotColNode): string {
    // 无列分组时: colLeaves 直接是 valueField 叶子, key 就是 vf.key
    if (!this.config.colGroups?.length) {
      const vf = this.config.valueFields.find(
        v => (v.label ?? v.key) === leaf.colValue
      ) ?? this.config.valueFields.find(v => v.key === leaf.colValue)
      return vf?.key ?? String(leaf.colValue)
    }

    // 有列分组时: 用 ancestorColValues 拼接 (比遍历树快)
    if (leaf.ancestorColValues && leaf.ancestorColValues.length > 0) {
      const vf = this.config.valueFields.find(
        v => (v.label ?? v.key) === leaf.colValue
      ) ?? this.config.valueFields.find(v => v.key === leaf.colValue)
      return `${vf?.key ?? leaf.colValue}__${leaf.ancestorColValues.join('__')}`
    }

    // fallback: 遍历树计算路径
    const path: IPivotColNode[] = []
    this.findLeafPath(this.colTree!, leaf.id, path)
    const colParts = path
      .filter(n => n.colKey !== '__value__' && n.level >= 0)
      .map(n => String(n.colValue))
    const vf2 = this.config.valueFields.find(
      v => (v.label ?? v.key) === leaf.colValue
    ) ?? this.config.valueFields.find(v => v.key === leaf.colValue)
    return `${vf2?.key ?? leaf.colValue}__${colParts.join('__')}`
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
    // 注意: 这里不能以 `行数_字段_聚合方式` 做缓存 —— 行数无法唯一标识一组行,
    // 行数相同的两个分组会互相命中缓存, 拿到别人的聚合值。
    // 且单次构建中每个 (分组, 数值字段) 组合只会算一次, 这层缓存本就没有收益。

    // count 直接返回行数
    if (aggregation === 'count') {
      return rows.length
    }

    // 提取数值, 目前这种算法稳定, 但内存占用高一些
    const values = rows
      .map(row => Number(row[fieldKey]))
      .filter(v => !isNaN(v))

    if (values.length === 0) {
      return 0
    }

    // 常用聚合函数应用
    let result: number
    switch (aggregation) {
      case 'sum': {
        result = values.reduce((acc, val) => acc + val, 0)
        break
      }

      case 'avg': {
        const sum = values.reduce((acc, val) => acc + val, 0)
        result = Math.round((sum / values.length) * 100) / 100 // 保留两位小数
        break
      }

      case 'min': {
        result = Math.min(...values)
        break
      }

      case 'max': {
        result = Math.max(...values)
        break
      }

      // 更多聚合操作

      default: 
        result = 0
    }
    
    return result
  }

  /**
   * 计算根节点的聚合数据 (用户总计行)
   * 
   * @param data 全部的原始数据
   * @returns 聚合后的数据对象
   */
  private computeRootAggregatedData(data: Record<string, any>[]): Record<string, any> {
    const aggregatedData: Record<string, any> = {}
    const colLeaves = this.colLeaves

    if (colLeaves.length === 0 || !this.config.colGroups?.length) {
      for (const vf of this.config.valueFields) {
        aggregatedData[vf.key] = this.aggregate(data, vf.key, vf.aggregation)
      }

    } else {
      const colGroups = this.config.colGroups!
      for (const leaf of colLeaves) {
        const vf = this.config.valueFields.find(
          v => (v.label ?? v.key) === leaf.colValue
        ) ?? this.config.valueFields.find(v => v.key === leaf.colValue)
        if (!vf) continue

        const ancestors = leaf.ancestorColValues ?? []
        const filteredRows = data.filter(row =>
          ancestors.every((val, i) => String(row[colGroups[i]] ?? '') === val)
        )
        aggregatedData[this.buildCellKey(leaf)] = this.aggregate(filteredRows, vf.key, vf.aggregation)
      }
    }

    return aggregatedData
  }


  /** 更新配置 */
  public updateConfig(config: IPivotConfig): void {
    this.config = config
    // config 变了, 列树需要外部重新调用 buildColTree 重建
    this.colTree = null 
    this.colLeaves = []
  }
  
}