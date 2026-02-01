import { TableConfig } from '@/config/TableConfig'
import { DOMRenderer } from '@/dom/DOMRenderer'
import { VirtualScroller } from '@/scroll/VirtualScroller'
import type { IConfig, ITableQuery, IUserConfig, IColumn } from '@/types'
import { HeaderSortBinder } from '@/table/interaction/HeaderSortBinder'
import { VirtualViewport } from '@/table/viewport/VirtualViewport'
import type { ITableShell } from '@/table/TableShell'
import type { TableStore } from '@/table/state/createTableStore'
import type { TableAction, TableState } from '@/table/state/types'
import { assertUniqueColumnKeys } from '@/table/model/ColumnModel'
import { ColumnWidthStorage } from '@/utils/ColumnWidthStorage'
import { ColumnManager } from '@/table/core/ColumnManager'
import { PerformanceMonitor } from '@/utils/PerformanceMonitor'
import { LayoutManager } from '@/table/layout/LayoutManager'
import { SidePanelManager } from '@/table/panel/SidePanelManager'
import type { IPanelConfig } from '@/table/panel/IPanel'
import { ShellCallbacks } from '@/table/handlers/ShellCallbacks' // 回调
import { createColumnPanel } from '@/table/panel/panels/ColumnPanel'
import { 
  actionHandlers, COLUMN_EFFTECT_ACTIONS, DATA_EFFECT_ACTIONS, 
  STATE_ONLY_ACTIONS, 
  STRUCTURAL_EFFECT_ACTIONS } from '@/table/handlers/ActionHandlers'
import type { ActionContext } from '@/table/handlers/ActionHandlers'
import { RenderMethod, RenderProtocalValidator, RenderScenario } from '@/table/viewport/RenderProtocol'
import type { DataStrategy } from '@/table/data/DataStrategy'
import { TableLifecycle } from '@/table/core/TableLifecycle'
import { TableQueryCoordinator } from '@/table/core/TableQueryCoordinator'
import { TableStateSync } from '@/table/core/TableStateSync'
import type { InitResult } from '@/table/factory/TableInitializer'
import { initServerMode, initClientMode } from '@/table/factory/TableInitializer'
import { MountHelper } from '@/table/factory/TableMountHelper'


// 主协调者, 表格缝合怪;  只做调度, 不包含业务逻辑
export class VirtualTable {
  private config: IConfig // 内部用完整配置
  private shell!: ITableShell
  private mode: 'client' | 'server' = 'server' 
  private headerSortBinder = new HeaderSortBinder()
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

  // 异步初始化
  private async initializeAsync() {
    const isServerBootstrap = !this.config.initialData && typeof this.config.fetchPageData === 'function'

    try {
      assertUniqueColumnKeys(this.config.columns)
      this.originalColumns = [...this.config.columns]

      if (isServerBootstrap) {
        // ==== Server 模式初始化 ====
        const result = initServerMode(this.config, this.originalColumns)
        this.initComponents(result)
        this.mount()
        this.shell.setSortIndicator(this.store.getState().data.sort)
        this.config.onModeChange?.(this.mode)
        this.markAsReady()
        this.bootstrapServerData()  // 从后台加载数据

      } else {
        // ==== Client 模式初始化 ====
        const result = await initClientMode(this.config, this.originalColumns)
        this.initComponents(result)
        this.config.totalRows = this.dataStrategy.getTotalRows()
        this.mount()
        this.shell.setSortIndicator(this.store.getState().data.sort)
        this.config.onModeChange?.(this.mode)
        this.subscribeStore()
        this.markAsReady()
      }
      
    } catch (err) {
      console.warn('[VirtualTable.initializeAsync] faild: ', err)
      throw err 
    }
  }

  /**
   * 初始化组件引用
   */
  private initComponents(result: InitResult) {
    this.dataStrategy = result.dataStrategy
    this.mode = result.mode
    this.store = result.store
    this.stateSync = result.stateSync
    this.lifecycle = result.lifecycle
    // 同步组件引用
    this.renderer = this.lifecycle.renderer
    this.scroller = this.lifecycle.scroller
    this.headerSortBinder = this.lifecycle.headerSortBinder
  }

  /**
   * 订阅 store
   */
  private subscribeStore() {
    this.unsubscribleStore?.()
    this.unsubscribleStore = this.store.subscribe((next, prev, action) => {
      this.handleStateChange(next, prev, action)
    })
  }

  /**
   * 标记为 ready
   */
  private markAsReady() {
    this.isReady = true 
    const pending = this.pendingActions
    this.pendingActions = []
    pending.forEach(action => this.store.dispatch(action))
    this.resolveReady?.()
    this.resolveReady = null 
  }

