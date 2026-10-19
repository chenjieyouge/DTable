/**
 * 表格通用右键菜单 (普通表格)
 *
 * 零依赖、fixed 定位, 与透视表右键菜单风格统一, 但做成通用组件:
 * 用 TableContextMenu.show(x, y, items) 弹出, 自动处理外部点击 / Esc 关闭。
 */
export interface TableContextMenuItem {
  label?: string
  /** 分隔线 */
  divider?: boolean
  disabled?: boolean
  onClick?: () => void
}

export class TableContextMenu {
  static show(x: number, y: number, items: TableContextMenuItem[]): void {
    document.querySelectorAll('.vt-context-menu').forEach(el => el.remove())

    const menu = document.createElement('div')
    menu.className = 'vt-context-menu'
    menu.style.position = 'fixed'
    menu.style.top = `${y + 4}px`
    menu.style.left = `${x + 4}px`

    for (const item of items) {
      if (item.divider) {
        const d = document.createElement('div')
        d.className = 'vt-context-menu-divider'
        menu.appendChild(d)
        continue
      }
      const el = document.createElement('div')
      el.className = 'vt-context-menu-item'
      if (item.disabled) el.classList.add('vt-disabled')
      el.textContent = item.label ?? ''
      el.addEventListener('click', () => {
        if (item.disabled) return
        menu.remove()
        item.onClick?.()
      })
      menu.appendChild(el)
    }

    document.body.appendChild(menu)

    // 防止右侧/底部超出视口
    const rect = menu.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      menu.style.left = `${Math.max(4, x - rect.width - 4)}px`
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${Math.max(4, y - rect.height - 4)}px`
    }

    const close = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove()
        document.removeEventListener('mousedown', close)
      }
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        menu.remove()
        document.removeEventListener('keydown', onKey)
      }
    }
    setTimeout(() => {
      document.addEventListener('mousedown', close)
      document.addEventListener('keydown', onKey)
    }, 0)
  }
}
