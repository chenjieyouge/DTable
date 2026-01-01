export class HeaderSortBinder {
  private handler: ((e: MouseEvent) => void) | null = null 

  bind(headerRow: HTMLDivElement, onSort: (key: string) => void) {
    // 绑定前先解绑, 避免重复触发回调
    this.unbind(headerRow)

    this.handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null 
      // 只响应 .header-text 的事件
      const textSpan = target?.closest('.header-text')
      if (!textSpan) return 

      const cell = target?.closest<HTMLDivElement>('.header-cell') 
      if (!cell) return 

      if (cell.dataset.sortable !==  'true') return 
      
      const key = cell.dataset.columnKey 
      if (!key) return 

      onSort(key) //执行回调函数,进行排序逻辑
    }
    // 事件委托, 监听表头行里面每个单元格的点击动作
    headerRow.addEventListener('click', this.handler)
  }

  unbind(headerRow: HTMLDivElement) {
    if (!this.handler) return 
    headerRow.removeEventListener('click', this.handler)
    this.handler = null 
  }

}