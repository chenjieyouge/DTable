import { IConfig } from '@/types'

// 虚拟滚动的核心: 纯计算, 无 dom 操作, 可单元测试

export interface ScrollRange {
  startRow: number // 开始行号
  endRow: number // 结束行号
  translateY: number // 向下滚动后, 元素应该在的位置
  contentHeight: number // 滚动内容高度
}

const MAX_SCROLL_HEIGHT = 10_000_000 // chrome 极限应该在 1600w

/** 行高度量: 惰性缓存每行高度与前缀和, 支持可变行高 */
export class RowMetrics {
  private heights: number[] = []
  private prefix: number[] = [0] // prefix[i] = 前 i 行高度和
  private totalRows: number
  private rowHeightFn: (i: number) => number

  constructor(rowHeightFn: (i: number) => number, totalRows: number) {
    this.rowHeightFn = rowHeightFn
    this.totalRows = totalRows
  }

  /** 重置 (totalRows 或行高策略变化时) */
  reset(totalRows?: number): void {
    if (typeof totalRows === 'number') this.totalRows = totalRows
    this.heights.length = 0
    this.prefix.length = 0
    this.prefix[0] = 0
  }

  setRowHeightFn(fn: (i: number) => number): void {
    this.rowHeightFn = fn
    this.heights.length = 0
    this.prefix.length = 0
    this.prefix[0] = 0
  }

  /** 确保 [0..i] 的高度与前缀已计算 (惰性) */
  private ensureUpTo(i: number): void {
    if (this.totalRows <= 0) return
    const target = Math.min(i, this.totalRows - 1)
    let idx = this.heights.length
    while (idx <= target) {
      const h = Math.max(1, this.rowHeightFn(idx) || 1)
      this.heights[idx] = h
      this.prefix[idx + 1] = this.prefix[idx] + h
      idx++
    }
  }

  getHeight(i: number): number {
    this.ensureUpTo(i)
    return this.heights[i] ?? 1
  }

  /** 第 i 行的顶部偏移 (累计高度) */
  getOffset(i: number): number {
    if (i <= 0) return 0
    this.ensureUpTo(i - 1)
    return this.prefix[i] ?? 0
  }

  /** 总高度 (惰性计算到末尾) */
  getTotalHeight(): number {
    this.ensureUpTo(this.totalRows - 1)
    return this.prefix[this.totalRows] ?? 0
  }

  /**
   * 二分定位: 返回 offset 所在的行
   * (满足 prefix[row] <= offset < prefix[row+1] 的 row)
   */
  findRow(offset: number): number {
    if (this.totalRows <= 0) return 0
    if (offset <= 0) return 0
    const total = this.getTotalHeight()
    if (offset >= total) return Math.max(0, this.totalRows - 1)
    let lo = 0
    let hi = this.totalRows - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      this.ensureUpTo(mid) // 惰性补齐, 均摊 O(1)
      const midOffset = this.prefix[mid + 1]
      if (midOffset <= offset) lo = mid + 1
      else hi = mid
    }
    return lo
  }
}

export class VirtualScroller {
  private config: IConfig
  private metrics: RowMetrics
  private idealHeight = 0 // 理想高度
  private scrollScale = 1 // 缩放比, 仅当理想高度超过 MAX_SCROLL_HEIGHT
  private actualScrollHeight = 0 // 能真正滚动的高度

  constructor(config: IConfig) {
    this.config = config
    this.metrics = new RowMetrics(this.resolveRowHeight(), config.totalRows)
    this.recalc()
  }

  /** 解析行高策略: number -> 常量回调; 函数 -> 原样使用 */
  private resolveRowHeight(): (i: number) => number {
    const rh = this.config.rowHeight
    return typeof rh === 'function' ? rh : () => rh || 36
  }

  /** 滚动高度相关量重算 (总行数/行高策略变化后调用) */
  private recalc(): void {
    this.idealHeight = this.metrics.getTotalHeight()
    this.actualScrollHeight = Math.min(this.idealHeight, MAX_SCROLL_HEIGHT)
    this.scrollScale = this.idealHeight / this.actualScrollHeight || 1
  }

  /** totalRows 变化后重建 */
  rebuild(totalRows?: number): void {
    this.metrics.reset(totalRows)
    this.recalc()
  }

  /** 行高策略变化后重建 */
  setRowHeight(rowHeight: IConfig['rowHeight']): void {
    this.metrics.setRowHeightFn(
      typeof rowHeight === 'function' ? rowHeight : () => rowHeight || 36
    )
    this.recalc()
  }

  /** 第 rowIndex 行的实际渲染高度 (含缩放) */
  getRowHeight(rowIndex: number): number {
    return this.metrics.getHeight(rowIndex) / this.scrollScale
  }

  /** 第 rowIndex 行的顶部偏移 (含缩放) */
  getRowOffset(rowIndex: number): number {
    return this.metrics.getOffset(rowIndex) / this.scrollScale
  }

  // 获取滚动信息: 开始行, 结束行, 内容高, 元素位移值等
  getScrollInfo(scrollTop: number, viewportHeight: number): ScrollRange {
    const { totalRows, bufferRows } = this.config
    if (totalRows <= 0) {
      return { startRow: 0, endRow: -1, translateY: 0, contentHeight: 0 }
    }

    // 将滚动高度 "还原" 为真实的数据高度
    const logicalScrollTop = scrollTop * this.scrollScale

    const startRow = this.metrics.findRow(logicalScrollTop) // 起始行号
    // 行高可变, 从 startRow 向下累加高度, 直到覆盖视口 + 缓冲高度
    const bufferHeight = (typeof this.config.rowHeight === 'number'
      ? this.config.rowHeight
      : 36) * bufferRows

    let visibleEnd = startRow
    let acc = 0
    while (visibleEnd < totalRows - 1 && acc < viewportHeight + bufferHeight) {
      acc += this.metrics.getHeight(visibleEnd)
      visibleEnd++
    }

    const visibleStart = Math.max(0, startRow - bufferRows)
    const translateY = this.metrics.getOffset(visibleStart) / this.scrollScale
    const contentHeight =
      (this.metrics.getOffset(visibleEnd + 1) - this.metrics.getOffset(visibleStart)) / this.scrollScale

    return {
      startRow: visibleStart,
      endRow: visibleEnd,
      translateY,
      contentHeight,
    }
  }

  getActualScrollHeight() {
    return this.actualScrollHeight
  }

  getScrollScale() {
    return this.scrollScale
  }
}
