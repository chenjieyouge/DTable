import { TableConfig } from '@/config/TableConfig'
import { DataManager } from '@/data/DataManager'
import { DOMRenderer } from '@/dom/DOMRenderer'
import { VirtualScroller } from '@/scroll/VirtualScroller'
import type { IConfig, ITableQuery, IUserConfig } from '@/types'
import { SortState } from '@/table/core/SortState'
import { HeaderSortBinder } from '@/table/interaction/HeaderSortBinder'
import { bootstrapTable } from '@/table/data/bootstrapTable'
import { VirtualViewport } from '@/table/viewport/VirtualViewport'
import type { ITableShell } from '@/table/TableShell'
import { mountTableShell } from '@/table/TableShell'

import type { TableStore } from '@/table/state/createTableStore'
import type { TableAction, TableState } from '@/table/state/types'
import type { IColumn } from '@/types'
import { createTableStore } from '@/table/state/createTableStore'
import { assertUniqueColumnKeys, resolveColumns } from '@/table/model/ColumnModel'


// 主协调者, 表格缝合怪;  只做调度, 不包含业务逻辑
export class VirtualTable {
  private config: IConfig // 内部用完整配置

  private shell!: ITableShell

  private mode: 'client' | 'server' = 'server' // 走全量还是走分页
  private sortState: SortState = new SortState()
  private headerSortBinder = new HeaderSortBinder()
  private serverQuery: ITableQuery = { filterText: '' } // 默认 server 空筛选
  private clientFilterText = '' // client 下清空筛选排序后恢复原样
  private viewport!: VirtualViewport

  private dataManager: DataManager
  private renderer: DOMRenderer
  private scroller: VirtualScroller

  private store!: TableStore 
  private originalColumns!: IColumn[]
  private unsubscribleStore: (() => void) | null = null 

  constructor(userConfig: IUserConfig) {
    // 初始化配置 (此时的 totalRows 是默认值, 后续会被覆盖)
    const tableConfig = new TableConfig(userConfig)
    this.config = tableConfig.getAll()

    this.dataManager = new DataManager(this.config)
    this.renderer = new DOMRenderer(this.config)
    this.scroller = new VirtualScroller(this.config)

    // 启动异步初始化流程
    this.initializeAsync()
  }

  // 对外暴露当前表格 state 状态, 后续做 vue 封装会很需要
  public getState() {
    return this.store.getState()
  }

  // 对外暴露 dispatch, 后续拽列, 原生 UI 都走它
  public dispatch(action: TableAction) {
    return this.store.dispatch(action)
  }

  // 异步初始化
  private async initializeAsync() {
    const { mode, totalRows } = await bootstrapTable(this.config,this.dataManager)
    this.mode = mode
    this.config.totalRows = totalRows
    // 列 key 必须唯一, 尽早检验, 避免后续列顺序/拖拽状态全乱
    assertUniqueColumnKeys(this.config.columns)
    // 保留用户原始列配置, ColumnModel 永远基于它来解析
    this.originalColumns = [...this.config.columns]
    // 创建 store (里程碑A: 先非受控模式)
    this.store = createTableStore({
      columns: this.originalColumns,
      mode: this.mode,
      frozenCount: this.config.frozenColumns
    })

    // 订阅 state 变化 -> 驱动副作用 (排序/筛选/列变化重建等)
    this.unsubscribleStore?.()
    this.unsubscribleStore = this.store.subscribe((next, prev, action) => {
      this.handleStateChange(next, prev, action)
    })

    // 首次 mount 前, 将 state 解析出来的列, 应用回 config
    this.applyColumnsFromState()
    // 挂载 DOM, 会绑定表头点击事件, 滚动事件等
    this.mount()
    // 首次将排序指示器对齐到 state, 默认 null 
    this.shell.setSortIndicator(this.store.getState().data.sort)
    this.config.onModeChange?.(this.mode)
  }

  // 挂载 shell + viewport (暴力 rebuild 会重复调用它)
  public mount() {
    this.shell = mountTableShell({
      config: this.config,
      renderer: this.renderer,
      headerSortBinder: this.headerSortBinder,
      // 表头点击排序, 统一走 dispatch
      onToggleSort: (key) => {
        this.store.dispatch({ type: 'SORT_TOGGLE', payload: { key }})
      },
      onNeedLoadSummary: (summaryRow) => {
        this.loadSummaryData(summaryRow).catch(console.warn)
      }
    })

    // 首次挂载后, 就立刻同步一次滚动高度
    this.shell.setScrollHeight(this.scroller)
    // 创建 viewport: 将 "可视区更新/骨架行/数据渲染" 的职责下放
    this.viewport = new VirtualViewport({
      config: this.config,
      dataManager: this.dataManager,
      renderer: this.renderer,
      scroller: this.scroller,
      scrollContainer: this.shell.scrollContainer,
      virtualContent: this.shell.virtualContent
    })

    // 滚动监听由 shell 统一绑定, 而 VirtualTable 只提供滚动后做什么
    this.shell.bindScroll(() => {
      this.viewport.updateVisibleRows()
    })
    this.viewport.updateVisibleRows()
  }

