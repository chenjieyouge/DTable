// 拖拽列宽, 冻结列不让拖, 影响布局?

export class ColumnResizeBinder {
  private onMouseMove: ((e: MouseEvent) => void) | null = null 
  private onMouseUp: ((e: MouseEvent) => void) | null = null 
  private onMouseDown: ((e: MouseEvent) => void) | null = null 
  private guidEl: HTMLDivElement | null = null 
  private frozenColumnCount = 0 // 冻结列数量配置

  // 只在 mouseup 触发 onResizeEnd, 避免实时响应用户拖拽就 rebuild 导致卡死
  public bind(params: {
    scrollContainer: HTMLDivElement
    headerRow: HTMLDivElement
    onResizeEnd: (key: string, width: number) => void 
    minWidth?: number
    frozenColumnCount?: number  // 前 N 列为冻结列
  }) {
    const { 
      scrollContainer, 
      headerRow, 
      onResizeEnd, 
      minWidth = 40, 
      frozenColumnCount = 0
    } = params

    this.frozenColumnCount = frozenColumnCount // 保存冻结列数量
    this.unbind(headerRow)

    // 当鼠标按下时触发
    this.onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLDivElement | null 
      const handle = target?.closest<HTMLDivElement>('.vt-col-resize-handle')
      if (!handle) return  
      // 阻止触发排序 click (HeaderSortBinder 是 click 事件)
      e.preventDefault()
      e.stopPropagation()

      const key = handle.dataset.columnKey
      if (!key) return  
      // 检查是否为冻结列, 是则禁止拖拽
      if (this.isFrozenColumn(handle)) {
        return 
      }

      const cell = handle.parentElement as HTMLDivElement | null 
      if (!cell) return 

      const startX = e.clientX // 鼠标准备拖动时, 处于的相对视口宽度
      const startWidth = cell.getBoundingClientRect().width // 单元格自身的宽度

      // 创建辅助线
      this.guidEl?.remove()
      this.guidEl = document.createElement('div')
      this.guidEl.className = 'vt-col-resize-guide'
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

    // 双击自动调整列宽
    headerRow.addEventListener('dblclick', (e: MouseEvent) => {
      const target = e.target as HTMLDivElement | null 
      const handle = target?.closest<HTMLDivElement>('.vt-col-resize-handle')
      if (!handle) return 

      e.preventDefault()
      e.stopPropagation()

      const key = handle.dataset.columnKey
      if (!key) return 
      
      if (this.isFrozenColumn(handle)) {
        return 
      }

      // 计算列内容最佳宽度, 即采样 100条测量最大宽度
      const optimalWidth = this.calculateOptimalWidth(scrollContainer, key, minWidth)
      if (optimalWidth) {
        onResizeEnd(key, optimalWidth)
      }
    })
  }

  /** 计算列的最佳宽度, 基于前 100 行数据测量 */
  public calculateOptimalWidth(
    container: HTMLDivElement,
    columnKey: string,
    minWidth: number

  ): number | null  {
    // 获取该列的所有单元格 
    const cells = container.querySelectorAll<HTMLDivElement>(`.vt-table-cell[data-column-key="${columnKey}"]`)

    if (cells.length === 0) return null 
    let fitWidth = minWidth 
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) return null 
    // 采样前 100 个单元格, 避免性能问题
    const sampleSize = Math.min(100, cells.length)
    for (let i = 0; i < sampleSize; i++) {
      const cell = cells[i]
      const text = cell.textContent || ''

      // 获取单元格的字体样式
      const style = window.getComputedStyle(cell)
      ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

      // 测量文本宽度 + 左右各 4px padding
      const metrics = ctx.measureText(text)
      const textWidth = Math.ceil(metrics.width) 

      // 宽度建议在 max(textWidth, minWidth) 的基础上, 加上边距, 按钮, 筛选等图标
      fitWidth = Math.max(textWidth + 80, minWidth)
    }
    // 限制最大宽度为 500px
    return Math.min(fitWidth, 500)
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

  // 判断是否为冻结列 (根据在 headerRow 中的位置)
  private isFrozenColumn(handle: HTMLDivElement): boolean {
    if (this.frozenColumnCount === 0) return false 

    const cell = handle.parentElement
    if (!cell) return false 

    const headerRow = cell.parentElement
    if (!headerRow) return false 

    const cells = Array.from(headerRow.querySelectorAll<HTMLDivElement>('.vt-header-cell'))
    const index = cells.indexOf(cell as HTMLDivElement)
    return index >= 0 && index < this.frozenColumnCount
  }

}