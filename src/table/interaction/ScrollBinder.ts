export class ScrollBinder {
  private rafId: number | null = null  // 待执行的帧回调id
  // 滚动处理事件函数
  private onScrollHandler: ((e: Event) => void) | null = null  

  public bind(container: HTMLDivElement, onRafScroll: () => void) {
    // 将滚动事件绑到 container 上, onRafScroll 是传进来的真正处理函数
    this.unbind(container)

    this.onScrollHandler = () => {
      // 优化关键: 若上一帧的 requestAnimationFrame 还没执行完, 就取消
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId)
      }
      // 执行下一帧任务, 保证回调在浏览器下次重绘之前执行
      this.rafId = requestAnimationFrame(() => {
        onRafScroll() // 真正的任务
      })
    }
    container.addEventListener('scroll', this.onScrollHandler, { passive: true }) // 支持不等待 js 执行完就直接滚动, 提升用户体验
  }

  public unbind(container: HTMLDivElement) {
    if (this.onScrollHandler) {
      // 移除滚动事件监听器, 防止内存泄露
      container.removeEventListener('scroll', this.onScrollHandler)
      this.onScrollHandler = null 
    }
    // 已经在执行了, 就取消下一帧
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null 
    }
  }
}