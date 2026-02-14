import type { IColumn } from "@/types";

export interface IColumnManagerConfig {
  allColumns: IColumn[]   // 所有列, 包括隐藏的
  hiddenKeys: string[]   // 当前隐藏列 key 
  onToggle: (key: string, visible: boolean) => void  // 切换隐藏 / 显示
  onShowAll: () => void   // 全部显示
  onHideAll: () => void  // 全部隐藏
  onReset: () => void   // 重置到初始状态
}

export class ColumnManagerView {
  private panelEl: HTMLDivElement | null = null  

  // 渲染表格右侧列管理面板
  public render(config: IColumnManagerConfig, container: HTMLDivElement): HTMLDivElement {
    // 若面板已存在, 则只更新 checkbox 状态, 不重建面板
    if (this.panelEl && this.panelEl.parentElement === container) {
      this.updateCheckboxStates(config.allColumns, config.hiddenKeys)
      return this.panelEl
    }
    
    // 否则则重新创建面板
    this.destroy()
    const {
      allColumns,
      hiddenKeys,
      onToggle,
      onShowAll,
      onHideAll,
      onReset
    } = config

    // 创建面板容器
    this.panelEl = document.createElement('div')
    this.panelEl.className = 'column-manager-panel'

    // 面板标题
    const header = document.createElement('div')
    header.className = 'column-manager-header'
    header.innerHTML = `
      <span class="column-manager-title">列管理</span>
      <button class="column-manager-close" title="关闭">×</button>
    `
    this.panelEl.appendChild(header)
    // 关闭按钮
    const closeBtn = header.querySelector('.column-manager-close') as HTMLButtonElement
    closeBtn.addEventListener('click', () => this.destroy())
    // 列列表
    const listContainer = document.createElement('div')
    listContainer.className = 'column-manager-list'

    // 遍历每列, 显示出字段列表
    allColumns.forEach(col => {
      const isVisible = !hiddenKeys.includes(col.key)

      const item = document.createElement('div')
      item.className = 'column-manager-item'
      // 每个字段后面配置一个单选框
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = isVisible 
      checkbox.id = `col-manager-${col.key}`
      // 监听列字段是否被选中, 选中表示显示, 否则表示隐藏
      checkbox.addEventListener('change', () => {
        onToggle(col.key, checkbox.checked)
      })
      // 辅助标签
      const label = document.createElement('label')
      label.htmlFor = `col-manager-${col.key}`
      label.textContent = col.title
      // 挂载 
      item.appendChild(checkbox)
      item.appendChild(label)
      listContainer.appendChild(item)
    })
    // 将列表面板也挂载到 panelEl 下
    this.panelEl.appendChild(listContainer)
    // 底部操作按钮, 后续直接改为在顶部, 全选/全不选 得了
    const footer = document.createElement('div')
    footer.className = 'column-manager-footer'
    // 全选按钮
    const btnShowAll = document.createElement('button')
    btnShowAll.className = 'column-manager-btn'
    btnShowAll.textContent = '全选'
    btnShowAll.addEventListener('click', () => {
      onShowAll()
      // this.destroy()
    })
    // 取消全选
    const btnHideAll = document.createElement('button')
    btnHideAll.className = 'column-manager-btn'
    btnHideAll.textContent = '全不选'
    btnHideAll.addEventListener('click', () => {
      onHideAll()
      // this.destroy()
    })
    // 重置按钮
    const btnReset = document.createElement('button')
    btnReset.className = 'column-manager-btn'
    btnReset.textContent = '重置'
    btnReset.addEventListener('click', () => {
      onReset()
      // this.destroy()
    })
    // 挂载
    footer.appendChild(btnShowAll)
    footer.appendChild(btnHideAll)
    footer.appendChild(btnReset)
    this.panelEl.appendChild(footer)

    // 添加到容器
    container.appendChild(this.panelEl)
    return this.panelEl
  }

  // 销毁面板
  public destroy() {
    this.panelEl?.remove()
    this.panelEl = null 
  }

  // 获取当前面板元素
  public getElement(): HTMLDivElement | null {
    return this.panelEl
  }

  // 更新 checkbox 状态
  private updateCheckboxStates(allColumns: IColumn[], hiddenKeys: string[]) {
    if (!this.panelEl) return 
    allColumns.forEach(col => {
      const checkbox = this.panelEl!.querySelector(`#col-manager-${col.key}`) as HTMLInputElement
      if (checkbox) {
        checkbox.checked = !hiddenKeys.includes(col.key)
      }
    })
  }
}