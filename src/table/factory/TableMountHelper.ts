import type { IConfig, IColumn } from "@/types";
import type { TableStore } from "@/table/state/createTableStore";
import type { IPanelConfig } from "@/table/panel/IPanel";
import { ColumnWidthStorage } from "@/utils/ColumnWidthStorage";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { HeaderSortBinder } from "@/table/interaction/HeaderSortBinder";
import { LayoutManager } from "@/table/layout/LayoutManager";
import { SidePanelManager } from "@/table/panel/SidePanelManager";
import { assertUniqueColumnKeys } from "@/table/model/ColumnModel";
import { ShellCallbacks } from "@/table/handlers/ShellCallbacks";
import { createColumnPanel } from "@/table/panel/panels/ColumnPanel";
import { TableLifecycle } from "@/table/core/TableLifecycle";
import { createPivotPanel } from "@/table/panel/panels/PivotPanel";


/** 表格挂载参数: 容器准备, 布局创建, 面板初始化等 */
export interface MountParams {
  config: IConfig
  store: TableStore
  mode: 'client' | 'server'
  originalColumns: IColumn[]
  widthStorage: ColumnWidthStorage | null 
  renderer: DOMRenderer
  headerSortBinder: HeaderSortBinder
  lifecycle: TableLifecycle
  getClientFilterOptions: (key: string) => string[]
  loadSummaryData: (summaryRow: HTMLDivElement) => void 
  togglePanel: (panelId: string) => void 
  onPivotModeToggle?: (enabled: boolean) => void 
  onPivotConfigChange?: (config: any) => void
}

/** 挂载后的布局: 主布局 + 侧边布局 */
export interface MountResult {
  layoutManager: LayoutManager | null 
  sidePanelManager: SidePanelManager | null 
}

/** 
 * 挂载辅助类
 * 封装表格挂载相关的复杂逻辑
 */
export class MountHelper {
  /** 挂载表格 */
  static mount(params: MountParams, containerSelector?: string): MountResult {
    const { 
      config, 
      store,
      mode,
      originalColumns,
      widthStorage,
      renderer,
      headerSortBinder,
      lifecycle
    } = params

    // 检查 store 是否已初始化
    if (!store) {
      throw new Error('[VirtualTable] mount() 必须在 store 初始化后调用! ')
    }
    // 检查列的唯一性
    assertUniqueColumnKeys(config.columns)

    // 确认容器存在
    const selector = containerSelector || config.container
    const containerEl = typeof selector === 'string'
      ? document.querySelector<HTMLDivElement>(selector)
      : selector

    if (!containerEl) {
      throw new Error(`[VirtualTable] 容器未找到: ${selector}`)
    }

    // 清空容器并添加唯一标识
    containerEl.innerHTML = ''
    containerEl.setAttribute('data-table-id', config.tableId)
    containerEl.classList.add('virtual-table-instance')

    // 创建回调函数集合
    const shellCallbacks = new ShellCallbacks(
      config,
      store,
      mode,
      originalColumns,
      widthStorage,
      params.getClientFilterOptions,
      params.loadSummaryData,
      params.togglePanel
    )

    // 准备给 mountTableShell 的参数
    const commonShellParams = {
      config,
      renderer,
      headerSortBinder,
      ...shellCallbacks.getCallbacks()
    }

    // 判断是否启用右侧面板, 选择不同的布局方式
    const hasSidePanel = config.sidePanel?.enabled
    if (hasSidePanel) {
      // 主布局 + 侧边栏布局
      return this.mountWithSidePanel(
        mode,
        containerEl,
        config,
        commonShellParams,
        originalColumns,
        widthStorage,
        store,
        lifecycle,
        params.onPivotModeToggle,
        params.onPivotConfigChange

      )

    } else {
      // 普通布局
      return this.mountWithoutSidePanel(
        mode, 
        containerEl, 
        config, 
        commonShellParams,
        lifecycle
      )
    }
  }

