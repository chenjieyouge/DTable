
// 列顺序拖拽, 除冻结列外, 其他列自由排序, 
export class ColumnDragBinder {
  private onMouseDown: ((e: MouseEvent) => void) | null = null 
  private frozenColumnCount = 0

  public bind(params: {
    scrollContainer: HTMLDivElement
    headerRow: HTMLDivElement
    onOrderChange: (order: string[]) => void
    frozenColumnCount?: number 
  }) {
    const { scrollContainer, headerRow, onOrderChange, frozenColumnCount = 0 } = params

    this.frozenColumnCount = frozenColumnCount
    this.unbind(headerRow)

    // 监听鼠标按下事件
    this.onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLDivElement
      // 点到 resize handle 不参与列拖拽, 避免冲突
      if (target?.closest('.vt-col-resize-handle')) return 

      const cell = target?.closest<HTMLDivElement>('.vt-header-cell')
      if (!cell) return 
      
      const fromKey = cell.dataset.columnKey // 获取表头单元格字段的 key 值
      if (!fromKey) return 
      
      // 获取所有表头字段, 包装为数组,  通过类名 .header-cell
      const cells = Array.from(headerRow.querySelectorAll<HTMLDivElement>('.vt-header-cell'))
      const keys = cells
        .map((col) => col.dataset.columnKey)
        .filter((key): key is string => Boolean(key))
      
      const fromIndex = keys.indexOf(fromKey) // 获取准备进行拖拽列的序号
      if (fromIndex < 0) return  

      const startX = e.clientX // 鼠标按下时的位置(距离视口)
      let diDrag = false 

      // 拖拽辅助线, 复用列宽拖拽辅助线的样式
      let indicator: HTMLDivElement | null = document.createElement('div')
      indicator.className = 'vt-col-resize-guide'
      scrollContainer.appendChild(indicator)
      
      const containerRect = scrollContainer.getBoundingClientRect()

      const findInsertIndex = (clientx: number) => {
        const x = clientx
        for (let i = 0; i < cells.length; i++) {
          const r = cells[i].getBoundingClientRect()
          const mid = r.left + r.width / 2 
          if (x < mid) return i 
        }
        return cells.length - 1
      }
      
      const updateIndicator = (clientX: number) => {
        const idx = findInsertIndex(clientX)
        const rect = cells[Math.min(idx, cells.length - 1)].getBoundingClientRect()
        const left = rect.left - containerRect.left + scrollContainer.scrollLeft
        indicator!.style.left = `${left}px`
      }

      const onMove = (moveEvt: MouseEvent) => {
        const dx = Math.abs(moveEvt.clientX - startX); 
        if (dx > 5) diDrag = true 
        if (!diDrag) return 

        moveEvt.preventDefault()
        updateIndicator(moveEvt.clientX)
        
      }
      
      const onUp = (upEvt: MouseEvent) => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        indicator?.remove()
        indicator = null 
        if (!diDrag) return 
        
        const toIndex = findInsertIndex(upEvt.clientX)
        
        // 冻结列不让进行拖拽列顺序
        const isFromFrozen = fromIndex < this.frozenColumnCount
        const isToFrozen = toIndex < this.frozenColumnCount

        // 不论是别的列拖动到冻结区 或者 冻结区拖向任何区 (包括自己) 都不准动!
        if (isFromFrozen || isToFrozen) return false

        const next = [...keys]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        // 等 mouseup 后才提交顺序 -> dispatch -> rebuild
        onOrderChange(next) // 外部传进来的回调函数

        // 避免 mouseup 后触发一次 click 导致误排
        const cancelClickOnce = (ce: MouseEvent) => {
          ce.stopPropagation()
          ce.preventDefault()
          window.removeEventListener('click', cancelClickOnce, true)
        }
      }
      // 在 mousedown 时就要绑定 move/up, 让 window 重新监听鼠标移动和弹起事件
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    // 让 headerow 继续监听 mousedown 事件, 刚已处理按下
    headerRow.addEventListener('mousedown', this.onMouseDown)
  }

  public unbind(headerRow: HTMLDivElement) {
    if (!this.onMouseDown) return 
    headerRow.removeEventListener('mousedown', this.onMouseDown)
    this.onMouseDown = null 
  }
}