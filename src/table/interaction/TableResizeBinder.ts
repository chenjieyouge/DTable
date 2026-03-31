export class TableResizeBinder {
  private container: HTMLDivElement | null = null 
  private portalContainer: HTMLDivElement | null = null 
  private layoutContainer: HTMLDivElement | null = null 
  private resizeBtn: HTMLButtonElement | null = null
  private resizeCorner: HTMLDivElement | null = null
  private onMouseDown: ((e: MouseEvent) => void) | null = null 
  private onCornerMouseDown: ((e: MouseEvent) => void) | null = null

  /**
   * 绑定右下角双向 resize（宽+高）
   * 挂载到 portalContainer 或 layoutContainer 上
   */
  public bindCorner(params: {
    portalContainer: HTMLDivElement
    layoutContainer?: HTMLDivElement
    onResizeEnd?: (w: number, h: number) => void
  }) {
    const { portalContainer, layoutContainer, onResizeEnd } = params

    const corner = document.createElement('div')
    corner.className = 'vt-table-resize-corner'
    corner.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 10 L10 2 M6 10 L10 6 M10 10 L10 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`
    corner.title = '拖拽调整表格大小'
    portalContainer.appendChild(corner)
    this.resizeCorner = corner

    const startDrag = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startY = e.clientY
      const startW = portalContainer.getBoundingClientRect().width
      const startH = portalContainer.getBoundingClientRect().height
      document.body.style.cursor = 'se-resize'
      document.body.style.userSelect = 'none'

      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - startX
        const dy = me.clientY - startY
        const nextW = Math.max(300, startW + dx)
        const nextH = Math.max(150, startH + dy)
        portalContainer.style.width = `${nextW}px`
        portalContainer.style.height = `${nextH}px`
        if (layoutContainer) {
          layoutContainer.style.width = `${nextW}px`
          layoutContainer.style.height = `${nextH}px`
        }
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        const finalW = portalContainer.getBoundingClientRect().width
        const finalH = portalContainer.getBoundingClientRect().height
        onResizeEnd?.(finalW, finalH)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    this.onCornerMouseDown = startDrag
    corner.addEventListener('mousedown', startDrag)
  }

  public bind(params: {
    scrollContainer: HTMLDivElement,
    portalContainer?: HTMLDivElement,
    layoutContainer?: HTMLDivElement,
    onResizeEnd: (newWidth: number) => void  // 给 tableShell 的回调, 将新列宽传出去并派发更新
  }) {
    const { 
      scrollContainer, 
      portalContainer, 
      layoutContainer, 
      onResizeEnd } = params

    this.container = scrollContainer
    this.portalContainer = portalContainer || null 
    this.layoutContainer = layoutContainer || null // 保存引用
    // 拖拽逻辑
    const startDrag = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation() // 防误触其他点击事件
      const startX = e.clientX  // 鼠标按下时, 在可视区距离左侧的距离
      const startWidth = scrollContainer.getBoundingClientRect().width // 容器宽
      // 添加拖拽中的视觉反馈, 提升用户体验
      scrollContainer.classList.add('vt-table-resizing')
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      // 开始拖动
      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - startX // 移动距离
        // 最小表格宽度保护暂定 300, 后面拓展为初始配置即可
        let next = Math.max(300, startWidth + dx) 

        // 限制整表宽度拖拽按钮拖动超过可视区
        if (this.layoutContainer) {
          const parentWidth = this.layoutContainer.parentElement?.getBoundingClientRect().width || 0
          const sidebarWidth = 0
          const maxWidth = parentWidth - sidebarWidth
          next = Math.min(next, maxWidth)
        }

        // 同步更新 3个容器的宽度
        scrollContainer.style.width = `${next}px` 

        if (this.portalContainer) {
          this.portalContainer.style.width = `${next}px`
        }

        if (this.layoutContainer) {
          this.layoutContainer.style.width = `${next}px`
        }
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        // 移除拖拽中的视觉反馈
        scrollContainer.classList.remove('vt-table-resizing')
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        const finalWidth = scrollContainer.getBoundingClientRect().width
        onResizeEnd(finalWidth)
      }
      // 监听鼠标移动和弹起事件
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    // 创建拖拽按钮
    if (portalContainer) {
      this.createResizeButton(portalContainer, startDrag)
    }
  }

  private createResizeButton(
    portalContainer: HTMLDivElement,
    startDrag: (e: MouseEvent) => void
  ) {
    this.resizeBtn?.remove()
    // 创建新按钮
    // 创建新按钮
    this.resizeBtn = document.createElement('button')
    this.resizeBtn.className = 'vt-table-resize-btn'
    this.resizeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16">
        <path d="M10 2v12M6 2v12" stroke="currentColor" stroke-width="2"/>
      </svg>
    `
    this.resizeBtn.title = '拖拽调整表格宽度'
    
    // 绑定拖拽事件
    this.onMouseDown = (e: MouseEvent) => {
      startDrag(e)
    }
    this.resizeBtn.addEventListener('mousedown', this.onMouseDown)
  
    // 挂载到 portal 容器
    portalContainer.appendChild(this.resizeBtn)
  }


  public unbind() {
    if (this.resizeBtn) {
      if (this.onMouseDown) {
        this.resizeBtn.removeEventListener('mousedown', this.onMouseDown)
      }
      this.resizeBtn.remove()
      this.resizeBtn = null 
    }

    if (this.resizeCorner) {
      if (this.onCornerMouseDown) {
        this.resizeCorner.removeEventListener('mousedown', this.onCornerMouseDown)
      }
      this.resizeCorner.remove()
      this.resizeCorner = null
    }

    this.portalContainer = null 
    this.layoutContainer = null 
    this.onMouseDown = null 
    this.onCornerMouseDown = null
  }

}