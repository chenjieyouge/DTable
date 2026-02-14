import type { IConfig, ColumnFilterValue, IColumn } from "@/types";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { VirtualScroller } from "@/scroll/VirtualScroller";
import { HeaderSortBinder } from "@/table/interaction/HeaderSortBinder";
import { ScrollBinder } from "@/table/interaction/ScrollBinder";

import { SortIndicatorView } from "@/table/interaction/SortIndicatorView";
import { ColumnResizeBinder } from "@/table/interaction/ColumnResizeBinder";
import { ColumnDragBinder } from "@/table/interaction/ColumnDragBinder";
import { ColumnFilterBinder } from "@/table/interaction/ColumnFilterBinder";
import { TableResizeBinder } from "@/table/interaction/TableResizeBinder";
import { ColumnMenuBinder } from "@/table/interaction/ColumnMenuBinder";


// 全局弹窗管理器, 弹窗之间互斥出现
class PopupManager {
  private static activePopups: Array<{ close: () => void }> = []
  
  static register(popup: { close: () => void }) {
    this.activePopups.push(popup)
  }

  static closeAll() {
    this.activePopups.forEach(popup => popup.close())
  }

  static unregister(popup: { close: () => void }) {
    const index = this.activePopups.indexOf(popup)
    if (index > -1) {
      this.activePopups.splice(index, 1)
    }
  }
}

export interface ITableShell {
  scrollContainer: HTMLDivElement
  virtualContent: HTMLDivElement
  summaryRow?: HTMLDivElement
  headerRow: HTMLDivElement // 缓存表头引用

  setScrollHeight(scroller: VirtualScroller): void // 统一更新滚动高度
  // 统一控制排序箭头
  setSortIndicator(sort: { key: string, direction: 'asc' | 'desc' } | null): void 
  bindScroll(onRafScroll: () => void): void // 绑定滚动, 内部 raf, 外部只传要做什么
  // 增量更新列宽 (css 变量), 顺带将 dataRows 也捎过来呗
  updateColumnWidths(columns: IConfig['columns'], dataRows?: HTMLDivElement[]): void  
  destroy(): void
}

