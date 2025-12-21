import { DataManager } from "@/data/DataManager";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { VirtualScroller } from "@/scroll/VirtualScroller";
import { IConfig } from "@/types";
import { calculatePageRange } from "@/utils/pageUtils";


export class VirtualViewport {
  private config: IConfig
  private dataManager: DataManager
  private renderer: DOMRenderer
  private scroller: VirtualScroller

  private scrollContainer: HTMLDivElement
  private virtualContent: HTMLDivElement
  private visibleRows = new Set<number>() // 当前可见行下标集合
  private rowElementMap = new Map<number, HTMLDivElement>() // 行下标 -> 行 DOM 映射

  constructor(params: {
    config: IConfig;
    dataManager: DataManager;
    renderer: DOMRenderer;
    scroller: VirtualScroller;
    scrollContainer: HTMLDivElement 
    virtualContent: HTMLDivElement
  }) {
    // 初始化时, 值由 VirtaulTable 传递过来
    this.config = params.config;
    this.dataManager = params.dataManager;
    this.renderer = params.renderer;
    this.scroller = params.scroller;
    this.scrollContainer = params.scrollContainer
    this.virtualContent = params.virtualContent
  }

  // 允许在外部 totalRows 变化后, 替换 scroller , 针对数据筛选场景
  public setScroller(scroller: VirtualScroller) {
    this.scroller = scroller
  }

  // 对外入口: 更新可视区 (给 scroll 事件初始化时调用)
  public updateVisibleRows() {
    void this.updateVisibleRowsInternal()
  }

  // 核心调度方法: 计算可简化 -> 创建骨架 -> 加载数据 -> 更新可视区
  private async updateVisibleRowsInternal() {
    // 获取当前滚动位置和可视区高度
    const { scrollTop, clientHeight }  = this.scrollContainer
    // 表头 + 总结行高度要固定住
    const fixedTopHeight = this.config.headerHeight + (this.config.showSummary? this.config.summaryHeight : 0)
    // 滚动高度不能小于 0 
    const contentScrollTop = Math.max(0, scrollTop - fixedTopHeight)
    // 计算可视区高度, 要减去表头和汇总行高度
    const viewportHeight = clientHeight 
      - this.config.headerHeight 
      - (this.config.showSummary ? this.config.summaryHeight : 0)

    // 计算可视区行范围, 一级 translateY, contentHeight 
    const { 
      startRow, 
      endRow,
      translateY, 
      contentHeight } 
      = this.scroller.getScrollInfo(contentScrollTop, viewportHeight)
    
    // 计算页码范围, 并通知外部 (this.config.onPageChange 消费)
    const pageInfo = calculatePageRange(
      startRow, 
      endRow, 
      this.config.totalRows, 
      this.config.pageSize)
    this.config.onPageChange?.(pageInfo)

    // 设置虚拟内容区的位置和高度
    this.virtualContent.style.transform = `translateY(${translateY}px)`
    this.virtualContent.style.height = `${contentHeight}px`
    // console.log(startRow, endRow)
    // 渲染 [startRow, endRow] 范围的行 div, 先骨架屏, 后异步填充数据
    const newVisibleSet = new Set<number>()
    const fragment = document.createDocumentFragment()
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex++) {
      newVisibleSet.add(rowIndex)
      // 若当前行不在可视区中, 则创建骨架行 + 异步加载行数据
      if (!this.visibleRows.has(rowIndex)) {
        const rowEl = this.renderer.createSkeletonRow(rowIndex)
        // 这里 top 依赖 startRow, 保证每次滚动时, 越往后的行 top 值越大, 逐行排
        rowEl.style.top = `${(rowIndex - startRow) * this.config.rowHeight}px`
        fragment.appendChild(rowEl)
        this.rowElementMap.set(rowIndex, rowEl)
        //异步填充数据, 失败只 warn, 不中断渲染
        this.updateRowData(rowIndex).catch(console.warn)
      } else {
        // 当前行已在可视区里面, 则无需重复创建 dom, 只更新 top 即可
        const rowEl = this.rowElementMap.get(rowIndex)!
        rowEl.style.top = `${(rowIndex - startRow) * this.config.rowHeight}px`
      }
      // 批量插入新行
      if (fragment.children.length > 0) {
        this.virtualContent.appendChild(fragment)
      }
    }

    // 清理掉离开视口的旧行 dom 
    for (const rowIndex of this.visibleRows) {
      if (!newVisibleSet.has(rowIndex)) {
        // 从当前页面的行中 取出 非可视区内的行, 进行删除
        const deleteRow = this.rowElementMap.get(rowIndex)
        if (deleteRow) {
          deleteRow.remove()
          this.rowElementMap.delete(rowIndex)
        }
      }
    }
    // 更新可视区的行 (下标)
    this.visibleRows = newVisibleSet
  }

  // 更新某行数据: 先同步查缓存, 没有就触发分页加载, 然后再填充单元格
  private async updateRowData(rowIndex: number) {
    try {
      let rowData = this.dataManager.getRowData(rowIndex)
      if (!rowData) {
        // 缓存页中没有该行数据, 则触发异步数据加载 (分页模式)
        const pageIndex = Math.floor(rowIndex / this.config.pageSize)
        await this.dataManager.getPageData(pageIndex)
        rowData = this.dataManager.getRowData(rowIndex)
      }
      if (rowData !== undefined) {
        const rowEl = this.rowElementMap.get(rowIndex) // 从缓存中找到更新行
        if (rowEl) {
          // 关键: 渲染行数据
          this.renderer.updateDataRow(rowEl, rowData)
        }
      }
    } catch (error) {
      console.warn(`Faild to update row ${rowIndex}`, error)
    }
  }

  // 刷新表格, 不重建 dom: 清空可是行缓存和更新可视区
  public refresh() {
    // 清空虚拟内容区
    if (this.virtualContent) {
      this.virtualContent.replaceChildren()
    }
    // 清空当前渲染状态缓存
    this.visibleRows.clear()
    this.rowElementMap.clear()
    // 重新渲染可视区
    this.updateVisibleRows()
  }

  // 销毁: 释放引用 + 清空缓存 
  public destroy() {
    this.visibleRows.clear()
    this.rowElementMap.clear()
  }


}