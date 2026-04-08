/**
 * 透视表 Web Worker
 * 
 * 职责：
 * 1. 在后台线程处理大数据量透视表构建
 * 2. 避免阻塞主线程UI渲染
 * 3. 支持进度回调
 */

import type { IPivotConfig, IPivotTreeNode, IPivotColNode } from '@/types/pivot'

// Worker 消息类型
interface WorkerMessage {
  type: 'buildTree' | 'cancel'
  data?: {
    config: IPivotConfig
    data: Record<string, any>[]
    columns: any[]
  }
}

interface WorkerResponse {
  type: 'progress' | 'complete' | 'error'
  data?: {
    tree?: IPivotTreeNode
    colTree?: IPivotColNode
    progress?: number
    error?: string
  }
}

// 简化的数据处理器（在Worker中运行）
class WorkerPivotProcessor {
  private config: IPivotConfig
  private colLeaves: IPivotColNode[] = []
  
  constructor(config: IPivotConfig) {
    this.config = config
  }
  
  // 构建列树（简化版）
  buildColTree(data: Record<string, any>[]): IPivotColNode {
    const colGroups = this.config.colGroups ?? []
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
      root.children = this.config.valueFields.map((vf, i) => ({
        id: `col-vf-${i}`,
        level: 0,
        colValue: vf.label ?? vf.key,
        colKey: '__value__',
        children: [],
        isLeaf: true,
        leafCount: 1,
      }))
      root.leafCount = root.children.length
    }
    
    this.colLeaves = this.collectColLeaves(root)
    return root
  }
  
  private collectColLeaves(node: IPivotColNode): IPivotColNode[] {
    if (node.isLeaf) return [node]
    const leaves: IPivotColNode[] = []
    for (const child of node.children) {
      leaves.push(...this.collectColLeaves(child))
    }
    return leaves
  }
  
  // 构建行树（简化版，发送进度）
  buildPivotTree(
    data: Record<string, any>[],
    onProgress?: (progress: number) => void
  ): IPivotTreeNode {
    const rowGroups = this.config.rowGroups
    
    // 应用筛选
    let filteredData = data
    const globalFilters = this.config.filters
    if (globalFilters) {
      for (const [field, filterValue] of Object.entries(globalFilters)) {
        if (filterValue.kind === 'set' && filterValue.values.length > 0) {
          const allowedSet = new Set(filterValue.values)
          filteredData = filteredData.filter(row => allowedSet.has(String(row[field] ?? '')))
        }
      }
    }
    
    const root: IPivotTreeNode = {
      id: 'root',
      type: 'group',
      level: -1,
      groupValue: null,
      aggregatedData: {},
      children: [],
      isExpanded: true,
      rowCount: filteredData.length,
      childrenLoaded: true
    }
    
    // 报告初始进度
    onProgress?.(10)
    
    // 构建子树（简化版，不递归）
    root.children = this.buildSubTreeSimple(filteredData, rowGroups, 0, 'root', onProgress)
    
    // 计算根节点聚合数据
    root.aggregatedData = this.computeRootAggregatedData(filteredData)
    
    onProgress?.(100)
    return root
  }
  
  private buildSubTreeSimple(
    data: Record<string, any>[],
    rowGroups: string[],
    level: number,
    parentId: string,
    onProgress?: (progress: number) => void
  ): IPivotTreeNode[] {
    if (level >= rowGroups.length || level >= 4) {
      return []
    }
    
    const groupKey = rowGroups[level]
    const groups = this.groupByField(data, groupKey)
    const nodes: IPivotTreeNode[] = []
    
    let index = 0
    const total = Math.min(groups.size, 50)
    
    for (const [groupValue, rows] of Array.from(groups.entries()).slice(0, 50)) {
      const aggregatedData = this.computeAggregatedData(rows, groupKey, groupValue)
      const nodeId = `${parentId}-g${level}-${index}`
      
      nodes.push({
        id: nodeId,
        type: 'group',
        level,
        groupValue,
        aggregatedData,
        children: [],
        isExpanded: level <= 1 && rows.length <= 20,
        rowCount: rows.length,
        childrenLoaded: false,
        lazyLoadData: rows
      })
      
      index++
      
      // 报告进度
      if (index % 10 === 0) {
        const progress = 10 + Math.floor((index / total) * 80)
        onProgress?.(progress)
      }
    }
    
    return nodes
  }
  
  private groupByField(data: Record<string, any>[], fieldKey: string): Map<any, Record<string, any>[]> {
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
  
  private computeAggregatedData(
    rows: Record<string, any>[],
    groupKey: string,
    groupValue: any
  ): Record<string, any> {
    const aggregatedData: Record<string, any> = { [groupKey]: groupValue }
    
    for (const vf of this.config.valueFields) {
      aggregatedData[vf.key] = this.aggregate(rows, vf.key, vf.aggregation)
    }
    
    return aggregatedData
  }
  
  private computeRootAggregatedData(data: Record<string, any>[]): Record<string, any> {
    const aggregatedData: Record<string, any> = {}
    for (const vf of this.config.valueFields) {
      aggregatedData[vf.key] = this.aggregate(data, vf.key, vf.aggregation)
    }
    return aggregatedData
  }
  
  private aggregate(rows: Record<string, any>[], fieldKey: string, aggregation: string): any {
    if (aggregation === 'count') return rows.length
    
    const values = rows.map(row => Number(row[fieldKey])).filter(v => !isNaN(v))
    if (values.length === 0) return 0
    
    switch (aggregation) {
      case 'sum':
        return values.reduce((acc, val) => acc + val, 0)
      case 'avg':
        return Math.round((values.reduce((acc, val) => acc + val, 0) / values.length) * 100) / 100
      case 'min':
        return Math.min(...values)
      case 'max':
        return Math.max(...values)
      default:
        return 0
    }
  }
}

// Worker 消息处理
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, data } = e.data
  
  if (type === 'buildTree' && data) {
    try {
      const processor = new WorkerPivotProcessor(data.config)
      
      // 构建列树
      const colTree = processor.buildColTree(data.data)
      
      // 构建行树，带进度回调
      const tree = processor.buildPivotTree(data.data, (progress) => {
        self.postMessage({
          type: 'progress',
          data: { progress }
        } as WorkerResponse)
      })
      
      // 返回结果
      self.postMessage({
        type: 'complete',
        data: { tree, colTree }
      } as WorkerResponse)
      
    } catch (error) {
      self.postMessage({
        type: 'error',
        data: { error: String(error) }
      } as WorkerResponse)
    }
  }
}

export {}
