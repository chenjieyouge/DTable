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
import { ColumnManagerBinder } from "@/table/interaction/ColumnManagerBinder";


export interface ITableShell {
  scrollContainer: HTMLDivElement
  virtualContent: HTMLDivElement
  summaryRow?: HTMLDivElement
  headerRow: HTMLDivElement // 缓存表头引用

  setScrollHeight(scroller: VirtualScroller): void // 统一更新滚动高度
  setSortIndicator(sort: { key: string, direction: 'asc' | 'desc' } | null): void // 统一控制排序箭头
  bindScroll(onRafScroll: () => void): void // 绑定滚动, 内部 raf, 外部只传要做什么
  destroy(): void // 释放所有事件, 清空 dom 
  updateColumnWidths(columns: IConfig['columns']): void  // 增量更新列宽 (css 变量)

}

export function mountTableShell(params: {
  config: IConfig,
  renderer: DOMRenderer 
  headerSortBinder: HeaderSortBinder
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

}): ITableShell {

  const { 
    config, 
    renderer, 
    headerSortBinder, 
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
    // 列管理相关
    getAllColumns,
    getHiddenKeys,
    onColumnToggle,
    onShowAllColumns,
    onHideAllColumns,
    onResetColumns,

   } = params


  // 1. 获取用户指定的容器
  const userContainer = getContainer(config.container)
  userContainer.innerHTML = ''

  // 2. 创建 Portal 容器 (包裹层), 用来给一些功能做定位父元素参考
  const portalContainer = document.createElement('div')
  portalContainer.className = 'table-portal-container'
  portalContainer.style.position = 'relative'
  portalContainer.style.width = `${config.tableWidth}px`
  portalContainer.style.height = `${config.tableHeight}px`

  // 3.创建滚动容器 (原来的 scrollContainer)
  const scrollContainer = document.createElement('div')
  scrollContainer.className = 'table-container'
  scrollContainer.style.width = '100%'
  scrollContainer.style.height = '100%'
  applyContainerStyles(scrollContainer, config)

  // 4. 挂载关系: userContainer -> portalContainer -> scrollContainer
  portalContainer.appendChild(scrollContainer)
  userContainer.appendChild(portalContainer)

  // 创建表格列管理按钮, 横向3个点, toto: 小齿轮(右上角)
  const columnManagerBtn = document.createElement('button')
  columnManagerBtn.className = 'column-manager-trigger'
  columnManagerBtn.innerHTML = `
   <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 4a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM8 15a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" transform="rotate(90 8 8)"/>
  </svg>
  `
  columnManagerBtn.title = '列管理'
  // 挂载到 portalContainer 就不会跟随滚动了, 就固定住啦!
  portalContainer.appendChild(columnManagerBtn)

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
      headerRow,
      onFilterChange: onColumnFilterChange,
      getFilterOptions,
      getCurrentFilter,
    })
  }

  // 绑定列菜单弹窗
  const menuBinder = new ColumnMenuBinder()
  if (getCurrentSort && onMenuSort) {
    menuBinder.bind({
      scrollContainer,
      headerRow,
      columns: config.columns,
      getCurrentSort,
      onSort: onMenuSort
    })
  }

  // 绑定整表宽度拖拽
  const tableResizeBinder = new TableResizeBinder()
  if (onTableResizeEnd) {
    tableResizeBinder.bind({
      scrollContainer,
      portalContainer, 
      onResizeEnd: onTableResizeEnd,
    })
  }

  // 绑定列管理面板
  const columnManagerBinder = new ColumnManagerBinder()
  if (getAllColumns && getHiddenKeys && onColumnToggle) {
    columnManagerBinder.bind({
      container: portalContainer,  // 传个相对定位不动的容器去参考位置
      triggerBtn: columnManagerBtn,
      getAllColumns,
      getHiddenKeys,
      onToggle: onColumnToggle,
      onShowAll: onShowAllColumns || (() => {}),
      onHideAll: onHideAllColumns || (() => {}),
      onReset: onResetColumns || (() => {})
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
    updateColumnWidths(columns) {
      // 只更新变量, 不重建 DOM, 这个拖拽宽度问题引发了我一系列的崩盘, 为了用户体验值了!
      let leftOffset = 0
      columns.forEach((col, index) => {
        // 设置列宽 css 变量
        tableWrapper.style.setProperty(`--col-${col.key}-width`, `${col.width}px`)
        // 设置冻结列偏移量 css 变量
        if (index < config.frozenColumns) {
          tableWrapper.style.setProperty(`--col-${col.key}-left`, `${leftOffset}px`)
          leftOffset += col.width
        }
      }) 
      // 更新表格总宽度
      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0)
      tableWrapper.style.width = `${totalWidth}px`

      // 使用 css 变量后, 只需更新一次样式类即可
      if (config.frozenColumns > 0) {
        requestAnimationFrame(() => {
          // 使用缓存 dom 引用, 不重复查询
          if (headerRow) renderer.applyFrozenStyles(headerRow)
          if (summaryRow) renderer.applyFrozenStyles(summaryRow)

          const dataRows = virtualContent.querySelectorAll<HTMLDivElement>('.virtual-row')
          dataRows.forEach(row => renderer.applyFrozenStyles(row))
        })
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
      columnManagerBinder.unbind() // 解绑整表列管理面板
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
    container.style.setProperty(`--col-${col.key}-width`, `${col.width}px`)
  }
}

// 辅助函数-创建表格容器 wrapper
function createTableWrapper(config: IConfig): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  const totalWidth = config.columns.reduce((sum, col) => sum + col.width, 0)
  wrapper.style.width = `${totalWidth}px`
  return wrapper
}
