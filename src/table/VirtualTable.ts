import { TableConfig } from '@/config/TableConfig'
import { DOMRenderer } from '@/dom/DOMRenderer'
import { VirtualScroller } from '@/scroll/VirtualScroller'
import type { ColumnFilterValue, IConfig, ITableQuery, IUserConfig } from '@/types'
import { HeaderSortBinder } from '@/table/interaction/HeaderSortBinder'
import { bootstrapStrategy } from '@/table/data/bootstrapStrategy'
import { VirtualViewport } from '@/table/viewport/VirtualViewport'
import type { ITableShell } from '@/table/TableShell'
import { mountTableShell } from '@/table/TableShell'
import type { TableStore } from '@/table/state/createTableStore'
import type { TableAction, TableState } from '@/table/state/types'
import type { IColumn } from '@/types'
import { createTableStore } from '@/table/state/createTableStore'
import { assertUniqueColumnKeys, resolveColumns } from '@/table/model/ColumnModel'
import { ColumnWidthStorage } from '@/utils/ColumnWidthStorage'
import { ColumnManager } from '@/table/core/ColumnManager'
import { PerformanceMonitor } from '@/utils/PerformanceMonitor'
// 重构布局 + 右侧菜单栏
import { LayoutManager } from '@/table/layout/LayoutManager'
import { SidePanelManager } from '@/table/panel/SidePanelManager'
import type { IPanelConfig } from '@/table/panel/IPanel'
import { ShellCallbacks } from '@/table/handlers/ShellCallbacks' // 回调
import { createColumnPanel } from '@/table/panel/panels/ColumnPanel'
import { 
  actionHandlers, COLUMN_EFFTECT_ACTIONS, DATA_EFFECT_ACTIONS, handleDataChange, 
  STATE_ONLY_ACTIONS, 
  STRUCTURAL_EFFECT_ACTIONS } from '@/table/handlers/ActionHandlers'
import type { ActionContext } from '@/table/handlers/ActionHandlers'
import { SortState } from '@/table/core/SortState'
import { RenderMethod, RenderProtocalValidator, RenderScenario } from '@/table/viewport/RenderProtocol'
// 数据策略
import type { DataStrategy } from '@/table/data/DataStrategy'
import { ClientDataStrategy } from '@/table/data/ClientDataStrategy'
import { ServerDataStrategy } from '@/table/data/ServerDataStrategy'
//  3个核心类
import { TableLifecycle } from '@/table/core/TableLifecycle'
import { TableQueryCoordinator } from '@/table/core/TableQueryCoordinator'
import { TableStateSync } from '@/table/core/TableStateSync'


// 主协调者, 表格缝合怪;  只做调度, 不包含业务逻辑
export class VirtualTable {
  private config: IConfig // 内部用完整配置
  private shell!: ITableShell
  private mode: 'client' | 'server' = 'server' 
  private headerSortBinder = new HeaderSortBinder()
  private serverQuery: ITableQuery = { filterText: '' } 
  private viewport!: VirtualViewport

  private dataStrategy!: DataStrategy
  private renderer: DOMRenderer
  private scroller: VirtualScroller

  private store!: TableStore 
  private originalColumns!: IColumn[]
  private unsubscribleStore: (() => void) | null = null 
  private widthStorage: ColumnWidthStorage | null = null  // 列宽存储

  private columnManager!: ColumnManager // 列统一管理器, 这个很强大

  // 布局管理器 + 右侧面板管理器
  private layoutManager: LayoutManager | null = null 
  private sidePanelManager: SidePanelManager | null = null 
  private scrollStopTimer?: number // 滚动停止检测定时器

  private lifecycle!: TableLifecycle
  private queryCoordinator!: TableQueryCoordinator
  private stateSync!: TableStateSync

  // ready 用于外部等待初始化完后 (store/shell/viewport 都 ok 后, 再 dispatch)
  public readonly ready: Promise<void> 
  private resolveReady: (() => void) | null = null 
  private pendingActions: TableAction[] = []
  private isReady = false

