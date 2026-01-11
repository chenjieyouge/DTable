import type { IColumn } from "@/types";

export interface IColumnMenuConfig {
  column: IColumn
  currentSort?: { key: string; direction: 'asc' | 'desc' } | null 
  handleSort?: (direction: 'asc' | 'desc' | null) => void 
  onPin?: (postion: 'left' | 'right' | null) => void 
  onAutoSize?: (mode: 'this' | 'all') => void
  onHide?: () => void
  onReset?: () => void 
}

export class ColumnMenuView {
  private popupEl: HTMLDivElement | null = null 
  // 创建菜单面板 dom 
  public render(config: IColumnMenuConfig, anchorEl: HTMLElement, container: HTMLElement): HTMLDivElement {
    // 创建前先清理一波
    this.destroy()
    const { column, currentSort, handleSort } = config
    const isSorted = currentSort?.key === column.key  // 判断当前列是否正在排序
    // 创建弹窗容器
    this.popupEl = document.createElement('div')
    this.popupEl.className = 'col-menu-popup'
    // 菜单弹窗使用 fixed 不受容器滚动影响
    const rect = anchorEl.getBoundingClientRect() // "三点"按钮的位置
    this.popupEl.style.left = `${rect.left}px`
    this.popupEl.style.top = `${rect.bottom + 6}px`

    const menuItems: Array<{
      icon: string
      label: string 
      action: () => void 
      disabled?: boolean 
      active?: boolean
    }> = []
    // 排序菜单项
    if (column.sortable) {
      menuItems.push({
        icon: '↑',
        label: '升序',
        action: () => handleSort?.('asc'),  // 点击时调用 onSort('asc')
        active: isSorted && currentSort?.direction === 'asc' // 当前升序, 则高亮
      })
      menuItems.push({
        icon: '↓',
        label: '降序',
        action: () => handleSort?.('desc'),
        active: isSorted && currentSort?.direction === 'desc'
      })

      if (isSorted) {
        menuItems.push({
          icon: '✕',
          label: '取消',
          action: () => handleSort?.(null)
        })
      }
    }

    // 渲染菜单项
    menuItems.forEach(item => {
      const menuItem = document.createElement('div')
      menuItem.className = 'col-menu-item'

      if(item.active) menuItem.classList.add('active') // 高亮当前激活菜单项
      if (item.disabled) menuItem.classList.add('disabled')

      menuItem.innerHTML = `
        <span class="col-menu-icon">${item.icon}</span>
        <span class="col-menu-label">${item.label}</span>
      `
      if (!item.disabled) {
        menuItem.addEventListener('click', (e) => {
          e.stopPropagation()
          item.action()
          this.destroy()
        })
      }
      // 挂载
      this.popupEl?.appendChild(menuItem)
    })
    // 表格容器挂载上弹出
    container.appendChild(this.popupEl)
    return this.popupEl
  }

  // 销毁菜单
  public destroy() {
    this.popupEl?.remove()
    this.popupEl = null 
  }

  // 获取当前菜单元素
  public getElement(): HTMLDivElement | null {
    return this.popupEl
  }
}