  /**
   * 有右侧面板的挂载的布局
   */
  private static mountWithSidePanel(
    mode: 'client' | 'server',
    containerEl: HTMLDivElement,
    config: IConfig,
    commonShellParams: any,
    originalColumns: IColumn[],
    widthStorage: ColumnWidthStorage | null,
    store: TableStore,
    lifecycle: TableLifecycle,
    onPivotModeToggle?: (enabled: boolean) => void,
    onPivotConfigChange?: (config: any) => void,

  ): MountResult {

    const sp = config.sidePanel!
    // 创建布局管理器
    const layoutManager = new LayoutManager(config, {
      mode: 'desktop',
      sidePanel: {
        position: sp?.position ?? 'right',
        width: sp?.width ?? 250,
        collapsible: true,
        defaultOpen: sp?.defaultOpen ?? true
      }
    })

    // 渲染布局管理器
    const layoutContainer = layoutManager.render()
    layoutContainer.style.height = `${config.tableHeight}px`

    // 设置布局容器宽度
    if (typeof config.tableWidth === 'string') {
      // 若配置为 '100%',则直接使用
      layoutContainer.style.width = config.tableWidth
    } else {
      // 若是数值, 则优先恢复保存的宽度, 否则使用配置的宽度
      if (widthStorage) {
        const savedWidth = widthStorage.loadTableWidth()
        if (savedWidth && savedWidth >= 300) {
          layoutContainer.style.width = `${savedWidth}px`
          // 使用配置的宽度
        } else {
          layoutContainer.style.width = `${config.tableWidth}px`
        }
      } else {
        // 使用配置的宽度
        layoutContainer.style.width = `${config.tableWidth}px`
      }
    }

    // 大容器挂载上布局容器
    containerEl.appendChild(layoutContainer)

    // 初始化时自动调整表格宽度, 消除垂直滚动条, 模拟拖拽列宽效果
    requestAnimationFrame(() => {
      const scrollContainer = layoutManager.getMainArea()?.querySelector<HTMLDivElement>('.table-container')

      if (!scrollContainer) return
      // 检查是否有垂直滚动条, 有则将表格宽度增加 1px 触发表格更新去覆盖调列滚动条    
      if (scrollContainer.scrollHeight > scrollContainer.clientHeight) {
        // 获取当前布局容器宽度
        const currentWidth = layoutContainer.getBoundingClientRect().width
        const newWidth = currentWidth + 1
        // 发现只要更新一下这个 portalContainer 宽度就可以了!
        const portalContainer = scrollContainer.parentElement as HTMLDivElement
        if (portalContainer) {
          portalContainer.style.width = `${newWidth}px`
        }
      }
    })

    // 获取主区域和侧边区域
    const mainArea = layoutManager.getMainArea()
    const sideArea = layoutManager.getSideArea()
    if (!mainArea) {
      throw new Error('[MountHelper] 无法获取主表格区域')
    }

    // 使用 lifecycle.mount 挂载表格主体到 mainArea
    lifecycle.mount({
      commonShellParams,
      containerEl: mainArea,
      mode
    })

    // 创建面板管理器
    let sidePanelManager: SidePanelManager | null = null 
    if (sideArea) {
      // 动态添加列管理面板
      const panelConfigs: IPanelConfig[] = [
        ...sp.panels,
        {
          id: 'pivot',
          title: '透视表',
          icon: '📊',
          component: createPivotPanel as any 

        },
        {
          id: 'columns',
          title: '列管理',
          icon: '⚙️',
          component: createColumnPanel as any 
        }
      ]

      // 创建 Tab 容器, 在 SidePanelManager 外部创建
      const tabsContainer = document.createElement('div')
      tabsContainer.className = 'side-panel-tabs-container' 
      sideArea.appendChild(tabsContainer)
      // 创建面板管理器
      sidePanelManager = new SidePanelManager(
        store,
        panelConfigs,
        tabsContainer,
        originalColumns,
        (show: boolean) => { layoutManager.toggleSidePanel(show) },
        onPivotModeToggle,
        onPivotConfigChange
      )
      // 挂载面板内容日期
      sideArea.appendChild(sidePanelManager.getContainer())
      // 只有在 defaultOpen 为 true 的释藏, 才显示默认面板
      if (sp.defaultOpen && sp.defaultPanel) {
        if (sp.defaultPanel === 'columns') {
          // 列管理 tab 则需要将 原始列信息传入进去
          sidePanelManager.togglePanel(sp.defaultPanel, originalColumns)
        } else {
          sidePanelManager.togglePanel(sp.defaultPanel)
        }
      }
    }

    return { layoutManager, sidePanelManager }
  }

  /**
   * 无右侧面板的挂载
   */
  private static mountWithoutSidePanel(
    mode: 'client' | 'server',
    containerEl: HTMLDivElement,
    config: IConfig,
    commonShellParams: any,
    lifecycle: TableLifecycle,

  ): MountResult {

    // 使用 lifecycle.mount 挂载表格
    lifecycle.mount({
      commonShellParams,
      containerEl,
      mode
    })
    
    return { layoutManager: null, sidePanelManager: null }
  }
}