export function mountTableShell(params: {
  config: IConfig,
  renderer: DOMRenderer 
  headerSortBinder: HeaderSortBinder
  container?: HTMLDivElement | string 

  onToggleSort: (key: string) => void 
  onNeedLoadSummary?: (summaryRow: HTMLDivElement) => void

  onColumnResizeEnd?: (key: string, width: number) => void  // 列宽拖拽结束后回调
  onColumnOrderChange?: (order: string[]) => void    // 拖拽列顺序后回调

  onColumnFilterChange?: (key: string, filter: ColumnFilterValue | null ) => void  // 列筛选值回调
  getFilterOptions?: (key: string) => Promise<string[]> // 筛选配置
  getCurrentFilter?: (key: string) => ColumnFilterValue | undefined // 列当前筛选值

  onTableResizeEnd?: (newWidth: number) => void // 表格拖拽后的新总宽度
  // 列菜单相关回调
  getCurrentSort?: () => { key: string; direction: 'asc' | 'desc' } | null 
  onMenuSort?: (key: string, direction: 'asc' | 'desc' | null) => void 
  // 列管理相关回调
  getAllColumns?: () => IColumn[]
  getHiddenKeys?: () => string[]
  onColumnToggle?: (key: string, visible: boolean) => void 
  onShowAllColumns?: () => void 
  onHideAllColumns?: () => void 
  onResetColumns?: () => void 
  onToggleSidePanel?: (panelId: string) => void

}): ITableShell {

  const { 
    config, 
    renderer, 
    headerSortBinder, 
    container,
    onToggleSort, 
    onNeedLoadSummary, 
    onColumnResizeEnd, 
    onColumnOrderChange,
    onColumnFilterChange,
    getFilterOptions,
    getCurrentFilter,
    onTableResizeEnd,
    getCurrentSort,
    onMenuSort,

   } = params

  // 1. 处理最外层大容器参数, 优先使用传入的 container 
  const containerEl = container 
   ? (typeof container === 'string'
      ? document.querySelector<HTMLDivElement>(container)
      : container)
   : (typeof config.container === 'string'
     ? document.querySelector<HTMLDivElement>(config.container)
     : config.container
   )

   if (!containerEl) {
    throw new Error(`[TableShell] 容器未找到: ${container || config.container}`)
   }

  containerEl.innerHTML = ''
  // 2. 创建 Portal 容器 (包裹层), 用来给一些功能做定位父元素参考
  const portalContainer = document.createElement('div')
  portalContainer.className = 'table-portal-container'
  portalContainer.style.position = 'relative'

  portalContainer.style.height = `${config.tableHeight}px`
  // 支持 100% 宽度或固定数值
  if (typeof config.tableWidth === 'string') {
    portalContainer.style.width = config.tableWidth // '100%'
  } else {
    portalContainer.style.width = `${config.tableWidth}px`
  }
  // 3.创建滚动容器 (原来的 scrollContainer)
  const scrollContainer = document.createElement('div')
  scrollContainer.className = 'table-container'
  scrollContainer.style.width = '100%'
  scrollContainer.style.height = '100%'
  applyContainerStyles(scrollContainer, config)
  // 4. 挂载关系: userContainer -> portalContainer -> scrollContainer
  portalContainer.appendChild(scrollContainer)
  containerEl.appendChild(portalContainer)

  // 创建底部状态栏 (可选)
  let statusBar: HTMLDivElement | null = null 
  if (config.showStatusBar !== false) {
    statusBar = document.createElement('div')
    statusBar.className = 'table-status-bar'
    // client 模式: 显示总行数和已选
    // server 模式: 显示总行数, 当前页面, 已选
    // 使用 tableId 生成唯一 ID, 避免多表格冲突
    const tableId = config.tableId || 'default'
    statusBar.innerHTML = `
      <div class="table-status-bar-item">
        总行数: <strong id="table-total-rows-${tableId}">0</strong>
      </div>
      <div class="table-status-bar-item" id="table-page-indicator-${tableId}" style="display: none;">
      当前页: 第 <strong id="table-current-page-${tableId}">1</strong> 页 (共 <strong id="table-total-pages-${tableId}">1</strong> 页)
      </div>
      <div class="table-status-bar-item">
        已选: <strong id="table-selected-rows-${tableId}">0</strong>
      </div>
    `
  }
  if (statusBar) {
    containerEl.appendChild(statusBar) // 注意是挂载到 containerEl 哦!
  }

  // 2. 表格包裹层 wrapper -> header
  const tableWrapper = createTableWrapper(config)
  const headerRow = renderer.createHeaderRow()
  // 绑定排序按钮
  headerSortBinder.bind(headerRow, (key) => onToggleSort(key))

  // 绑定列宽拖拽
  const resizeBinder = new ColumnResizeBinder()
  if (onColumnResizeEnd) {
    resizeBinder.bind({
      scrollContainer,
      headerRow,
      onResizeEnd: onColumnResizeEnd,
      minWidth: 50, // 字段宽度拖拽后, 不能低于 30px, 看不清了
      frozenColumnCount: config.frozenColumns, // 传入冻结前 N 列
    })
  }

  // 绑定列字段顺序拖拽, 冻结列不参与
  const dragBinder = new ColumnDragBinder()
  if (onColumnOrderChange) {
    dragBinder.bind({
      scrollContainer,
      headerRow,
      onOrderChange: onColumnOrderChange,
      frozenColumnCount: config.frozenColumns, // 传入冻结前 N 列
    })
  }

  // 绑定列值筛选下来弹窗
  const filterBinder = new ColumnFilterBinder()
  if (onColumnFilterChange && getFilterOptions && getCurrentFilter) {
    filterBinder.bind({
      scrollContainer,
      portalContainer,
      headerRow,
      onFilterChange: onColumnFilterChange,
      getFilterOptions,
      getCurrentFilter,
      onBeforeOpen: () => PopupManager.closeAll() // 打开前先关闭所有弹窗
    })
  }

  // 绑定列菜单弹窗
  const menuBinder = new ColumnMenuBinder()
  if (getCurrentSort && onMenuSort) {
    menuBinder.bind({
      scrollContainer,
      portalContainer,
      headerRow,
      columns: config.columns,
      getCurrentSort,
      onSort: onMenuSort,
      onBeforeOpen: () => PopupManager.closeAll() // 打开前先关闭所有弹窗
    })
  }

  // 注册弹窗到管理器
  PopupManager.register({ close: () => filterBinder.closePopup() })
  PopupManager.register({ close: () => menuBinder.closeMenu() })

  // 绑定整表宽度拖拽
  const tableResizeBinder = new TableResizeBinder()
  if (onTableResizeEnd) {
    const layoutContainer = scrollContainer.closest<HTMLDivElement>('.table-layout-container')!
    tableResizeBinder.bind({
      scrollContainer,
      portalContainer, 
      layoutContainer,
      onResizeEnd: onTableResizeEnd,
    })
  }

  // toto: 更多列功能添加
  tableWrapper.appendChild(headerRow)

  // 3. 总结行
  let summaryRow: HTMLDivElement | undefined
  if (config.showSummary) {
    summaryRow = renderer.createSummaryRow()
    tableWrapper.appendChild(summaryRow)
    // summary 数据来自 DataManager, 因此要异步获取数据, 回填 VirtualTable
    onNeedLoadSummary?.(summaryRow)
  }

  // 4. 数据容器 -> 滚动容器;  dataContainer -> virtualContainer
  const dataContainer = document.createElement('div')
  dataContainer.className = 'data-container'
  const virtualContent = document.createElement('div')
  virtualContent.className = 'virtual-content'

  // 挂载 scrollContaint -> wrapper -> header / dataContainer -> virtaulContent
  dataContainer.appendChild(virtualContent)
  tableWrapper.appendChild(dataContainer)
  scrollContainer.appendChild(tableWrapper)

  // 给大容器绑定滚动事件
  const scrollBinder = new ScrollBinder()
  const sortIndicatorView = new SortIndicatorView(scrollContainer)

  return {
    scrollContainer,
    virtualContent,
    summaryRow,
    headerRow,  // 对外暴露 headerRow 引用

    setScrollHeight(scroller: VirtualScroller) {
      dataContainer.style.height = `${scroller.getActualScrollHeight()}px`
    },
    setSortIndicator(sort) {
      sortIndicatorView.set(sort)
    },
    bindScroll(onRafScroll: () => void) {
      scrollBinder.bind(scrollContainer, onRafScroll)
    },
    updateColumnWidths(columns, dataRows) {
      let leftOffset = 0
      columns.forEach((col, index) => {
        // 确保 width 存在, 其实在 TableConfig 中已经计算过了
        const width = col.width || 100
        // 设置列宽 css 变量
        tableWrapper.style.setProperty(`--col-${col.key}-width`, `${width}px`)
        // 设置冻结列偏移量 css 变量
        if (index < config.frozenColumns) {
          tableWrapper.style.setProperty(`--col-${col.key}-left`, `${leftOffset}px`)
          leftOffset += width
        }
      }) 
      // 更新表格总宽度
      const totalWidth = columns.reduce((sum, col) => sum + (col.width || 100), 0)
      // 若 tableWidth 是 '100%', 则保持 100%
      if (typeof config.tableWidth === 'string') {
        tableWrapper.style.width = '100%'
        tableWrapper.style.minWidth = `${totalWidth}px`

      } else {
        tableWrapper.style.width = `${totalWidth}px`
      }
      
      // 使用 css 变量后, 只需更新一次样式类即可
      if (config.frozenColumns > 0) {
        // 直接同步执行更新, 不用异步 requestAnimationFrame, 避免页面闪烁
        if (headerRow) renderer.applyFrozenStyles(headerRow)
        if (summaryRow) renderer.applyFrozenStyles(summaryRow)
        // 使用从 VirtualTable 中捎带过来的 dataRows, 若没有则查询兜底呗
        // const dataRows = virtualContent.querySelectorAll<HTMLDivElement>('.virtual-row')
        const rows = dataRows!
        rows.forEach(row => renderer.applyFrozenStyles(row))
      }
    },
    // 其他更多回调函数拓展...


    // 清理方法放最后来, 不然总是找不到在哪!
    destroy() {
      headerSortBinder.unbind(headerRow) // 清理表头事件
      scrollBinder.unbind(scrollContainer) // 清理滚动事件
      scrollContainer.innerHTML = '' // 清理容器
      resizeBinder.unbind(headerRow) // 释放列宽拖拽事件
      dragBinder.unbind(headerRow) // 释放列拖拽改顺序字段
      filterBinder.unbind()  // 释放列值筛选
      tableResizeBinder.unbind() // 释放整表宽度拖拽事件
      menuBinder.unbind() // 解绑列菜单
    }
  }
}

// 辅助函数-获取大容器
function getContainer(selector: string): HTMLDivElement {
  const el = document.querySelector(selector)
  if (!el) throw new Error(`Container ${selector} not found`)
  return el as HTMLDivElement
}

// 辅助函数-给大容器, 注入 css 变量
function applyContainerStyles(container: HTMLDivElement, config: IConfig) {
  container.style.setProperty('--header-height', `${config.headerHeight}px`)
  container.style.setProperty('--summary-height', `${config.summaryHeight}px`)
  container.style.setProperty('--row-height', `${config.rowHeight}px`)
  // 给每列都写入 css 变量, 为后续 cell 宽度响应式更新
  for (const col of config.columns) {
    const width = col.width || 100
    container.style.setProperty(`--col-${col.key}-width`, `${width}px`)
  }
}

// 辅助函数-创建表格容器 wrapper
function createTableWrapper(config: IConfig): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  const totalWidth = config.columns.reduce((sum, col) => sum + (col.width || 0), 0)

  if (typeof config.tableWidth === 'string') {
    wrapper.style.width = '100%'
    wrapper.style.minWidth = `${totalWidth}px` // 最小宽度为列宽总和

  } else {
    wrapper.style.width = `${totalWidth}px`
  }

  return wrapper
}
