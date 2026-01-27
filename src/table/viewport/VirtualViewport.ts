import type { DataStrategy } from "@/table/data/DataStrategy";
import { DOMRenderer } from "@/dom/DOMRenderer";
import { VirtualScroller } from "@/scroll/VirtualScroller";
import { IConfig, IPageInfo } from "@/types";
import { calculatePageRange } from "@/utils/pageUtils";
import { RenderScenario, RenderMethod, RenderProtocalValidator } from "@/table/viewport/RenderProtocol";


export class VirtualViewport {
  private config: IConfig
  private dataStrategy: DataStrategy
  private renderer: DOMRenderer
  private scroller: VirtualScroller

  private scrollContainer: HTMLDivElement
  private virtualContent: HTMLDivElement
  private onPageChange?: (pageInfo: IPageInfo) => void

  private visibleRows = new Set<number>() // 当前可见行下标集合
  private rowElementMap = new Map<number, HTMLDivElement>() // 行下标 -> 行 DOM 映射

  constructor(params: {
    config: IConfig;
    dataStrategy: DataStrategy,
    renderer: DOMRenderer;
    scroller: VirtualScroller;
    scrollContainer: HTMLDivElement 
    virtualContent: HTMLDivElement
    onPageChange?: (pageInfo: IPageInfo) => void // 可选回调
  }) {
    // 初始化时, 值由 VirtaulTable 传递过来
    this.config = params.config;
    this.dataStrategy = params.dataStrategy;
    this.renderer = params.renderer;
    this.scroller = params.scroller;
    this.scrollContainer = params.scrollContainer
    this.virtualContent = params.virtualContent
    this.onPageChange = params.onPageChange
  }

  // 允许在外部 totalRows 变化后, 替换 scroller , 针对数据筛选场景
  public setScroller(scroller: VirtualScroller) {
    this.scroller = scroller
  }

  // ========== 规则2: 普通滚动/补数据, 只能 updateVisibleRows() =========
  /**
   * 增量更新可视区行
   * - 普通滚动
   * - 初始化填充
   * - 数据补充
   * 
   * 不会清空 DOM, 只会增量更新
   */
  public updateVisibleRows(): void {
    requestAnimationFrame(() => {
      this.updateVisibleRowsInternal()
    })
  }

  // 获取当前可视区的数据行, 给外部 dom 引用, 避免重复查询
  public getVisibleRows(): HTMLDivElement[] {
    return Array.from(this.rowElementMap.values())
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
    this.onPageChange?.(pageInfo)  // 用实例方法, 而非 config

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
      
    }
    // 批量插入新行, 一定要移到 for 循环的外部!!!
    if (fragment.children.length > 0) {
      this.virtualContent.appendChild(fragment)
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

  // ======== 规则2: 数据泌冲只能 updateRowData() =========
  /**
   * 更新某行数据 (异步加载后完成)
   * 适用场景: server 模式下异步加载页数据
   * @param rowIndex 
   */
  private async updateRowData(rowIndex: number): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      RenderProtocalValidator.validate(
        RenderScenario.DATA_PATCH,
        RenderMethod.UPDATE_DATA,
        'VirtualViewport.updateRowData'
      )
    }
    
    try {
      let rowData = this.dataStrategy.getRow(rowIndex)
      if (!rowData) {
        // 缓存页中没有该行数据, 则触发异步数据加载 (分页模式)
        const pageIndex = Math.floor(rowIndex / this.config.pageSize)
        await this.dataStrategy.ensurePageForRow(pageIndex)
        rowData = this.dataStrategy.getRow(rowIndex)
      }
      if (rowData !== undefined) {
        const rowEl = this.rowElementMap.get(rowIndex) // 从缓存中找到更新行
        if (rowEl) {
          // 关键: 渲染行数据, 务必传 rowIndex, 用来实现自定义渲染单元格的标识
          this.renderer.updateDataRow(rowEl, rowData, rowIndex) 
          
        }
      }
    } catch (error) {
      console.warn(`Faild to update row ${rowIndex}`, error)
    }
  }

  // ========== 规则1: refresh() 只能在结构性变化时调用 =========
  /**
   * 清屏重建: 清空所有 DOM 并重新渲染
   * ⚠️ 警告：此方法会导致闪烁，只能在以下场景调用:
   * - 列数量/列顺序变化
   * - 冻结列数变化
   * - totalRows 导致 scroll 尺寸重算且需要清屏
   * 
   * 普通滚动/数据补充等, 则走 updateVisibleRows() 增量更新
   */
  public refresh() {
    // dev 模式下校验调用合法性
    if (process.env.NODE_ENV === 'development') {
      // 需要调用者传入 scenario, 暂时先不校验
      // 后续会在调用点添加 scenario 参数
    }

    // 清空虚拟内容区
    if (this.virtualContent) {
      this.virtualContent.replaceChildren()
    }
    // 清空当前渲染状态缓存
    this.visibleRows.clear()
    this.rowElementMap.clear()
    this.updateVisibleRows() // 重新渲染可视区
  }

  // 销毁: 释放引用 + 清空缓存 
  public destroy() {
    this.visibleRows.clear()
    this.rowElementMap.clear()
  }


}