  constructor(userConfig: IUserConfig) {
    // 初始化配置 (此时的 totalRows 是默认值, 后续会被覆盖)
    const tableConfig = new TableConfig(userConfig)
    this.config = tableConfig.getAll()

    // 初始化列宽存储, 使用最终的 tableId, 自动生成
    const finalTableId = this.config.tableId
    if (finalTableId) {
      this.widthStorage = new ColumnWidthStorage(finalTableId)
      this.restoreColumnWidths() // 恢复保存的列宽
    }

    this.renderer = new DOMRenderer(this.config)
    this.scroller = new VirtualScroller(this.config)

    // 创建 ready Promise, initializeAsync 完成后 resolve 
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve
    })

    // 启动异步初始化流程
    this.initializeAsync()

    // 开发模式下, 开启性能监控
    if (process.env.NODE_ENV === 'development') {
      PerformanceMonitor.enable()
    }
  }

  // 对外暴露当前表格 state 状态, 后续做 vue 封装会很需要
  public getState() {
    return this.store.getState()
  }

  // 方便 demo 使用 (减少导出 await)
  public onReady(cb: () => void) {
    this.ready.then(cb).catch(console.warn)
  }

  // 对外暴露 dispatch, 后续拽列, 原生 UI 都走它
  public dispatch(action: TableAction) {
    // 未初始完成时, 不直接 dispatch, 先排队, 避免 store 为 undefined
    if (!this.isReady || !this.store) {
      this.pendingActions.push(action)
      return 
    }
    return this.store.dispatch(action)
  }

  // 异步初始化
  private async initializeAsync() {
    // ======= server 模式 渲染流程 ===========
    // server 模式渲染准备前期工作

    // server 模式下, 不要 await 首次请求, 否则 mount 被阻塞, 会白屏无数据
    const isServerBootstrap = !this.config.initialData && typeof this.config.fetchPageData === 'function'
    try {
      if (isServerBootstrap) {
        // 先按 server 模式将 "骨架表格" 挂出来
        this.mode = 'server'
        // totalRows 先用默认值, 等有数真实数据再替换回来
        assertUniqueColumnKeys(this.config.columns) // 列 key 唯一校验
        this.originalColumns = [...this.config.columns]
        // 创建 ServerDataStrategy, 在 mount 之前搞定
        this.dataStrategy = new ServerDataStrategy(
          this.config.fetchPageData!,
          this.config.pageSize,
          this.config.fetchSummaryData
        )
        // 创建 store
        this.store = createTableStore({
          columns: this.originalColumns,
          mode: this.mode,
          frozenCount: this.config.frozenColumns
        })

        this.stateSync = new TableStateSync({
          config: this.config,
          store: this.store,
          originalColumns: this.originalColumns
        })

        // 同步列到 state
        this.stateSync.syncColumnOrderToState()
        // 初始化 TableLifecycle (server 模式)
        this.lifecycle = new TableLifecycle({
          config: this.config,
          dataStrategy: this.dataStrategy,
          store: this.store,
          originalColumns: this.originalColumns
        })

        // 将 lifecycle 中的组件引用 同步到 VirtalTable
        this.renderer = this.lifecycle.renderer
        this.scroller = this.lifecycle.scroller
        this.headerSortBinder = this.lifecycle.headerSortBinder

        // 挂载 DOM (会创建 ColumnManager)
        this.mount() // 这里 ColumnManager 才初始化, 可能导致更新列有问题
        // 设置排序指示器
        this.shell.setSortIndicator(this.store.getState().data.sort)
        this.config.onModeChange?.(this.mode)

        // ready 可以在 mount 后就 resolve, 此时 dispatch 安全, 数据可能还还在加载
        this.isReady = true 
        const pending = this.pendingActions
        this.pendingActions = []
        pending.forEach(action => this.store.dispatch(action))
        this.resolveReady?.()
        this.resolveReady = null 

        // 后台开始拉取第 0 页, 让 totalRows 更新真实值, 并刷新 scroller/viewport
        void this.dataStrategy.bootstrap().then( async ({ totalRows: realTotal }) => {
          // 只要 bootstrap 成功就执行, 不论 totalRows 是多少, 宽松管理
          const newTotal = typeof realTotal === 'number' ? realTotal : 0
          // 先判断是否需要重建 scroller, 在 修改 config 之前
          const needRebuild = newTotal !== this.config.totalRows
          // 更新 totalRows
          this.config.totalRows = newTotal
          this.store.dispatch({ type: 'SET_TOTAL_ROWS', payload: { totalRows: realTotal} })
          
          // 只有 totalRows 变化时才重建 scroller
          if (needRebuild) {
            this.scroller = new VirtualScroller(this.config)
            this.viewport.setScroller(this.scroller)
            this.shell.setScrollHeight(this.scroller)
          }
          // ===== 规则3: 初始化填充不能走 applyServerQuery =======
          if (process.env.NODE_ENV === 'development') {
            RenderProtocalValidator.validate(
              RenderScenario.INITIAL_FILL,
              RenderMethod.UPDATE_VISIBLE,
              'VirtaulTable.initializeAsync (server mode)'
            )
          }
          this.viewport.updateVisibleRows() // 不能是 refresh() 哦!
          this.updateStatusBar() // 更新底部状态栏
          
          if (this.config.showSummary) {
            await this.refreshSummary().catch(console.warn)
          }

          // 关键!!: 订阅 store 要等 bootstrap 和 refreshSummary 完成之后
          this.unsubscribleStore?.()
          this.unsubscribleStore = this.store.subscribe((next, prev, action) => {
            this.handleStateChange(next, prev, action) 
          })
          
        }).catch(console.warn) 

        
        return 
      }

    // ======= client 模式或者 用户传入了 initialData 的情况 ===========

    // client 模式下, 渲染前准备工作处理
    const { strategy, mode, totalRows } = await bootstrapStrategy(this.config)
    this.dataStrategy = strategy
    this.mode = mode 
    this.config.totalRows = totalRows

    // 创建 全局 store 
    this.store = createTableStore({
      columns: this.originalColumns,
      mode: this.mode,
      frozenCount: this.config.frozenColumns
    })

    // 初始化 TableStateSync (client 模式)
    this.stateSync = new TableStateSync({
      config: this.config,
      store: this.store,
      originalColumns: this.originalColumns
    })
    // 同步列顺序到 state
    this.stateSync.syncColumnOrderToState()

    // 更新 totalRows 到 store 中去 
    this.store.dispatch({ type: 'SET_TOTAL_ROWS', payload: { totalRows } })

    assertUniqueColumnKeys(this.config.columns) // 列 key 唯一值校验, 避免排序拖拽等混乱
    this.originalColumns = [...this.config.columns] // 保留用户原始列配置

    // ===== 初始化 TableLifecycle (client 模式) 
    this.lifecycle = new TableLifecycle({
      config: this.config,
      dataStrategy: this.dataStrategy,
      store:this.store,
      originalColumns: this.originalColumns
    })

    // 将 lifecycle 中的组件引用同步到 VirtualTable
    this.renderer = this.lifecycle.renderer
    this.scroller = this.lifecycle.scroller
    this.headerSortBinder = this.lifecycle.headerSortBinder

    // 挂载 DOM, 会绑定表头点击事件, 滚动事件等, 右侧边栏等
    this.mount()

    // 设置排序指示器
    this.shell.setSortIndicator(this.store.getState().data.sort)
    this.config.onModeChange?.(this.mode)

    // 订阅 state 变化 -> 驱动副作用 (排序/筛选/列变化重建等), 在 mount 之后
    this.unsubscribleStore?.()
    this.unsubscribleStore = this.store.subscribe((next, prev, action) => {
      this.handleStateChange(next, prev, action)
    })

    // 标记 ready, 并 flush 初始化前积攒的 action 
    this.isReady = true 
    const pending = this.pendingActions
    this.pendingActions = []
    pending.forEach(action => this.store.dispatch(action))
    this.resolveReady?.()
    this.resolveReady = null 

  } catch (err) {
    console.warn('[VirtualTable.initializeAsync] faild: ', err)
    throw err 
  }
}

  // 挂载 shell + viewport (由 initializeAsync 内部调用)
  private mount(containerSelector?: string): void {
    // // 0. 防止重复挂载
    if (this.shell) {
      console.warn('[VirtualTable] 检测到重复挂载, 销毁旧实例')
      // 清理旧的实例, 允许重新挂载
      this.remount(containerSelector!)
      this.destroy()

    }
    // 1. 检查 store 是否已初始化
    if (!this.store) {
      console.error('[VirtualTable] store 未初始化, 无法挂载表格!')
      throw new Error('[VirtualTable] mount() 必须在 store 初始化后调用!')
    }

    // 检查列的唯一性
    assertUniqueColumnKeys(this.config.columns)
    // 确认容器存在
    const selector = containerSelector || this.config.container
    const containerEl = typeof selector === 'string'
      ? document.querySelector<HTMLDivElement>(selector)
      : selector 
    
    if (!containerEl) {
      throw new Error(`[VirtualTable] 容器未找到: ${selector}`)
    }
    // 清空容器, 避免内容重复
    containerEl.innerHTML = ''
    // 添加唯一标识, 表格实例样式隔离
    containerEl.setAttribute('data-table-id', this.config.tableId)
    containerEl.classList.add('virtual-table-instance')
    // 判断是否启用右侧面板, !! 强制转为 boolean
    const hasSidePanel = !!(this.config.sidePanel?.enabled)
    // 创建回调函数集合, 并提取公共的 mountTableShell 参数
    const shellCallbacks = new ShellCallbacks(
      this.config,
      this.store,
      this.mode,
      this.originalColumns,
      this.widthStorage,
      (key: string) => this.getClientFilterOptions(key),
      (summaryRow: HTMLDivElement) => this.loadSummaryData(summaryRow),
      (panelId: string) => {
        if (this.sidePanelManager) {
          if (panelId === 'columns') {
            this.sidePanelManager.togglePanel(panelId, this.originalColumns)
          } else {
            this.sidePanelManager.togglePanel(panelId)
          }
        }
      }
    )

    const commonShellParams = {
      config: this.config,
      renderer: this.renderer,
      headerSortBinder: this.headerSortBinder,
      ...shellCallbacks.getCallbacks() // 展开所有回调函数
    }

    // 根据是否有右侧面板, 选择不同的布局方式
    if (hasSidePanel) {
      // 类型守卫 和用 ?? 来提供默认值
      const sp = this.config.sidePanel!
      // ======== 有右侧面板: 使用 LayoutManager 布局 =============
      this.layoutManager = new LayoutManager(this.config, {
        mode: 'desktop',
        sidePanel: {
          position: sp.position ?? 'right',
          width: sp.width ?? 250,
          collapsible: true,
          defaultOpen: sp.defaultOpen ?? true
        }
      })
      // 渲染布局容器
      const layoutContainer = this.layoutManager.render()
      layoutContainer.style.height = `${this.config.tableHeight}px`
      // 使用 widthStorage 恢复表格宽度
      if (this.widthStorage) {
        const savedWidth = this.widthStorage.loadTableWidth()
        if (savedWidth && savedWidth >= 300) {
          layoutContainer.style.width = `${savedWidth}px`
        }
      }
      containerEl.appendChild(layoutContainer)
      // 动态添加列管理面板到配置中
      const panelConfigs: IPanelConfig[] = [
        ...this.config.sidePanel!.panels, // 用户配置的面板
        // 兜底: 列管理面板
        {
          id: 'columns',
          title: '列管理',
          icon: '⚙️',
          // 使用 createColumnPanel 工厂函数
          component: createColumnPanel as any 
        }
      ]
      // 获取 Tab 容器
      const tabsArea = this.layoutManager.getTabsArea()
      // 创建面板管理器, 传入 Tab 容器和回调
      this.sidePanelManager = new SidePanelManager(
        this.store, // 此时 store 可能还没有有值哦!
        panelConfigs,
        tabsArea,
        (show: boolean) => {
          // 面板展开/收起时, 通知 LayoutManager 
          this.layoutManager?.togglePanel(show)
        }
      )
      // 将面板管理器挂载到右侧区域
      const sideArea = this.layoutManager.getSideArea()
      if (sideArea) {
        sideArea.appendChild(this.sidePanelManager.getContainer())
      }

      // 显示默认面板, 如果是 columns 面板, 则传入 originalColumns 
      const defaultPaneId = this.config.sidePanel?.defaultPanel || panelConfigs[0]?.id
      if (defaultPaneId === 'columns') {
        // 列管理面板需要传入 originalColumns
        this.sidePanelManager.togglePanel(defaultPaneId, this.originalColumns)

      } else {
        this.sidePanelManager.togglePanel(defaultPaneId)
      }

      // 关键: 挂载 table 到 mainArea, 并传入所有回调, 注意右侧面板先不要调用哦!
      const mainArea = this.layoutManager.getMainArea()!
      this.lifecycle.mount({
        commonShellParams, 
        containerEl: mainArea,
        mode: this.mode
      })
     

    } else {
      // ========= 无右侧面板: 标准布局 ===========
      this.lifecycle.mount({
        commonShellParams, 
        containerEl: containerEl,
        mode: this.mode
      })
    }

    // ==== 从 lifecycle 获取组件引用 ====
    this.shell = this.lifecycle.shell
    this.viewport = this.lifecycle.viewport
    this.columnManager = this.lifecycle.columnManager

    // ==== 初始化 TableQueryCoordinator ==== 
    this.queryCoordinator = new TableQueryCoordinator({
      config: this.config,
      dataStrategy: this.dataStrategy,
      store: this.store,
      viewport: this.viewport,
      shell: this.shell,
      renderer: this.renderer,
      getScroller: () => this.scroller,
      setScroller: (scroller: VirtualScroller) => { this.scroller = scroller }
    })

    // 通用初始化逻辑, 两种模式都需要
    // 首次挂载后, 就立刻同步一次滚动高度
    this.shell.setScrollHeight(this.scroller)
    // 滚动监听由 shell 统一绑定, 而 VirtualTable 只提供滚动后做什么
    this.shell.bindScroll(() => {
      // ====== 规则2: 数据滚动只能调用 updateVisibleRows() ===== 
      if (process.env.NODE_ENV === 'development') {
        RenderProtocalValidator.validate(
          RenderScenario.SCROLL_UPDATE,
          RenderMethod.UPDATE_VISIBLE,
          'VirtaulTable scroll callback'
        )
      }

      this.viewport.updateVisibleRows()

      // 只在 server 模式且由状态栏时, 检测滚动停止并更新
      if (this.mode === 'server' && this.config.showStatusBar !== false) {
        if (this.scrollStopTimer) {
          clearTimeout(this.scrollStopTimer)
        }
        // 设置新定时器, 150ms, 无滚动则认为停止
        this.scrollStopTimer = window.setTimeout(() => {
          this.updateStatusBar()
        }, 150)
      }
    })
    
    // 只在 client 模式下首次渲染, 因为已缓存了;
    // 而 server 会等 getPageData(0) 后在 initializeAsync 的 then 回调中
    if (this.mode === 'client') {
      this.viewport.updateVisibleRows()
    }
   
    // 首次挂载后, 立即刷新一次总结行数据, server 模式下要等 bootstrap 搞完再刷
    if (this.config.showSummary && this.mode === 'client') {
      this.refreshSummary().catch(console.warn)
    }

    // 最后显示默认面板 (使用微任务延迟,(可选)确保所有初始化完成)
    if (hasSidePanel && this.sidePanelManager) {
      const sp = this.config.sidePanel!
      // 直接调用, 不需要 setTimeout
      if (sp.defaultPanel) {
        this.sidePanelManager?.togglePanel(sp.defaultPanel)
      } else if (sp.panels.length > 0) {
        this.sidePanelManager?.togglePanel(sp.panels[0].id)
      }
    }
  }

  // 更新表格底部状态栏数据
  private updateStatusBar() {
    // 委托给 queryCoordinator
    this.queryCoordinator.updateStatusBar()
  }

  // server 模式下: 加载总结行数据 (传参)
  private async loadSummaryData(summaryRow: HTMLDivElement) {
    if (!this.config.fetchSummaryData) return 
    try {
      const summaryData = await this.config.fetchSummaryData(this.serverQuery)
      this.renderer.updateSummaryRow(summaryRow, summaryData)
    } catch (err) {
      console.error('加载总结行失败: ', err)
    }
  }

  // client / server 刷新总结行数据, 统一走 dataStrategy
  public async refreshSummary() {
    // 委托给 queryCoordinator
    await this.queryCoordinator.refreshSummary()
  }

  // 对外暴露: 是否为客户端模式
  public get isClientMode(): boolean {
    return this.mode === 'client'
  }

  public sort(sortKey: string, direction: 'asc' | 'desc') {
    this.store.dispatch({ type: 'SORT_SET', payload: { sort: { key: sortKey, direction }}})
  }


  public filter(filterText: string) {
    this.store.dispatch(
      {
        type: 'SET_FILTER_TEXT',
        payload: { text: filterText }
      }
    )
  }

  // 将 state 应用到 config (列顺序, 列宽, 冻结列数等)
  private applyColumnsFromState() {
    // 委托给 stateSync
    this.stateSync.applyColumnsFromState()
  }

  // 列操作的统一更新逻辑
  private updateColumnUI() {
    // 防御性检查, server 模式下, 列管理可能还未初始化, 更新个毛线!
    if (!this.columnManager) {
      console.warn('[VirtualTable] columnManger 未初始化, 跳过列更新!')
      return 
    }
    // 性能监控
    PerformanceMonitor.measure('列更新', () => {
      this.applyColumnsFromState()
      // 用 ColumnManager 统一更新, 并使用 shell 的缓存 DOM 引用, 减少重复查询, 也没有 refresh!
      this.columnManager.updateColumns(this.config.columns, {
        headerRow: this.shell.headerRow, 
        summaryRow: this.shell.summaryRow,
        dataRows: this.viewport.getVisibleRows()
      })
      // 更新列宽, 同时会设置 css 变量
      this.shell.updateColumnWidths(this.config.columns, this.viewport.getVisibleRows())
    })
  }

  // state 变化后的统一入口, 使用策略模式, 路由到 ActionHandler 映射, 并检测走白名单
  private handleStateChange(next: TableState, prev: TableState, action: TableAction) {
    // 先查找是否有注册的处理器
    const handler = actionHandlers.get(action.type)

    if (handler) {
      const context: ActionContext = { table: this }
      handler(action, context) // 动作名称, 响应视图逻辑
      return  // 处理完就返回, 不再走后续逻辑
    } 

    // 若没有注册处理器, 检查是否再白名单中, 在 dev 模式下给出警告
    if (process.env.NODE_ENV === 'development') {
      const allKnowActions = new Set([
        ...DATA_EFFECT_ACTIONS,
        ...COLUMN_EFFTECT_ACTIONS,
        ...STRUCTURAL_EFFECT_ACTIONS,
        ...STATE_ONLY_ACTIONS,
      ])

      if (!allKnowActions.has(action.type)) {
        console.warn(`[VirtualTable] 未知的 action type: "${action.type}"`,
          '\n请在 ActionHandlers.ts 中注册该 action 或添加到对应的白名单中!'
        )
      }
    }

    // 不再有默认的 handleDataChange 兜底
    // 这样可以避免 "未知 action 误触发数据刷新" 的重大问题

  }

  // client 模式下, 推导列可选值 (topN 或全量去重, 避免百万枚举卡死)
  private getClientFilterOptions(key: string): string[] {
    // 暂不支持 server 哦
    return this.dataStrategy.getFilterOptions(key)
  }


  private rebuild() {
    // 委托给 lifecycle.rebuild
    this.lifecycle.rebuild({
      applyColumnsFromState: () => this.applyColumnsFromState(),
      applyQuery: (query: ITableQuery) => this.applyQuery(query),
      getMountParams: () => {
        // 准备 mount 所需参数
        const selector = this.config.container
        const containerEl = typeof selector === 'string' 
          ? document.querySelector<HTMLDivElement>(selector)!
          : selector!
        
        const shellCallbacks = new ShellCallbacks(
          this.config,
          this.store,
          this.mode,
          this.originalColumns,
          this.widthStorage,
          (key: string) => this.getClientFilterOptions(key),
          (summaryRow: HTMLDivElement) => this.loadSummaryData(summaryRow),
          (panelId: string) => {
            if (panelId === 'columns') {
              this.sidePanelManager?.togglePanel(panelId, this.originalColumns)
            } else {
              this.sidePanelManager?.togglePanel(panelId)
            }
          }
        )

        const commonShellParams = {
          config: this.config,
          renderer: this.renderer,
          headerSortBinder: this.headerSortBinder,
          ...shellCallbacks.getCallbacks()
        }

        return {
          commonShellParams,
          containerEl,
          mode: this.mode
        }
      }
    })

    // 重新同步组件引用
    this.shell = this.lifecycle.shell
    this.viewport = this.lifecycle.viewport
    this.columnManager = this.lifecycle.columnManager
   
  }


  /**
   * 统一的查询应用入口 
   * - 不关心 mode, 完全交由 dataStrategy 处理
   * - 根据 strategy 返回值统一更新 scroller/viewport
   * 
   * @param query 查询条件
   */
  private async applyQuery(query: ITableQuery) {
    //委托给 queryCoordinator
    await this.queryCoordinator.applyQuery(query)
  }

  // 从 localStorage 恢复列宽, 表格宽, 列顺序
  private restoreColumnWidths() {
    if (!this.widthStorage) return
    // 恢复列宽
    const savedColumnWidths = this.widthStorage.loadColumnWidth()
    if (savedColumnWidths) {
      this.config.columns.forEach(col => {
        if (savedColumnWidths[col.key]) {
          col.width = savedColumnWidths[col.key]
        }
      })
    }
    // 恢复整表宽度
    const savedTableWidth = this.widthStorage.loadTableWidth()
    if (savedTableWidth) {
      this.config.tableWidth = savedTableWidth
    }

    // 恢复列顺序 (在列宽恢复之后, 避免影响)
    const savedColumnOrder = this.widthStorage.loadColumnOrder()
    if (savedColumnOrder && savedColumnOrder.length > 0) {
      this.restoreColumnOrder(savedColumnOrder)
    }
  }

  // 恢复列顺序
  public restoreColumnOrder(savedOrder: string[]) {
    try {
      // 创建列映射, 方便查找
      const columnMap = new Map(this.config.columns.map(col => [col.key, col]))
      // 按保存的顺序查询排列列
      const newColumns: IColumn[] = []
      const processedKeys = new Set<string>
      // 添加保存顺序中的列
      for (const key of savedOrder) {
        const col = columnMap.get(key)
        if (col) {
          newColumns.push(col)
          processedKeys.add(key)
        }
      }
      // 添加没有在保存顺序中的列 (新增列)
      for (const col of this.config.columns) {
        if (!processedKeys.has(col.key)) {
          newColumns.push(col)
        }
      }
      // 恢复时, 只恢复列配置, 不同步 state
      // 初始化后, syncColumnOrderToState 统一同步到 state
      // 变化时: 保存 loclaStorage
      this.config.columns = newColumns
      this.originalColumns = [...newColumns]  // 同步更新原始列配置

    } catch (err) {
      console.warn('恢复列顺序失败: ', err)
    }
  }

  // 切换右侧面板显示/隐藏
  public toggleSidePanel(show?: boolean): void {
    this.layoutManager?.toggleSidePanel(show)
  }

  // 切换到指定的面板
  public showPanel(panelId: string): void {
    this.sidePanelManager?.togglePanel(panelId)
  }

  // 获取当前激活面板的 id 
  public getActivePanel(): string | null {
    return this.sidePanelManager?.getActivePanel() ?? null 
  }

  // 重新挂载到容器, 和 清空的区别在于, 保留了 store 订阅
  public remount(containerSelector: string): void {
    // dom 都清除, 但 store 订阅保留
    this.shell?.destroy()
    this.viewport?.destroy()
    // 清空布局管理器
    this.layoutManager?.destroy()
    this.layoutManager = null 
    // 清理面板管理器
    this.sidePanelManager?.destroy()
    this.sidePanelManager = null 
    // 重置标记, 先用 any 大法顶上, 后续出问题再说
    this.shell = null as any 
    this.viewport = null as any 

    // 清理滚动停止定时器
    if (this.scrollStopTimer) {
      clearTimeout(this.scrollStopTimer)
    }
    // 重新挂载
    this.mount(containerSelector)
  }

  // 全部清空, dom + 状态 + 一切, 避免内存泄露
  public destroy() {
    this.unsubscribleStore?.()
    this.unsubscribleStore = null // 解绑 store 订阅
    this.shell?.destroy()
    this.viewport?.destroy()
    // 清空布局管理器
    this.layoutManager?.destroy()
    this.layoutManager = null 
    // 清理面板管理器
    this.sidePanelManager?.destroy()
    this.sidePanelManager = null 
    // 清空定时器
    if (this.scrollStopTimer) {
      clearTimeout(this.scrollStopTimer)
    }
  }


}
