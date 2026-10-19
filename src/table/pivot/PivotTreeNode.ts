import type { IPivotTreeNode, IPivotFlatRow, NodeType } from "@/types/pivot";

/**
 * 透视表, 树节点工具类
 * 
 * 职责: 
 * 1. 创建分组节点 和 数据节点
 * 2. 展平属性结构为意味数组 (用户虚拟滚动)
 * 3. 切换节点 展开 / 折叠 状态
 */
export class PivotTreeNode {
  /**
   * 创建分组节点
   * 
   * @param id 节点唯一id
   * @param level 层级 (0 为第一层)
   * @param groupValue 分组值
   * @param aggregatedData 聚合数据 如 { city: 'bj', sales: 100 }
   * @param rowCount 包含的原始行数
   */
  static createGroupNode(
    id: string,
    level: number,
    groupValue: any,
    aggregatedData: Record<string, any>,
    rowCount: number

  ): IPivotTreeNode {
    // 智能默认展开策略：
    // - 前2层默认展开（便于快速查看数据）
    // - 第3层及以后默认折叠（避免界面过于复杂）
    // - 单层节点数超过20个时默认折叠（性能优化）
    const shouldDefaultExpand = level <= 1 && rowCount <= 20
    
    return {
      id,
      type: 'group',
      level,
      groupValue,
      aggregatedData,
      children: [],
      isExpanded: shouldDefaultExpand,
      rowCount
    }
  }

  /**
   * 创建数据节点 (叶子节点)
   * 
   * @param id 节点唯一id
   * @param level 层级
   * @param rawRow 原始数据行
   */
  static createDataNode(id: string, level: number, rawRow: Record<string, any>): IPivotTreeNode {
    return {
      id,
      type: 'data',
      level,
      groupValue: null,
      aggregatedData: rawRow,  // 数据节点直接存储原始行
      children: [],
      isExpanded: false,
      rowCount: 1,
      rawRows: [rawRow]
    }
  }

