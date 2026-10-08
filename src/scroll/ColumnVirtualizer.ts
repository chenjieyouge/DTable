import type { IColumn } from '@/types'

/**
 * 横向列虚拟化核心: 纯计算, 无 DOM 操作, 可单元测试
 *
 * 与 VirtualScroller (行方向) 对称, 负责:
 * - 计算横向滚动后可见的非冻结列范围 [startCol, endCol]
 * - 冻结列始终渲染, 不参与虚拟化
 * - 输出非冻结区的横向位移 translateX 与内容宽 contentWidth
 *
 * 行内渲染结构约定 (VirtualViewport 消费):
 *   .vt-virtual-row
 *     ├─ [sticky 冻结列单元格 × frozenCount]   (常驻, 不随横向滚动变化)
 *     ├─ [checkbox 占位格]                    (若开启行选中, 常驻)
 *     └─ .vt-scroll-body (position:absolute; left: frozenWidth; transform: translateX(-scrollLeft))
 *          └─ [可见非冻结列单元格]             (随滚动增删)
 */
export interface ColumnRange {
  /** 首个可见的非冻结列下标 (不含冻结列) */
  startCol: number
  /** 最后一个可见的非冻结列下标 (含) */
  endCol: number
  /** 冻结列数量 (始终渲染) */
  frozenCount: number
  /** 非冻结区横向位移 (scroll-body 的 translateX 取负值) */
  translateX: number
  /** 非冻结区内容总宽 (滚动条依据) */
  contentWidth: number
  /** 冻结列总宽 */
  frozenWidth: number
  /** 全部列总宽 */
  totalWidth: number
}

export class ColumnVirtualizer {
  private widths: number[]
  private prefix: number[] // prefix[i] = 前 i 列宽度之和, prefix[0] = 0
  private frozenCount: number
  private bufferCols: number

  constructor(columns: IColumn[], frozenCount: number, bufferCols = 2) {
    this.widths = columns.map((c) => c.width || 120)
    this.frozenCount = Math.min(Math.max(frozenCount, 0), columns.length)
    this.bufferCols = Math.max(bufferCols, 0)
    // 前缀和
    this.prefix = new Array(columns.length + 1)
    this.prefix[0] = 0
    for (let i = 0; i < columns.length; i++) {
      this.prefix[i + 1] = this.prefix[i] + this.widths[i]
    }
  }

  getTotalWidth(): number {
    return this.prefix[this.prefix.length - 1]
  }

  getFrozenWidth(): number {
    return this.prefix[this.frozenCount]
  }

  /** 第 colIndex 列的水平偏移 */
  getColumnOffset(colIndex: number): number {
    return this.prefix[colIndex]
  }

  /** 第 colIndex 列宽度 */
  getColumnWidth(colIndex: number): number {
    return this.widths[colIndex]
  }

  /**
   * 计算可见列范围
   * @param scrollLeft 滚动容器的 scrollLeft
   * @param viewportWidth 数据区视口宽度 (clientWidth - 冻结区宽)
   */
  getRange(scrollLeft: number, viewportWidth: number): ColumnRange {
    const total = this.getTotalWidth()
    const frozenW = this.getFrozenWidth()
    const contentWidth = Math.max(0, total - frozenW)
    // 非冻结区的逻辑滚动距离: 冻结区不参与滚动, 视口右边界从 frozenW 开始
    const logicalLeft = Math.max(0, scrollLeft)
    const rightEdge = scrollLeft + viewportWidth

    // 找到第一个右边界 >= logicalLeft 的非冻结列
    let startCol = this.findColumnByOffset(logicalLeft)
    if (startCol < this.frozenCount) startCol = this.frozenCount
    // 找到第一个右边界 >= rightEdge 的列 (endCol 为可见最后一列)
    let endCol = this.findColumnByOffset(rightEdge)
    if (endCol < this.frozenCount) endCol = this.frozenCount
    // 允许轻微向左/右滚动时最右列提前消失, 加 buffer 保证不露白
    startCol = Math.max(this.frozenCount, startCol - this.bufferCols)
    endCol = Math.min(this.widths.length - 1, endCol + this.bufferCols)

    return {
      startCol,
      endCol,
      frozenCount: this.frozenCount,
      translateX: scrollLeft,
      contentWidth,
      frozenWidth: frozenW,
      totalWidth: total,
    }
  }

  /** 二分: 返回 offset 落入的那一列下标 (右边界 >= offset 的第一列) */
  private findColumnByOffset(offset: number): number {
    const n = this.widths.length
    if (n === 0) return 0
    if (offset <= 0) return 0
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.prefix[mid + 1] <= offset) lo = mid + 1
      else hi = mid
    }
    return lo
  }
}
