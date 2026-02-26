export class TableResizeBinder {
  private container: HTMLDivElement | null = null 
  private portalContainer: HTMLDivElement | null = null 
  private layoutContainer: HTMLDivElement | null = null 
  private resizeBtn: HTMLButtonElement | null = null
  private onMouseDown: ((e: MouseEvent) => void) | null = null 

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

    // 手动解除引用, 防止内存泄露
    this.portalContainer = null 
    this.layoutContainer = null 
    this.onMouseDown = null 
  }

}