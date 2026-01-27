import type { IPanel } from "@/table/panel/IPanel";
import type { TableStore } from "@/table/state/createTableStore";
import type { IColumn } from "@/types";

/**
 * 列管理面板: 管理列的显示, 隐藏, 搜索, 全选, 重置
 * 
 * 职责: 
 * 1. 渲染列管理 UI (搜索框, 列列表, 操作按钮)
 * 2. 响应用户操作, dispatch -> action -> store
 * 3. 订阅 store 变化, 更新 UI 状态
 */
export class ColumnPanel implements IPanel {
  private container: HTMLDivElement
  private unsubscribe: (() => void) | null = null 
  private searchInput: HTMLInputElement | null = null 
  private listContainer: HTMLDivElement | null = null 
  private allColumnKeys: string[] = [] // 保存所有列的 key, 包括隐藏的

  constructor(
    private store: TableStore,
    private originalColumns: IColumn[]
  ) {
    this.allColumnKeys = originalColumns.map(col => col.key)
    this.container = this.render()
  }

  private render(): HTMLDivElement {
    const container = document.createElement('div')
    container.className = 'column-panel'

    // 面板标题
    const header = document.createElement('div')
    header.className = 'column-pannel'
    header.innerHTML = `
      <h3 class="column-panel-title">列管理</h3>
      <p class="column-panel-desc">管理表格列的显示和隐藏</p>
    `
    container.appendChild(header)

    // 搜索框 (暂时保留, 后续实现)
    const searchBox = document.createElement('div')
    searchBox.className = 'column-panel-search'
    this.searchInput = document.createElement('input')
    this.searchInput.type = 'text'
    this.searchInput.className = 'column-panel-search-input'
    this.searchInput.placeholder = '搜索列名...'
    searchBox.appendChild(this.searchInput)
    container.appendChild(searchBox)

    // 列列表容器
    this.listContainer = document.createElement('div')
    this.listContainer.className = 'column-panel-list'
    container.appendChild(this.listContainer)

    // 底部操作按钮
    const footer = document.createElement('div')
    footer.className = 'column-panel-footer'

    const btnShowAll = document.createElement('button')
    btnShowAll.className = 'column-panel-btn'
    btnShowAll.textContent = '全选'

    const btnHideAll = document.createElement('button')
    btnHideAll.className = 'column-panel-btn'
    btnHideAll.textContent = '全隐藏'

    const btnReset = document.createElement('button')
    btnReset.className = 'column-panel-btn'
    btnReset.textContent = '重置'

    footer.appendChild(btnShowAll)
    footer.appendChild(btnHideAll)
    footer.appendChild(btnReset)
    container.appendChild(footer)

    // 绑定事件
    this.bindEvents(btnShowAll, btnHideAll, btnReset)
    return container
  }

  // 绑定事件
  private bindEvents(
    btnShowAll: HTMLButtonElement,
    btnHideAll: HTMLButtonElement,
    btnReset: HTMLButtonElement
  ): void {
    // 全选
    btnShowAll.onclick = () => {
      const state = this.store.getState()
      const hiddenKeys = state.columns.hiddenKeys
      this.store.dispatch({ type: 'COLUMN_BATCH_SHOW', payload: {keys: hiddenKeys} })
    }
    // 全隐藏
    btnHideAll.onclick = () => {
      const state = this.store.getState()
      const allKeys = state.columns.order
      this.store.dispatch({ type: 'COLUMN_BATCH_HIDE', payload: {keys: allKeys }})
    }
    // 重置
    btnReset.onclick = () => {
      this.store.dispatch({ type: 'COLUMNS_RESET_VISIBILITY', payload: {}})
    }
    // 搜索 (暂不实现, 保持简单)
    // this.searchInput?.addEventListener('input', () => {
    //   this.renderList()
    // })
  }

  // IPane 接口约定方法, 强制实现
  public getContainer(): HTMLDivElement {
    return this.container
  }

  public onShow(): void {
    if (!this.store) {
      console.error('[ColumnPanel] store 未初始化')
      return 
    }
    // 订阅 store 变化, 实时更新列表
    this.unsubscribe = this.store.subscribe(() => {
      this.renderList()
    })
    // 首次渲染列表
    this.renderList()
  }

  // 渲染列列表
  public renderList(): void {

    if (!this.listContainer || !this.store) return 

    const state = this.store.getState()
    const currentOrder = state.columns.order // 当前列顺序, 拖拽后会变化
    const hiddenKeys = state.columns.hiddenKeys // 隐藏的列 key

    // 合并可见列和隐藏列, 保持完整列表
    // 先按 currentOrder 排列; 再最佳隐藏列 (按原始顺序)
    const allKeys = [
      ...currentOrder,
      ...this.allColumnKeys.filter(key => !currentOrder.includes(key))
    ]
    // 清空列表
    this.listContainer.innerHTML = ''
    // 按拖拽操作后的最新顺序展示, 并将隐藏列也显示出来
    allKeys.forEach(key => {
      const col = this.originalColumns.find(c => c.key === key)
      if (!col) return 

      const isVisible = !hiddenKeys.includes(key)
      // 每个列表项
      const item = document.createElement('div')
      item.className = 'column-panel-item'
      // 给隐藏列添加样式提示
      if (!isVisible) {
        item.classList.add('column-panel-item--hidden')
      }
      // 单选框
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = isVisible
      checkbox.id = `col-panel-${key}`
      // 切换显示/隐藏
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.store.dispatch({ type: 'COLUMN_SHOW', payload: { key }})
        } else {
          this.store.dispatch({ type: 'COLUMN_HIDE', payload: { key }})
        }
      }
      const label = document.createElement('label')
      label.htmlFor = `col-panel-${key}`
      label.textContent = col.title
      item.appendChild(checkbox)
      item.appendChild(label)
      this.listContainer?.appendChild(item)
    })
  }

  public onHide(): void {
    this.unsubscribe?.()
    this.unsubscribe = null 
  }

  public destroy(): void {
    this.unsubscribe?.()
    this.container.remove()
  }

}

// 导出工厂函数, 提供给 PanelRegistry 使用
export const createColumnPanel = (store: TableStore, originalColumns: IColumn[]): IPanel => {
  return new ColumnPanel(store, originalColumns)
}