  // 加载总结行数据 (传参)
  private async loadSummaryData(summaryRow: HTMLDivElement) {
    const summaryData = await this.dataManager.getSummaryData()
    if (summaryData) {
      // 值更新传入的那一行, 不再由 VirtualTable 保存 dom 引用
      this.renderer.updateSummaryRow(summaryRow, summaryData)
    }
  }

  // 未来因拓展排序, 筛选,刷新等功能, 则需更新总计行数据
  public async refreshSummary() {
    if (!this.config.showSummary) return 
    const row = this.shell?.summaryRow
    if (!row) return 
    await this.loadSummaryData(row)
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
    const state = this.store.getState()
    const resolved = resolveColumns({ originalColumns: this.originalColumns, state})
    // 让后续 DOMRenderer/Viewport 都使用新列定义
    this.config.columns = resolved 
    // 冻结列仍沿用我现有实现的: 前 N 列冻结
    this.config.frozenColumns = state.columns.frozenCount
  }

  // state 变化后的统一入口 (里程碑A的 "表格骨架核心")
  private handleStateChange(next: TableState, prev: TableState, action: TableAction) {
    // 列相关动作 -> 暴力重建 (最稳, 但性能一般)
    if (
      action.type === 'COLUMN_ORDER_SET' || 
      action.type === 'COLUMN_WIDTH_SET' || 
      action.type === 'FROZEN_COUNT_SET'
    ) {
      this.rebuild()
      return 
    }
    // 排序指示器永远以 state 为准
    this.shell?.setSortIndicator(this.store.getState().data.sort)
    // 排序/筛选变化 -> 根据模式触发数据侧更新
    const state = this.store.getState()
    if (state.data.mode === 'client') {
      void this.applyClientState(state)
    } else {
      // server 模式 
      void this.applyServerQuery(state.data.query).then(() => {
        // server 筛选/排序后, summary 也可能会变
        void this.refreshSummary()
      })
    }
  }


  // client 模式下, 将 state 应用到 DataManager + Scroller + Viewport
  private async applyClientState(state: TableState) {
    const filterText: string = state.data.clientFilterText ?? ''
    const sort = state.data.sort 
    // 先恢复 原始顺序 + 应用筛选, 保证可回到自然顺序
    this.clientFilterText = filterText
    this.dataManager.resetClientOrder(filterText) // 恢复为原始顺序,考虑了筛选动作
    // 若有排序, 则再处理
    if (sort) {
      this.dataManager.sortData(sort.key, sort.direction)
    }
    // 监控 totalRow 变化时, 需要重建 scroller 
    this.config.totalRows = this.dataManager.getFullDataLength()
    this.scroller = new VirtualScroller(this.config)
    this.viewport.setScroller(this.scroller)
    // 同步滚动高度 + 刷新可视区
    this.shell.setScrollHeight(this.scroller)
    this.viewport.refresh()
    await this.refreshSummary() // 总结行也可能刷新
  }

  // 暴力重建 (列变化时用), 最稳但性能不行, 后续里程碑在优化为局部更新
  private rebuild() {
    // 先销毁旧 DOM 和 旧 viewport
    this.shell?.destroy()
    this.viewport?.destroy()
    // 重写挂载前, 现将最新列状态, 写回 config (顺序/宽度/冻结列等)
    this.applyColumnsFromState()
    // 重新挂载
    this.mount()
    // 重建后, 将 UI 与数据状态重新对齐
    const state = this.store.getState()
    this.shell.setSortIndicator(state.data.sort)

    if (state.data.mode === 'client') {
      void this.applyClientState(state)
    } else {
      void this.applyServerQuery(state.data.query).then(() => {
        void this.refreshSummary()
      })
    }
  }

  // server 模式下的筛选 
  // 更新 query -> 清缓存 -> 拉取第一页 -> 更新 totalRows \
  // -> 重建 VirtualScroller -> 通知 viewport.setScroller 和 refresh table
  private async applyServerQuery(next: ITableQuery) {
    this.serverQuery = {
      sortKey: next.sortKey,
      sortDirection: next.sortDirection,
      filterText: next.filterText ?? ""
    }
    // 更新 DataManager 的 query, 缓存也会自动清除
    this.dataManager.setQuery(this.serverQuery)
    // 筛选排序后回到顶部, 避免当前滚动位置超出 新 totalRows
    this.shell.scrollContainer.scrollTop = 0
    // 主动来取第 0 页, 让 totalRows 先有值并缓存 page0
    await this.dataManager.getPageData(0)
    const totalRows = this.dataManager.getServerTotalRows()
    if (typeof totalRows === 'number') {
      this.config.totalRows = totalRows
    }
    // totalRows 变化后必须重建 scroller, 否则滚动高度不准
    this.scroller = new VirtualScroller(this.config)
    this.viewport.setScroller(this.scroller)
    // 一定要记得重设滚动容器的高
    this.shell.setScrollHeight(this.scroller)
    // 最后再刷新可视区
    this.viewport.refresh()
  }


  // 清空, 避免内存泄露
  public destroy() {
    this.unsubscribleStore?.()
    this.unsubscribleStore = null // 解绑 store 订阅
    this.shell?.destroy()
    this.viewport?.destroy()
  }
}
