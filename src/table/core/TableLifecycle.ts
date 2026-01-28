import type { IConfig, ITableQuery, IColumn } from "@/types";
import type { DataStrategy } from "@/table/data/DataStrategy";
import type { TableStore } from "@/table/state/createTableStore";
import type { ITableShell } from "@/table/TableShell";
import { mountTableShell } from "@/table/TableShell";
import { VirtualViewport } from "@/table/viewport/VirtualViewport";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { VirtualScroller } from "@/scroll/VirtualScroller";
import { ColumnManager } from "@/table/core/ColumnManager";
import { HeaderSortBinder } from "@/table/interaction/HeaderSortBinder";
import { LayoutManager } from "@/table/layout/LayoutManager";
import { SidePanelManager } from "@/table/panel/SidePanelManager";


/**
 * 表格声明周期管理器
 * 
 * 职责:
 * - 管理表格的初始化, 挂载, 销毁流程
 * - 管理核心组件的创建和依赖注入
 * - 统一生命周期钩子
 */
export class TableLifecycle {
  // 核心配置
  private config: IConfig
  private dataStrategy: DataStrategy 
  private store: TableStore 
  private originalColumns: IColumn[]

  // 核心组件
  public shell!: ITableShell
  public viewport!: VirtualViewport
  public renderer: DOMRenderer
  public scroller: VirtualScroller
  public columnManager!: ColumnManager
  public headerSortBinder: HeaderSortBinder
  public layoutManager: LayoutManager | null = null 
  public sidePanelManager: SidePanelManager | null = null 

  constructor(params: {
    config: IConfig,
    dataStrategy: DataStrategy,
    store: TableStore,
    originalColumns: IColumn[]
  }) {
    this.config = params.config
    this.dataStrategy = params.dataStrategy
    this.store = params.store
    this.originalColumns = params.originalColumns

    // 创建基础组件
    this.renderer = new DOMRenderer(this.config)
    this.scroller = new VirtualScroller(this.config)
    this.headerSortBinder = new HeaderSortBinder()
  }

  /**
   * 挂载表格 DOM 
   */
  public mount(params: {
    commonShellParams: any // mountTableShell 的一堆参数 
    containerEl: HTMLDivElement
    mode: 'client' | 'server'

  }): void {
    const { commonShellParams, containerEl, mode } = params

    // 1. 挂载表格外壳
    this.shell = mountTableShell({
      ...commonShellParams,
      container: containerEl
    })

    // 2. 创建 viewport 
    this.viewport = new VirtualViewport({
      config: this.config,
      dataStrategy: this.dataStrategy,
      renderer: this.renderer,
      scroller: this.scroller,
      scrollContainer: this.shell.scrollContainer,
      virtualContent: this.shell.virtualContent,
      onPageChange: (pageInfo) => {
        const mode = this.store.getState().data.mode
        if (mode === 'server') {
          const currentPage = this.store.getState().data.currentPage
          if (currentPage !== pageInfo.currentPage) {
            this.store.dispatch({ type: 'SET_CURRENT_PAGE', payload: { page: pageInfo.currentPage } })
          }
        }
      }
    })

    // 3. 创建 ColumnManager 
    this.columnManager = new ColumnManager(
      this.config,
      this.renderer,
      this.dataStrategy
    )

  }

  /**
   * 重建表格, 当列变化时
   */
  public rebuild(callbacks: {
    applyColumnsFromState: () => void 
    applyQuery: (query: ITableQuery) => Promise<void>
    getMountParams: () => { commonShellParams: any; containerEl: HTMLDivElement; mode: 'client' | 'server'  }

  }): void {
    // 1. 销毁旧组件
    this.shell?.destroy()
    this.viewport?.destroy()

    // 2. 应用最新列配置
    callbacks.applyColumnsFromState()

    // 3. 重新挂载
    const mountParams = callbacks.getMountParams()
    this.mount(mountParams)

    // 4. 重新应用数据状态
    const state = this.store.getState()
    this.shell.setSortIndicator(state.data.sort)

    const query: ITableQuery = {
      sortKey: state.data.sort?.key,
      sortDirection: state.data.sort?.direction,
      filterText: state.data.mode === 'client' ? state.data.clientFilterText : state.data.query.filterText,
      columnFilters: state.data.columnFilters
    }
    void callbacks.applyQuery(query)
  }

  /**
   * 销毁表格
   */
  public destroy(): void {
    this.shell?.destroy()
    this.viewport?.destroy()
    this.sidePanelManager?.destroy()
    this.layoutManager?.destroy()
  }

}