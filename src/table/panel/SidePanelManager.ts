import type { IPanel, IPanelConfig } from "@/table/panel/IPanel";
import type { TableStore } from "@/table/state/createTableStore";
import { PanelRegistry } from "@/table/panel/PanelRegistry";
import { IColumn } from "@/types";

/**
 * 右侧面板管理器: 管理右侧面板的显示, 切换和销毁
 * 
 * 职责: 
 * 1. 管理面板实例的生命周期 (创建, 显示, 隐藏, 销毁)
 * 2. 处理面板的切换逻辑
 * 3. 渲染面板容器和切换 Tab
 * 
 * 设计模式: 单例模式 (每个表格一个实例)
 */
export class SidePanelManager {
  private registry: PanelRegistry // 面板注册表
  private panels = new Map<string, IPanel>()  // 已创建的面板实例缓存
  private activePanel: string | null = null // 当前集合的面板 id
  private container: HTMLDivElement // 面板容器
  private contentContainer!: HTMLDivElement // 面板内容容器
  private pivotModeEnabled = false

  constructor(
    private store: TableStore, 
    private configs: IPanelConfig[], // 要启用的面板配置
    private tabsContainer: HTMLDivElement,
    private originalColumns: IColumn[],
    private onPanelToggle?: (show: boolean) => void,
    private onPivotModeToggle?: (enabled: boolean) => void ,
    private onPivotConfigChange?: (config: any) => void // 此回调在 pivot 创建时传入
  ) {
    this.registry = new PanelRegistry()
    // 注册所有面板
    this.registry.registerAll(configs)
    // 渲染容器
    this.container = this.render()
  }

  /** 渲染面板管理器的 dom 结构 */ 
  private render(): HTMLDivElement {
    // 只渲染面板内容容器, 不包含 Tab
    const container = document.createElement('div')
    container.className = 'side-panel-content-wrapper'

    // 默认隐藏面板内容
    container.classList.add('hidden')
    // 渲染面板内容区
    this.contentContainer = document.createElement('div')
    this.contentContainer.className = 'side-panel-content'
    container.appendChild(this.contentContainer)
    // 在外部传入的 tabsContainer 中渲染 Tab
    this.renderTabsToContainer()
    
    return container
  }

  /** 渲染 tab 到容器中 */
  public renderTabsToContainer(): void {
    this.tabsContainer.innerHTML = ''

    // === 顶部: Pivot Mode 开关 =====
    const pivotToggle = document.createElement('div')
    pivotToggle.className = 'pivot-mode-toggle'

    const toggleIcon = document.createElement('div')
    toggleIcon.className = 'pivot-mode-toggle'
    toggleIcon.textContent = '📊'
    pivotToggle.appendChild(toggleIcon)

    const toggleTitle = document.createElement('div')
    toggleTitle.className = 'pivot-mode-title'
    toggleTitle.textContent = 'Pivot'
    pivotToggle.appendChild(toggleTitle)

    // Toggle Switch
    const switchWrapper = document.createElement('label')
    switchWrapper.className = 'pivot-switch'

    const switchInput = document.createElement('input')
    switchInput.className = 'pivot-switch-input'
    switchInput.type = 'checkbox'
    switchInput.checked = this.pivotModeEnabled

    const switchSlider = document.createElement('span')
    switchSlider.className = 'pivot-switch-slider'
    // 挂载
    switchWrapper.appendChild(switchInput)
    switchWrapper.appendChild(switchSlider)
    pivotToggle.appendChild(switchWrapper)

    switchInput.addEventListener('change', () => {
      this.pivotModeEnabled = switchInput.checked 
      // 通知 VirtualTable 切换透视模式
      this.onPivotModeToggle?.(this.pivotModeEnabled)
      // 开启时自动打开 pivot 配置面板
      if (this.pivotModeEnabled && this.registry.has('pivot')) {
        // 传入 columns + onConfigChange 回调
        this.togglePanel('pivot', this.originalColumns, this.onPivotConfigChange)

      } else if (!this.pivotModeEnabled) {
        this.hideCurrentPanel()
      }
    })

    this.tabsContainer.appendChild(pivotToggle)
    // 分割线
    const divider = document.createElement('div')
    divider.style.borderBottom = '1px solid #e0e0e0'
    divider.style.margin = '4px 0'
    this.tabsContainer.appendChild(divider)

    // ========  下方: 为每个面板创建一个 tab
    this.configs.forEach(config => {
      const tab = document.createElement('div')
      tab.className = 'side-panel-tab-vertical'
      tab.dataset.panelId = config.id
      // Tab 内容: 图标 + 标题
      if (config.icon) {
        const icon = document.createElement('div')
        icon.className = 'tab-icon'
        icon.textContent = config.icon 
        tab.appendChild(icon)
      }
      // 标题 (垂直显示)
      const title = document.createElement('div')
      title.className = 'tab-title-vertical'
      title.textContent = config.title
      tab.appendChild(title)
      // 点击 Tab 切换面板, 注意有的面板, 如 pivot 是需要传回调的哦
      tab.onclick = () => {
        if (config.id === 'columns') {
          this.togglePanel(config.id, this.originalColumns)

        } else if (config.id === 'pivot') {
          this.togglePanel(config.id, this.originalColumns, this.onPivotConfigChange)
          
        } else {
          this.togglePanel(config.id)
        }
      }
      // hover 效果
      tab.onmouseenter = () => {
        tab.style.background = '#e8e8e8'
      }
      tab.onmouseleave = () => {
        if (this.activePanel !== config.id) {
          tab.style.background = '#f5f5f5'
        }
      }
      this.tabsContainer.appendChild(tab)
    })
  }

