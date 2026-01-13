export class TableResizeBinder {
  private container: HTMLDivElement | null = null 
  private portalContainer: HTMLDivElement | null = null 
  private onMouseDown: ((e: MouseEvent) => void) | null = null 
  private onMouseMove: ((e: MouseEvent) => void) | null = null 
  private handleEl: HTMLDivElement | null = null 

  public bind(params: {
    scrollContainer: HTMLDivElement,
    portalContainer?: HTMLDivElement
    onResizeEnd: (newWidth: number) => void  // 给 tableShell 的回调, 将新列宽传出去并派发更新
  }) {
    const { scrollContainer, portalContainer, onResizeEnd } = params
    this.container = scrollContainer
    this.portalContainer = portalContainer || null  // 保存引用

    // 右侧热区宽度 (靠近右边 N px 就能拖拽)
    const HOTZONE = 20
    // 创建视觉可视条, 提升用户体验
    this.handleEl?.remove()
    this.handleEl = document.createElement('div')
    this.handleEl.className = 'table-resize-handle'
    scrollContainer.appendChild(this.handleEl)

    const startDrag = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation() // 防误触其他点击事件
      const startX = e.clientX  // 鼠标按下时, 在可视区距离左侧的距离
      const startWidth = scrollContainer.getBoundingClientRect().width // 容器宽
      // 添加拖拽中的视觉反馈, 提升用户体验
      scrollContainer.classList.add('table-resizing')
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      // 开始拖动
      const onMove = (me: MouseEvent) => {
        const dx = me.clientX - startX // 移动距离
        // 最小表格宽度保护暂定 300, 后面拓展为初始配置即可
        const next = Math.max(300, startWidth + dx) 
        scrollContainer.style.width = `${next}px` 
        // 也要同步更新 portalcontainer 宽度才能看到拖动跟随
        if (this.portalContainer) {
          this.portalContainer.style.width = `${next}px`
        }
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        // 移除拖拽中的视觉反馈
        scrollContainer.classList.remove('table-resizing')
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        const finalWidth = scrollContainer.getBoundingClientRect().width
        onResizeEnd(finalWidth)
      }
      // 监听鼠标移动和弹起事件
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    // mousemove 时: 根据是否进入热区, 动态显示光标和高亮手柄
    this.onMouseMove = (e: MouseEvent) => {
      const rect = scrollContainer.getBoundingClientRect()
      const inHotZone = e.clientX >= (rect.right - HOTZONE) && e.clientX <= rect.right
      if (inHotZone) {
        scrollContainer.style.cursor = 'col-resize'
        this.handleEl?.classList.add('active')
      } else {
        scrollContainer.style.cursor = ''
        this.handleEl?.classList.remove('active')
      }
      scrollContainer.style.cursor = inHotZone ? 'col-resize' : ''
    }
    // 让大容器监听鼠标移动事件 
    scrollContainer.addEventListener('mousemove', this.onMouseMove)

    // mousedown 时: 如果鼠标在左右热区, 则直接开始拖拽
    this.onMouseDown = (e: MouseEvent) => {
      const rect = scrollContainer.getBoundingClientRect()
      // 热区范围边界判断, 多了也不行, 少了也不行
      const inHotZone = e.clientX >= (rect.right - HOTZONE) && e.clientX <= rect.right
      // 也允许直接点击到 handle 开始拖拽
      const onHandle = (e.target as HTMLDivElement).closest('.table-resize-handle')
      if (inHotZone || onHandle) {
        startDrag(e)
      }
    }
    // 大容器监听鼠标按下事件
    scrollContainer.addEventListener('mousedown', this.onMouseDown)
  }

  public unbind() {
    // 严谨解绑: 移除所有事件监听器
    if (this.container && this.onMouseMove) {
      this.container.removeEventListener('mousemove', this.onMouseMove)
    }

    if (this.container && this.onMouseDown) {
      this.container.removeEventListener('mousedown', this.onMouseDown)
    }

    // 清理 dom 元素
    this.handleEl?.remove()
    // 手动解除引用, 防止内存泄露
    this.portalContainer = null 
    this.handleEl = null 
    this.onMouseDown = null 
    this.onMouseMove = null 
  }

}