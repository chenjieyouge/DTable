export class SortIndicatorView {
  // 将排序状态映射到 dom, 但不参与任何排序业务
  constructor(private scrollContainer: HTMLDivElement) {}

  public set(sort: { key: string, direction: 'asc' | 'desc' } | null) {
    this.clear()
    if (!sort) return 
    const targetHeader = this.scrollContainer.querySelector<HTMLDivElement>(
      `.vt-header-cell[data-column-key="${sort.key}"]`
    )
    if (!targetHeader) return 

    const indicator = document.createElement('span')
    indicator.className = 'vt-sort-indicator'
    indicator.textContent = sort.direction === 'asc' ? '↑' : '↓'
    targetHeader.appendChild(indicator)
  }

  public clear() {
    const allHeaders = this.scrollContainer.querySelectorAll('.vt-header-cell')
    allHeaders.forEach((header) => {
      const indicator = header.querySelector('.vt-sort-indicator')
      if (indicator) indicator.remove()
    })
  }
}