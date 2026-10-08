import type { SortEntry } from "@/types";

export class SortIndicatorView {
  // 将排序状态映射到 dom, 但不参与任何排序业务
  constructor(private scrollContainer: HTMLDivElement) {}

  public set(sorts: SortEntry[]) {
    this.clear()
    if (!sorts || sorts.length === 0) return

    sorts.forEach((sort, idx) => {
      if (!sort) return
      const targetHeader = this.scrollContainer.querySelector<HTMLDivElement>(
        `.vt-header-cell[data-column-key="${sort.key}"]`
      )
      if (!targetHeader) return

      const indicator = document.createElement('span')
      indicator.className = 'vt-sort-indicator'
      indicator.textContent = sort.direction === 'asc' ? '↑' : '↓'
      if (idx > 0) {
        const order = document.createElement('span')
        order.className = 'vt-sort-order'
        order.textContent = String(idx + 1)
        targetHeader.appendChild(order)
      }
      targetHeader.appendChild(indicator)
    })
  }

  public clear() {
    const allHeaders = this.scrollContainer.querySelectorAll('.vt-header-cell')
    allHeaders.forEach((header) => {
      const indicator = header.querySelector('.vt-sort-indicator')
      if (indicator) indicator.remove()
      const order = header.querySelector('.vt-sort-order')
      if (order) order.remove()
    })
  }
}
