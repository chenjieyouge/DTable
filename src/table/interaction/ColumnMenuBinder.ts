import { ColumnMenuView, IColumnMenuConfig } from "@/table/interaction/ColumnMenuView";
import { IColumn } from "@/types";

export class ColumnMenuBinder {
  private menuView = new ColumnMenuView()
  private onClickOutSide: ((e: MouseEvent) => void) | null = null 
  private onScroll: ((e: Event) => void) | null = null  // 监听滚动
  private scrollContainer: HTMLDivElement | null = null  // 保存大容器引用

  public bind(params: {
    scrollContainer: HTMLDivElement,
    headerRow: HTMLDivElement,
    columns: IColumn[] // 完整的列配置
    getCurrentSort: () => { key: string, direction: 'asc' | 'desc' } | null,
    onSort: (key: string, direction: 'asc' | 'desc' | null) => void 

  }) {
    const { scrollContainer, headerRow, columns, getCurrentSort, onSort } = params
    this.scrollContainer = scrollContainer // 保存引用

    // 表头行上事件委托, 监听 click 事件, 并找到最近的 "三点" 按钮
    headerRow.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLDivElement
      const btn = target.closest<HTMLDivElement>('.col-menu-btn')

      // 若点击的不是 "三点" 按钮则返回, 并阻止事件冒泡, 以免影响其他点击事件
      if(!btn) return 
      e.stopPropagation()

      const key = btn.dataset.columnKey 
      if (!key) return 
      // 若菜单已处于打开状态, 则进行关闭, 防止重复打开
      if (btn.classList.contains('active')) {
        this.closeMenu()
        return 
      }
      // 关闭旧菜单, 如果有其他列的菜单也打开就有点冲突了
      this.closeMenu()

      btn.classList.add('active')  // 标记按钮为激活状态
      const cell = btn.closest('.header-cell') as HTMLDivElement

      const columnKey = cell?.dataset.columnKey
      if(!columnKey) return 

      // 从 config.columns 中获取 当前列 的完整配置: width, sortable, filter, render 等
      const column = columns.find(col => col.key === columnKey)
      if (!column) return 
      // 从 store 获取当前字段的排序状态
      const currentSort = getCurrentSort()
      // 渲染菜单前-配置数据
      const menuConfig: IColumnMenuConfig = {
        column,
        currentSort,
        handleSort: (direction) => {
          // 调用 VirtualTable 传来的 onMenuSort 回调
          onSort(columnKey, direction)
          btn.classList.remove('active')
        }
      }
      // 真正渲染菜单
      this.menuView.render(menuConfig, btn, scrollContainer)
      
      // 容器监听页面滚动, 若滚动则关闭菜单弹框
      this.onScroll = () => {
        this.closeMenu()
      }
      scrollContainer.addEventListener('scroll', this.onScroll)

      // 点击外部关闭菜单
      this.onClickOutSide = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('.col-menu-popup') && !target.closest('.col-menu-btn')) {
          this.closeMenu()
        }
      }
      // 将点击外部事件的回调函数, 放到下一个事件循环, 即宏任务队列中
      // requestAnimationFrame 比 setTimeout 要更可靠一些
      // 等先执行完点击事件后, 再执行关闭回调, 否则就出现 "刚打开弹窗就关闭了"
      requestAnimationFrame(() => {
        document.addEventListener('click', this.onClickOutSide!)
      })
      
    })
  }

  // 关闭菜单
  private closeMenu() {
    this.menuView.destroy()
    document.querySelectorAll('.col-menu-btn.active').forEach(btn => {
      btn.classList.remove('active')
    })

    // 移除滚动监听, 以免滚动时弹出就不见了, 然后点击有没有反应 (在顶部)
    // 滚动就直接关闭弹窗, 等用户点击要看, 再打开即可
    if (this.onScroll && this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll', this.onScroll)
      this.onScroll = null 
    }

    if (this.onClickOutSide) {
      document.removeEventListener('click', this.onClickOutSide)
      this.onClickOutSide = null 
    }
  }

  // 解绑
  public unbind() {
    this.closeMenu()
    this.scrollContainer = null  // 清理引用
  }
}