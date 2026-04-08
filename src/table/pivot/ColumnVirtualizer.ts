/**
 * 列虚拟滚动管理器
 * 
 * 职责：
 * 1. 计算可见列范围
 * 2. 管理列宽和位置
 * 3. 优化大列数场景性能
 */

import type { IPivotColNode } from '@/types/pivot'

export interface ColumnRange {
  startIndex: number
  endIndex: number
  offsetLeft: number
  totalWidth: number
}

export class ColumnVirtualizer {
  private colLeaves: IPivotColNode[] = []
  private columnWidths: number[] = []
  private columnOffsets: number[] = []
  private totalWidth = 0
  
  // 虚拟化配置
  private readonly BUFFER_COLS = 5 // 左右各缓冲5列
  private readonly DEFAULT_COL_WIDTH = 120
  private readonly MIN_COL_WIDTH = 80
  private readonly MAX_COL_WIDTH = 300
  
  constructor(colLeaves: IPivotColNode[]) {
    this.updateColumns(colLeaves)
  }
  
  /**
   * 更新列配置
   */
  public updateColumns(colLeaves: IPivotColNode[]): void {
    this.colLeaves = colLeaves
    this.calculateColumnMetrics()
  }
  
  /**
   * 计算列宽和偏移量
   */
  private calculateColumnMetrics(): void {
    this.columnWidths = []
    this.columnOffsets = []
    let offset = 0
    
    for (const leaf of this.colLeaves) {
      // 根据内容自适应列宽（简化版）
      const width = this.calculateColumnWidth(leaf)
      this.columnWidths.push(width)
      this.columnOffsets.push(offset)
      offset += width
    }
    
    this.totalWidth = offset
  }
  
  /**
   * 计算单列宽度（根据内容）
   */
  private calculateColumnWidth(leaf: IPivotColNode): number {
    // 简化版：根据列值长度估算
    const valueLength = String(leaf.colValue).length
    const estimatedWidth = Math.max(
      this.MIN_COL_WIDTH,
      Math.min(valueLength * 10 + 40, this.MAX_COL_WIDTH)
    )
    return estimatedWidth
  }
  
  /**
   * 计算可见列范围
   * @param scrollLeft 水平滚动位置
   * @param viewportWidth 视口宽度
   */
  public getVisibleRange(scrollLeft: number, viewportWidth: number): ColumnRange {
    if (this.colLeaves.length === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        offsetLeft: 0,
        totalWidth: 0
      }
    }
    
    // 二分查找起始列
    let startIndex = this.findColumnIndexByOffset(scrollLeft)
    startIndex = Math.max(0, startIndex - this.BUFFER_COLS)
    
    // 二分查找结束列
    const scrollRight = scrollLeft + viewportWidth
    let endIndex = this.findColumnIndexByOffset(scrollRight)
    endIndex = Math.min(this.colLeaves.length - 1, endIndex + this.BUFFER_COLS)
    
    const offsetLeft = this.columnOffsets[startIndex] || 0
    
    return {
      startIndex,
      endIndex,
      offsetLeft,
      totalWidth: this.totalWidth
    }
  }
  
  /**
   * 二分查找：根据偏移量找到列索引
   */
  private findColumnIndexByOffset(offset: number): number {
    let left = 0
    let right = this.columnOffsets.length - 1
    
    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      if (this.columnOffsets[mid] < offset) {
        left = mid + 1
      } else {
        right = mid
      }
    }
    
    return left
  }
  
  /**
   * 获取列宽
   */
  public getColumnWidth(index: number): number {
    return this.columnWidths[index] || this.DEFAULT_COL_WIDTH
  }
  
  /**
   * 获取列偏移量
   */
  public getColumnOffset(index: number): number {
    return this.columnOffsets[index] || 0
  }
  
  /**
   * 获取总宽度
   */
  public getTotalWidth(): number {
    return this.totalWidth
  }
  
  /**
   * 获取可见列（根据范围）
   */
  public getVisibleColumns(range: ColumnRange): IPivotColNode[] {
    return this.colLeaves.slice(range.startIndex, range.endIndex + 1)
  }
  
  /**
   * 设置列宽（手动调整）
   */
  public setColumnWidth(index: number, width: number): void {
    if (index < 0 || index >= this.columnWidths.length) return
    
    const clampedWidth = Math.max(
      this.MIN_COL_WIDTH,
      Math.min(width, this.MAX_COL_WIDTH)
    )
    
    const oldWidth = this.columnWidths[index]
    const delta = clampedWidth - oldWidth
    
    this.columnWidths[index] = clampedWidth
    
    // 更新后续列的偏移量
    for (let i = index + 1; i < this.columnOffsets.length; i++) {
      this.columnOffsets[i] += delta
    }
    
    this.totalWidth += delta
  }
}