  /**
   * 展平树形结构为一维数组
   * 
   * 要用迭代模式, 用栈模拟递归, 避免大数据量时 result.push(...array) 调用栈爆炸
   * 
   * 1. 用栈模拟递归, 用数组模拟栈, array.pop() 右侧为栈顶, 子节点逆序压栈
   * 2. 只展平已展开的节点
   * 3. 返回一维数组, 便于虚拟滚动渲染
   * 
   * 实例: 树形结构
   * Root
   * |- USA (展开)
   * |  |- Row 1
   * |  |- Row 2
   * |
   * |--China (折叠)
   * 
   * 展平后: 
   *  [ USA, Row 1, Row 2, China ]
   */
  static flattenTree(node: IPivotTreeNode, showSubtotals: boolean = true): IPivotFlatRow[] {
    // 用栈模拟递归, 避免大数据量时 push(...) 栈溢出
    const result: IPivotFlatRow[] = []
    const stack: IPivotTreeNode[] = [node]

    while (stack.length > 0) {
      const current = stack.pop()!

      // 跳过根节点
      if (current.level === -1) {
        // 根节点的子节点, 逆序压栈 (数组的 pop 是后进先出)
        for (let i = current.children.length -1; i >= 0; i--) {
          stack.push(current.children[i])
        }
        continue
      }

      // 小计占位标记: 在栈里用特殊 groupValue 标识, 弹出时直接转成小计行
      const isSubtotalMarker = current.groupValue === '__SUBTOTAL__'

      // 该分组节点是否真有可展开的子节点:
      //  - 已构建出子节点
      //  - 或懒加载未展开、且后面确实还有更深分组 (canHaveChildren)
      const hasChildren = current.type === 'group' && (
        current.children.length > 0 ||
        (current.childrenLoaded === false && current.canHaveChildren === true)
      )

      // 最深分组节点(聚合行)在渲染语义上是"数据行": 可选中、斑马纹、条件格式、无展开、无小计。
      // (Excel 透视表的叶子行就是如此; 它在树节点上是 group, 但展示出来就是一行数据)
      const isLeafAggregate = current.type === 'group' && current.level >= 0
        && !hasChildren && !isSubtotalMarker
      const emitType: NodeType = isLeafAggregate ? 'data' : current.type

      // 添加当前节点到结果集
      result.push({
        nodeId: current.id,
        type: emitType,
        rowType: isSubtotalMarker ? 'subtotal' : 'nomal',
        level: current.level,
        data: current.aggregatedData,
        isExpanded: current.isExpanded,
        rowCount: current.rowCount,
        groupVale: isSubtotalMarker ? '小计' : current.groupValue,
        parentId: current.id.split('-').slice(0, -1).join('-') || 'root',
        hasChildren
      })

      // 若是分组节点且展开、且真有子节点, 则按"组头 → 子节点 → 小计"顺序压栈
      if (current.type === 'group' && current.isExpanded && hasChildren) {
        // LIFO: 先把小计压到最底部(子节点处理完后才弹出, 即小计在子节点之后)
        if (showSubtotals) {
          stack.push({
            ...current,
            id: `${current.id}-subtotal`,
            type: 'group' as NodeType,
            children: [], // 小计没有子节点
            isExpanded: false,  // 强制设置 false, 避免无限递归
            canHaveChildren: false,
            groupValue: '__SUBTOTAL__',  // 小计占位标记
          } as IPivotTreeNode)
        }
        // 再压子节点 (逆序, 使第一个子节点在栈顶最先弹出)
        for (let i = current.children.length -1; i >= 0; i--) {
          stack.push(current.children[i])
        }
      }
    }

    // 添加总计行
    if (result.length > 0) {
      // 计算总计数据, 从根节点的聚合数据中获取
      const grandTotalData = node.aggregatedData

      result.push({
        nodeId: 'grand-total',
        type: 'group' as NodeType,
        rowType: 'grandtotal',
        level: 0,
        data: grandTotalData,
        isExpanded: false,
        rowCount: node.rowCount,
        groupVale: '总计',
        parentId: 'root',
        hasChildren: false
      })
    }

    return result
  }

  /**
   * 扁平展平 (快速查询模式): 每组一行、字段平铺、不合并相邻同值单元格
   *
   * 与 flattenTree 的区别:
   * - 不产出 group 行 / 小计行: 没有树形层级与展开/折叠
   * - 每个"叶子组合"(最深分组节点) 生成一行, data 里补齐**全部** rowGroups 路径值
   *   (树节点的 aggregatedData 只含当前层分组值, 祖先层值在这里从路径补齐)
   * - 末尾追加一行总计 (取根节点聚合数据), 语义与 flattenTree 的总计行一致
   *
   * @param node      行树根节点 (level = -1)
   * @param rowGroups 行分组字段数组 (顺序即勾选顺序)
   * @param includeTotal 是否追加总计行, 默认 true
   */
  static flattenFlat(
    node: IPivotTreeNode,
    rowGroups: string[],
    includeTotal: boolean = true
  ): IPivotFlatRow[] {
    const result: IPivotFlatRow[] = []
    const pathValues: any[] = []

    // 用栈模拟递归, 记录 (节点, 层级) 避免大树时调用栈溢出
    const stack: { node: IPivotTreeNode; level: number }[] = node.children
      .slice()
      .reverse()
      .map(child => ({ node: child, level: 0 }))

    while (stack.length > 0) {
      const { node: current, level } = stack.pop()!

      if (current.type === 'group') {
        pathValues[level] = current.groupValue

        // 判断是否为"叶子组合": 无子分组节点 (子节点为空 或 全部是 data 节点)
        const hasGroupChildren = current.children.some(c => c.type === 'group')

        if (!hasGroupChildren) {
          // 组装完整组合行: 全路径字段值 + 聚合值
          const data: Record<string, any> = {}
          for (let i = 0; i <= level; i++) {
            const key = rowGroups[i]
            if (key !== undefined) data[key] = pathValues[i]
          }
          // 并入该组合的聚合数据 (含当前层分组值 + 各 valueField / 交叉 cellKey)
          for (const [k, v] of Object.entries(current.aggregatedData ?? {})) {
            data[k] = v
          }

          result.push({
            nodeId: `${current.id}-flat`,
            type: 'data',
            rowType: 'nomal',
            level,
            data,
            rowCount: current.rowCount,
            groupVale: current.groupValue,
            parentId: current.id.split('-').slice(0, -1).join('-') || 'root',
          })
        }

        // 压栈子节点 (逆序保证深度优先顺序与 flattenTree 一致)
        const children = current.children.filter(c => c.type === 'group')
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push({ node: children[i], level: level + 1 })
        }
      }
      // data 节点在扁平模式下不产出 (组合聚合由最深分组节点承担)
    }

