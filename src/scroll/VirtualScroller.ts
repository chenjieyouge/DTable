import { IConfig } from '@/types'

// 虚拟滚动的核心: 纯计算, 无 dom 操作, 可单元测试

export interface ScrollRange {
  startRow: number // 开始行号
  endRow: number // 结束行号
  translateY: number // 向下滚动后, 元素应该在的位置
  contentHeight: number // 滚动内容高度
}

const MAX_SCROLL_HEIGHT = 10_000_000 // chrome 极限应该在 1600w

export class VirtualScroller {
  private config: IConfig
  private idealHeight: number // 理想高度
  private scrollScale: number // 缩放比, 仅当理想高度超过 MAX_SCROLL_HEIGHT
  private actualScrollHeight: number // 能真正滚动的高度

  constructor(config: IConfig) {
    this.config = config
    this.idealHeight = config.totalRows * config.rowHeight
    this.actualScrollHeight = Math.min(this.idealHeight, MAX_SCROLL_HEIGHT)
    this.scrollScale = this.idealHeight / this.actualScrollHeight || 1
  }

  // 获取滚动信息: 开始行, 结束行, 内容高, 元素位移值等
  getScrollInfo(scrollTop: number, viewportHeight: number): ScrollRange {
    // 必须传入滚动的距离, 可视区高度
    // 从配置里获取: 行高, 总行数, 缓存行数
    const { rowHeight, totalRows, bufferRows } = this.config

    // 将滚动高度 "还原" 为真实的数据高度
    const logicalScrollTop = scrollTop * this.scrollScale

    const startRow = Math.floor(logicalScrollTop / rowHeight) // 起始行号
    const visibleRowCount = Math.ceil(viewportHeight / rowHeight) // 能看见多少行

    // 增强户体验, 额外加一个缓冲区行数
    const visibleStart = Math.max(0, startRow - bufferRows)
    const visibleEnd = Math.min(
      startRow + visibleRowCount + bufferRows,
      totalRows - 1
    )

    const translateY = (visibleStart * rowHeight) / this.scrollScale
    const contentHeight =
      ((visibleEnd - visibleStart + 1) * rowHeight) / this.scrollScale

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
