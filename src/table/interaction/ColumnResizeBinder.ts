// 拖拽列宽

export class ColumnResizeBinder {
  private onMouseMove: ((e: MouseEvent) => void) | null = null 
  private onMouseUp: ((e: MouseEvent) => void) | null = null 
  private onMouseDown: ((e: MouseEvent) => void) | null = null 
  private guidEl: HTMLDivElement | null = null 

  // 只在 mouseup 触发 onResizeEnd, 避免实时响应用户拖拽就 rebuild 导致卡死
  public bind(params: {
    scrollContainer: HTMLDivElement
    headerRow: HTMLDivElement
    onResizeEnd: (key: string, width: number) => void 
    minWidth?: number
  }) {
    const { scrollContainer, headerRow, onResizeEnd, minWidth = 40 } = params
    this.unbind(headerRow)
    // 当鼠标按下时触发
    this.onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLDivElement | null 
      const handle = target?.closest<HTMLDivElement>('.col-resize-handle')
      if (!handle) return  

      // 阻止触发排序 click (HeaderSortBinder 是 click 事件)
      e.preventDefault()
      e.stopPropagation()

      const key = handle.dataset.columnKey
      if (!key) return  

      const cell = handle.parentElement as HTMLDivElement | null 
      if (!cell) return 

      const startX = e.clientX // 鼠标准备拖动时, 处于的相对视口宽度
      const startWidth = cell.getBoundingClientRect().width // 单元格自身的宽度

      // 创建辅助线
      this.guidEl?.remove()
      this.guidEl = document.createElement('div')
      this.guidEl.className = 'col-resize-guide'
      scrollContainer.appendChild(this.guidEl)

      const containerRect = scrollContainer.getBoundingClientRect() // 容器相对视口位置

      // 标记辅助线在表格中距离左边的距离
      const updateGuide = (clientX: number) => {
        // 拖拽后辅助线在容器内的 left 值 = 鼠标拓展前的的位置 - 容器距离视口的距离 + 拖拽的距离
        const left = clientX - containerRect.left + scrollContainer.scrollLeft
        this.guidEl!.style.left = `${left}px`
      }

      updateGuide(e.clientX) 
      // 当鼠标移动就开始标记
      this.onMouseMove = (moveEvt: MouseEvent) => {
        moveEvt.preventDefault()
        updateGuide(moveEvt.clientX) 
      }

      this.onMouseUp = (upEvt: MouseEvent) => {
        upEvt.preventDefault()
        const dx = upEvt.clientX - startX 
        const nextWidth = Math.max(minWidth, Math.round(startWidth + dx))
        // 等 mouseup 才真正提交宽度 -> dispatch -> rebuild
        onResizeEnd(key, nextWidth) // 等外部传进来回调函数


        // 清理调鼠标事件和辅助线
        this.guidEl?.remove()
        this.guidEl = null 
        window.removeEventListener('mousemove', this.onMouseMove!)
        window.removeEventListener('mouseup', this.onMouseUp!)
        this.onMouseMove = null 
        this.onMouseUp = null 
      }

      window.addEventListener('mousemove', this.onMouseMove)
      window.addEventListener('mouseup', this.onMouseUp)
    }
    // 鼠标弹起时触发
    headerRow.addEventListener('mousedown', this.onMouseDown)
  }

  public unbind(headerRow: HTMLDivElement) {
    if (this.onMouseDown) {
      headerRow.removeEventListener('mousedown', this.onMouseDown)
      this.onMouseDown = null 
    }

    if (this.onMouseMove) {
      window.removeEventListener('mousemove', this.onMouseMove)
      this.onMouseMove = null 
    }

    if (this.onMouseUp) {
      window.removeEventListener('mouseup', this.onMouseUp)
      this.onMouseUp = null 
    }
    this.guidEl?.remove()
    this.guidEl = null 
  }

}