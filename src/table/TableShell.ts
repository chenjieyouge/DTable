import type { IConfig } from "@/types";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { VirtualScroller } from "@/scroll/VirtualScroller";
import { HeaderSortBinder } from "@/table/interaction/HeaderSortBinder";
import { ScrollBinder } from "@/table/interaction/ScrollBinder";
import { SortIndicatorView } from "@/table/interaction/SortIndicatorView";


export interface ITableShell {
  scrollContainer: HTMLDivElement
  virtualContent: HTMLDivElement
  summaryRow?: HTMLDivElement

  setScrollHeight(scroller: VirtualScroller): void // 统一更新滚动高度
  setSortIndicator(sort: { key: string, direction: 'asc' | 'desc' } | null): void // 统一控制排序箭头
  bindScroll(onRafScroll: () => void): void // 绑定滚动, 内部 raf, 外部只传要做什么
  destroy(): void // 释放所有事件, 清空 dom 
}

export function mountTableShell(params: {
  config: IConfig,
  renderer: DOMRenderer 
  headerSortBinder: HeaderSortBinder
  onToggleSort: (key: string) => void 
  onNeedLoadSummary?: (summaryRow: HTMLDivElement) => void
}): ITableShell {
  const { config, renderer, headerSortBinder, onToggleSort, onNeedLoadSummary } = params
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
  headerSortBinder.bind(headerRow, (key) => onToggleSort(key))
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
    destroy() {
      headerSortBinder.unbind(headerRow) // 清理表头事件
      scrollBinder.unbind(scrollContainer) // 清理滚动事件
      scrollContainer.innerHTML = '' // 清理容器
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
}

// 辅助函数-创建表格容器 wrapper
function createTableWrapper(config: IConfig): HTMLDivElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'table-wrapper'
  const totalWidth = config.columns.reduce((sum, col) => sum + col.width, 0)
  wrapper.style.width = `${totalWidth}px`
  return wrapper
}