    // 末尾追加总计行 (与 flattenTree 语义一致)
    if (includeTotal && result.length > 0) {
      result.push({
        nodeId: 'grand-total',
        type: 'group',
        rowType: 'grandtotal',
        level: 0,
        data: { ...(node.aggregatedData ?? {}) },
        isExpanded: false,
        rowCount: node.rowCount,
        groupVale: '总计',
        parentId: 'root',
      })
    }

    return result
  }

  /**
   * 切换节点 展开/折叠 状态
   * 
   * 原理: 
   * 1. 递归查找目标节点
   * 2. 切换 isExpanded 状态
   * 3. 返回是否找到节点
   * 
   * @param root 根节点
   * @param nodeId 要切换的节点ID
   * @returns 是否找到并切换成功
   */
  /**
   * 钻取展平 (Power BI Drill Down): 只输出 drillPath 经过的分支
   * (路径祖先组行 + 目标直接子节点 + 目标小计), 不输出同级分支/总计。
   */
  static flattenDrill(
    root: IPivotTreeNode,
    pathIds: string[],
    showSubtotals: boolean
  ): IPivotFlatRow[] {
    const result: IPivotFlatRow[] = []
    const pathNodes: IPivotTreeNode[] = []
    let cursor = root
    for (const pid of pathIds) {
      const child = cursor.children.find(c => c.id === pid)
      if (!child) return result
      pathNodes.push(child)
      cursor = child
    }
    const toFlat = (current: IPivotTreeNode): IPivotFlatRow => ({
      nodeId: current.id,
      type: current.type,
      rowType: 'nomal',
      level: current.level,
      data: current.aggregatedData,
      isExpanded: current.isExpanded,
      rowCount: current.rowCount,
      groupVale: current.groupValue,
      parentId: current.id.split('-').slice(0, -1).join('-') || 'root',
    })
    for (let d = 0; d < pathNodes.length; d++) {
      const p = pathNodes[d]
      result.push(toFlat(p))
      if (d === pathNodes.length - 1) {
        for (const child of p.children) {
          result.push(toFlat(child))
        }
        if (showSubtotals) {
          result.push({
            ...toFlat(p),
            nodeId: `${p.id}-subtotal`,
            rowType: 'subtotal',
            groupVale: '小计',
          } as IPivotFlatRow)
        }
      }
    }
    return result
  }

  static toggleNode(root: IPivotTreeNode, nodeId: string): boolean {
    // 找到目标节点
    if (root.id === nodeId) {
      root.isExpanded = !root.isExpanded
      return true
    }

    // 递归查找子节点
    for (const child of root.children) {
      if (this.toggleNode(child, nodeId)) {
        return true
      }
    }

    return false 
  }

  /** 展开所有的节点 (调试用) */
  static expandAll(node: IPivotTreeNode): void {
    node.isExpanded = true 
    for (const child of node.children) {
      this.expandAll(child)
    }
  }

  /** 折叠所有节点 */
  static collapseAll(node: IPivotTreeNode): void {
    node.isExpanded = false
    for (const child of node.children) {
      this.collapseAll(child)
    }
  }


}



