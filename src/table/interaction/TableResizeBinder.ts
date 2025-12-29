export class TableResizeBinder {
  private onMouseDown: ((e: MouseEvent) => void) | null = null 
  private handleEl: HTMLDivElement | null = null 

  public bind(params: {
    scrollContainer: HTMLDivElement,
    onResizeEnd: (newWidth: number) => void  // 给 tableShell 的回调, 将新列宽传出去并派发更新
  }) {
    const { scrollContainer, onResizeEnd } = params
    // 创建表格容器最右侧边界拖拽条
    this.handleEl?.remove()
    this.handleEl = document.createElement('div')
    this.handleEl.className = 'table-resize-handle'
    scrollContainer.appendChild(this.handleEl)

    this.onMouseDown = (e) => {
      e.preventDefault()
      const startX = e.clientX  // 鼠标按下时, 在可视区距离左侧的距离
      const startWidth = scrollContainer.getBoundingClientRect().width // 容器宽
      // 开始拖动
      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - startX // 移动距离
        // 最小表格宽度保护暂定 300, 后面拓展为初始配置即可
        const next = Math.max(300, startWidth + dx) 
        scrollContainer.style.width = `${next}px` 
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        const finalWidth = scrollContainer.getBoundingClientRect().width
        onResizeEnd(finalWidth)
      }
      // 监听鼠标移动和弹起事件
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    // 拖动条监听鼠标按下事件
    this.handleEl.addEventListener('mousedown', this.onMouseDown)
  }

  public unbind() {
    if (this.handleEl && this.onMouseDown) {
      this.handleEl.removeEventListener('mousedown', this.onMouseDown)
    }
    // 手动解引用, 防止内存泄露
    this.handleEl?.remove()
    this.handleEl = null 
    this.onMouseDown = null 
  }

}