  /** 切换指定面板, 支持传参 */
  public togglePanel(panelId: string, ...args: any[]): void {
    // 验证 store 是否存在
    if (!this.store) {
      console.error('[SidePanelManager] store 未初始化,无法显示面板')
      return 
    }
    // 未注册, 就是当前面板, 则不用处理
    if (!this.registry.has(panelId)) {
      console.warn(`[SidePanelManager] 面板 "${panelId}" 未注册`)
      return 
    }
    // 若点击的是当前面板, 则关闭, 视觉上会呈现 '收回去'
    if  (this.activePanel === panelId) {
      this.hideCurrentPanel()
      return 
    }

    this.container.classList.remove('hidden')

    // 1. 隐藏当前活跃面板
    if (this.activePanel) {
      const currentPanel = this.panels.get(this.activePanel)
      currentPanel?.onHide?.()
    }
    // 2. 获取或创建目标面板实例
    let panel = this.panels.get(panelId)
    if (!panel) {
      // 懒加载, 首次闲时候才创建实例, 传入额外参数到 createPanel
      panel = this.registry.createPanel(panelId, this.store, ...args)
      this.panels.set(panelId, panel)
    }
    // 3. 显示目标面板实例
    this.contentContainer.innerHTML = ''
    this.contentContainer.appendChild(panel.getContainer())
    panel.onShow?.()
    // 4. 更新激活状态
    this.activePanel = panelId
    this.updateTabsActiveState(panelId)
    // 通知 LayoutManager 展开面板
    this.onPanelToggle?.(true)
  }

  /** 更新 Tab 激活状态 */
  public updateTabsActiveState(activeId: string): void {
    const tabs = this.tabsContainer.querySelectorAll<HTMLDivElement>('.side-panel-tab-vertical')
    tabs.forEach(tab => {
      const tabId = tab.dataset.panelId 
      if (tabId === activeId) {
        tab.classList.add('active')
      } else {
        tab.classList.remove('active')
      }
    })
  }

  /** 隐藏当前面板 */
  public hideCurrentPanel(): void {
    if (this.activePanel) {
      const panel = this.panels.get(this.activePanel)
      panel?.onHide?.()
      this.container.classList.add('hidden')
      this.contentContainer.innerHTML = ''
      this.activePanel = null 
      this.updateTabsActiveState('')
      // 通知 LayoutManager 收起面板
      this.onPanelToggle?.(false)
    }
  }

  /** 获取面板管理的 dom 容器 */
  public getContainer(): HTMLDivElement {
    return this.container
  }

  /** 获取当前激活面板 id */
  public getActivePanel(): string | null {
    return this.activePanel
  }

  /** 获取当前表格形态是否为 透视 模式 */
  public isPivotMode(): boolean {
    return this.pivotModeEnabled
  }

  /** 销毁面板管理器, 释放所有资源 */
  public destroy(): void {
    // 销毁所有面板实例
    this.panels.forEach((panel, id) => {
      console.log(`[SidePanelManager] 销毁面板: ${id}`)
      panel.destroy()
    })

    this.panels.clear()
    this.registry.clear()
    this.container.remove()
    this.activePanel = null 
    console.log('[SidePanelManager] 面板管理器已销毁')
  }
}