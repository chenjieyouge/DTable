import type { IConfig, ColumnFilterValue } from "@/types";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { VirtualScroller } from "@/scroll/VirtualScroller";
import { HeaderSortBinder } from "@/table/interaction/HeaderSortBinder";
import { ScrollBinder } from "@/table/interaction/ScrollBinder";

import { SortIndicatorView } from "@/table/interaction/SortIndicatorView";
import { ColumnResizeBinder } from "@/table/interaction/ColumnResizeBinder";
import { ColumnDragBinder } from "@/table/interaction/ColumnDragBinder";
import { ColumnFilterBinder } from "@/table/interaction/ColumnFilterBinder";

import { TableResizeBinder } from "@/table/interaction/TableResizeBinder";


export interface ITableShell {
  scrollContainer: HTMLDivElement
  virtualContent: HTMLDivElement
  summaryRow?: HTMLDivElement

  setScrollHeight(scroller: VirtualScroller): void // 统一更新滚动高度
  setSortIndicator(sort: { key: string, direction: 'asc' | 'desc' } | null): void // 统一控制排序箭头
  bindScroll(onRafScroll: () => void): void // 绑定滚动, 内部 raf, 外部只传要做什么
  destroy(): void // 释放所有事件, 清空 dom 

  updateColumnWidths(columns: IConfig['columns']): void  // 增量更新列宽 (css 变量)
  updateColumnOrder(columns: IConfig['columns']): void  // 增量更新列顺序 (dom 重排)

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
   } = params


  // 1. 创建大容器 scrollContainer
  const scrollContainer = getContainer(config.container)
  // 设置大容器的固定宽高, 样式等
  scrollContainer.className = 'table-container'
  scrollContainer.innerHTML = ''
  scrollContainer.style.width = `${config.tableWidth}px`
  scrollContainer.style.height = `${config.tableHeight}px`
  applyContainerStyles(scrollContainer, config)

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
      minWidth: 50 // 字段宽度拖拽后, 不能低于 30px, 看不清了
    })
  }

  // 绑定列字段顺序拖拽
  const dragBinder = new ColumnDragBinder()
  if (onColumnOrderChange) {
    dragBinder.bind({
      scrollContainer,
      headerRow,
      onOrderChange: onColumnOrderChange
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

  // 绑定正标宽度拖拽
  const tableResizeBinder = new TableResizeBinder()
  if (onTableResizeEnd) {
    tableResizeBinder.bind({
      scrollContainer,
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
      // 只更新变量, 不重建 DOM 
      for (const col of columns) {
        scrollContainer.style.setProperty(`--col-${col.key}-width`, `${col.width}px`)
      }
    },
    updateColumnOrder(columns) {
      // 重排 header 顺序, 根据传入的新 columns 
      const headerRow = scrollContainer.querySelector('.sticky-header') as HTMLDivElement | null
      if (headerRow) {
        const cells = Array.from(headerRow.querySelectorAll<HTMLDivElement>('.table-cell'))
        const map = new Map<string, HTMLDivElement>()
        
        cells.forEach(cell => {
          const key = cell.dataset.columnKey 
          if (key) map.set(key, cell)
        })

        headerRow.innerHTML = ''
        columns.forEach(col => {
          const cell = map.get(col.key)
          if (cell) headerRow.appendChild(cell)
        })
      }
      // 重排 summary
      const summaryRow = scrollContainer.querySelector('.sticky-summary') as HTMLDivElement | null
      if (summaryRow) {
        const cells = Array.from(summaryRow.querySelectorAll<HTMLDivElement>('.table-cell'))
        const map = new Map<string, HTMLDivElement>()

        cells.forEach(cell => {
          const key = cell.dataset.columnKey
          if (key) map.set(key, cell)
        })
        summaryRow.innerHTML = ''        
        columns.forEach(col => {
          const cell = map.get(col.key)
          if (cell) summaryRow.appendChild(cell)
        })
      }
    },
    // 其他更多拓展...


    // 清理方法放最后来, 不然总是找不到在哪!
    destroy() {
      headerSortBinder.unbind(headerRow) // 清理表头事件
      scrollBinder.unbind(scrollContainer) // 清理滚动事件
      scrollContainer.innerHTML = '' // 清理容器
      resizeBinder.unbind(headerRow) // 释放列宽拖拽事件
      dragBinder.unbind(headerRow) // 释放列拖拽改顺序字段
      filterBinder.unbind()  // 释放列值筛选
      tableResizeBinder.unbind() // 释放整表宽度拖拽事件
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