  /** 
   * Server 模式下从后台加载数据
   */
  private bootstrapServerData() {
    void this.dataStrategy.bootstrap().then(({ totalRows: realTotal }) => {

      const newTotal = typeof realTotal === 'number' ? realTotal : 0
      const needRebuild = newTotal !== this.config.totalRows

      this.config.totalRows = newTotal
      this.store.dispatch({ type: 'SET_TOTAL_ROWS', payload: { totalRows: newTotal } })

      if (needRebuild) {
        this.scroller = new VirtualScroller(this.config)
        this.viewport.setScroller(this.scroller)
        this.shell.setScrollHeight(this.scroller)
      }

      this.viewport.updateVisibleRows() // 更新可视区, 而非 refresh 哦!
      this.updateStatusBar()
      
      // 要表格数据加载完后, 才订阅 store 和 同步更新 summary 数据
      this.subscribeStore() 
      if (this.config.showSummary) {
        this.refreshSummary()
      }
    })
  }

  // 挂载 shell + viewport (由 initializeAsync 内部调用)
  private mount(containerSelector?: string): void {
    // 防止重复挂载
    if (this.shell) {
      console.warn('[VirtaulTable] 检测到重复挂载,销毁旧实例')
      this.remount(containerSelector!)
      this.destroy()
    }

    // 使用 MountHelper 挂载表格
    const result = MountHelper.mount({
      config: this.config,
      store: this.store,
      mode: this.mode,
      originalColumns: this.originalColumns,
      widthStorage: this.widthStorage,
      renderer: this.renderer,
      headerSortBinder: this.headerSortBinder,
      lifecycle: this.lifecycle,
      getClientFilterOptions: (key: string) => this.getClientFilterOptions(key),
      loadSummaryData: (summaryRow: HTMLDivElement) => this.loadSummaryData(summaryRow),
      togglePanel: (panelId: string) => {
        if (this.sidePanelManager) {
          if (panelId === 'columns') {
            // 列管理面板, 需要将 原始列配置传过去
            this.sidePanelManager.togglePanel(panelId, this.originalColumns)
          } else {
            this.sidePanelManager.togglePanel(panelId)
          }
        }
      }
    }, containerSelector)

    // 同步挂载结果
    this.layoutManager = result.layoutManager
    this.sidePanelManager = result.sidePanelManager
    // 从 lifecycle 获取组件引用
    this.shell = this.lifecycle.shell
    this.viewport = this.lifecycle.viewport
    this.columnManager = this.lifecycle.columnManager
    // 创建 TableQueryCoordinator
    this.queryCoordinator = new TableQueryCoordinator({
      config: this.config,
      dataStrategy: this.dataStrategy,
      viewport: this.viewport,
      shell: this.shell,
      renderer: this.renderer,
      store: this.store,
      getScroller: () => this.scroller,
      setScroller: (scroller: VirtualScroller) => { this.scroller = scroller }
    })

    // 首次挂载后, 就立刻同步一次滚动高度
    this.shell.setScrollHeight(this.scroller)

    // 滚动监听由 shell 统一绑定
    this.shell.bindScroll(() => {
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

    // 关键!: Client 模式下需要立即更新可视区, 否则无数据
    if (this.mode === 'client') {
      this.viewport.updateVisibleRows()
    }

    // 首次挂载后, 立即更新一次总结行数据, 针对 client 模式
    if (this.config.showSummary && this.mode === 'client') {
      this.refreshSummary()
    }
  }

  // 更新表格底部状态栏数据
  private updateStatusBar() {
    // 委托给 queryCoordinator
    this.queryCoordinator.updateStatusBar()
  }

  /** 加载总结行数据 (同步) */
  private loadSummaryData(summaryRow: HTMLDivElement): void {
    // 没配置显示就不处理
    if (!this.config.fetchSummaryData) return 

    const summaryData = this.dataStrategy.getSummary()
    if (summaryData) {
      this.renderer.updateSummaryRow(summaryRow, summaryData)
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
      updateVisibleRows: () => this.viewport.updateVisibleRows(), 
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
        const savedWidth = savedColumnWidths[col.key]
        if (savedWidth && savedWidth > 0) {
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


  /** 对外暴露当前表格 state 状态, 后续做 vue 封装会很需要 */
  public getState() {
    return this.store.getState()
  }

  /** 方便 demo 使用 (减少导出 await) */
  public onReady(cb: () => void) {
    this.ready.then(cb).catch(console.warn)
  }

  /** 对外暴露 dispatch, 后续拽列, 原生 UI 都走它 */
  public dispatch(action: TableAction) {
    // 未初始完成时, 不直接 dispatch, 先排队, 避免 store 为 undefined
    if (!this.isReady || !this.store) {
      this.pendingActions.push(action)
      return 
    }
    return this.store.dispatch(action)
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
