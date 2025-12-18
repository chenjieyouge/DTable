export class HeaderSortBinder {
  private handler: ((e: MouseEvent) => void) | null = null 

  bind(headerRow: HTMLDivElement, onSort: (key: string) => void) {
    // 绑定前先解绑, 避免重复触发回调
    this.unbind(headerRow)
    this.handler = (e: MouseEvent) => {
      const target = e.target as HTMLDivElement | null 
      const cell = target?.closest<HTMLDivElement>('.header-cell') // 找到最近的父级元素, 事件委托
      if (!cell) return // 可能点击到表格外面就不处理
      if (cell.dataset.sortable !==  'true') return // 不可排序的列不处理
      const key = cell.dataset.columnKey // 没有找到配置的排序字段也不处理
      if (!key) return // 没有 key 就不处理

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