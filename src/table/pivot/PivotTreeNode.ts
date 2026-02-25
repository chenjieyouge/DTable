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
    return {
      id,
      type: 'group',
      level,
      groupValue,
      aggregatedData,
      children: [],
      isExpanded: false, // 默认折叠
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
  static flattenTree(node: IPivotTreeNode): IPivotFlatRow[] {
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

      // 添加当前节点到结果集
      result.push({
        nodeId: current.id,
        type: current.type,
        rowType: 'nomal', // 普通行
        level: current.level,
        data: current.aggregatedData,
        isExpanded: current.isExpanded,
        rowCount: current.rowCount,
        groupVale: current.groupValue,
        parentId: current.id.split('-').slice(0, -1).join('-') || 'root'
      })

      // 若是分组节点且展开, 则处理子节点
      if (current.type === 'group' && current.isExpanded) {
        // 子节点逆序
        for (let i = current.children.length -1; i >= 0; i--) {
          stack.push(current.children[i])
        }

        // 在子节点后面插入小计行
        // 注意: 这里用一个特殊的标记 (__SUBTOTAL__), 作为占位用, 等所有子节点处理完后在插入
        stack.push({
          ...current,
          id: `${current.id}-subtotal`,
          type: 'group' as NodeType,
          children: [], // 小计没有子节点
          isExpanded: false,  // 强制设置 false, 避免无限递归
          groupValue: '__SUBTOTAL__',  // 添加一个特殊的标记
        } as IPivotTreeNode)
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
        parentId: 'root'
      })
    }

    // 后处理: 将标记为 "小计" 的行转换为真正的 "小计行"
    return result.map(row => {
      if (row.groupVale === '__SUBTOTAL__') {
        return { ...row,rowType: 'subtotal',groupVale: '小计' }
      }
      return row 
    })
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



