import type { IColumn, IConfig } from "@/types";
import type { IPivotConfig, IPivotFlatRow, IPivotTreeNode } from "@/types/pivot";
import { PivotDataProcessor } from "@/table/pivot/PivotDataProcessor";
import { PivotRenderer } from "@/table/pivot/PivotRenderer";
import { PivotConfigPanel } from "@/table/pivot/PivotConfigPanel";
import { PivotTreeNode } from "@/table/pivot/PivotTreeNode";

/**
 * 透视表主类 (虚拟滚动)
 * 
 * 职责: 
 * 1. 整合数据处理器, 渲染器
 * 2. 管理透视表生命周期 (挂载, 刷新, 销毁)
 * 3. 虚拟滚动, 只渲染可视区行, 支持大数据量
 * 4. 处理用户交互 (展开/折叠, 配置变更)
 * 
 * 虚拟滚动原理 (与项目中 VirtualViewport 一致)
 * - scrollSpacer 撑出总高度 = flatRows.lenght * ROW_HEIGHT
 * - virtualContent 用 translateY 定位到可视区起始位置
 * - 只创建 [startRow, endRow] 范围内的行 DOM 
 * - 滚动时增量更新: 新进入的行创建, 离开的行销毁
 */
export class PivotTable {
  private pivotConfig: IPivotConfig
  private columns: IColumn[]
  private data: Record<string, any>[]

  private processor: PivotDataProcessor
  private renderer: PivotRenderer
  private configPanel: PivotConfigPanel

  private treeRoot: IPivotTreeNode | null = null 
  private flatRows: IPivotFlatRow[] = []

  private container: HTMLDivElement | null = null 
  private tableArea: HTMLDivElement | null = null 

  // 虚拟滚动相关
  private scrollContainer: HTMLDivElement | null = null 
  private scrollSpacer: HTMLDivElement | null = null 
  private virtualContent: HTMLDivElement | null = null 
  private headerEl: HTMLDivElement | null = null 
  private stickyGroupEl: HTMLDivElement | null = null 

  private visibleRowMap = new Map<number, HTMLDivElement>()
  private visibleSet = new Set<number>()

  private readonly ROW_HEIGHT = 32 //  暂时写死行高就 32px
  private readonly BUFFER_ROWS =10 //  暂时写死缓存行 10行

  // 绑定 scroll handler 引用, 方便 destroy 时移除
  private scrollHandler = () => this.updateVisibleRows()

  constructor(pivotConfig: IPivotConfig, columns: IColumn[], data: Record<string, any>[]) {
    this.pivotConfig = pivotConfig
    this.columns = columns
    this.data = data

    this.processor = new PivotDataProcessor(pivotConfig)
    this.renderer = new PivotRenderer(pivotConfig, columns)
    this.configPanel = new PivotConfigPanel(
      pivotConfig, 
      columns,
      (newConfig) => this.onConfigChange(newConfig)
    )
  }

  /**
   * 挂载到容器
   * 
   * DOM 结构: 
   * container
   *  └─ pivot-table (flex column, 100% height)
   *      ├─ pivot-header-wrapper (固定表头)
   *      └─ pivot-scroll-container (flex:1, overflow:auto)
   *          └─ pivot-scroll-spacer (height = totalRows * ROW_HEIGHT)
   *              └─ pivot-virtual-content (translateY 定位, 只渲染可视行)
   */
  public mount(container: HTMLDivElement): void {
    this.container = container
    container.innerHTML = ''
    // 直接作为表格区域, 配置面板已又侧边栏 PivotPanel 管理
    this.tableArea = container

    this.buildScrollStructure() // 构建虚拟滚动骨架
    this.refresh() // 初始化渲染
  }

  /** 构建虚拟滚动 DOM 骨架 */
  private buildScrollStructure(): void {
    if (!this.tableArea) return 

    const wrapper = document.createElement('div')
    wrapper.className = 'pivot-table'
    wrapper.style.height = '100%'
    wrapper.style.display = 'flex'
    wrapper.style.flexDirection = 'column'

    // 表头 (固定, 不随滚动)
    this.headerEl = document.createElement('div')
    this.headerEl.className = 'pivot-header-wrapper'
    wrapper.appendChild(this.headerEl)

    // 滚动容器
    this.scrollContainer = document.createElement('div')
    this.scrollContainer.className = 'pivot-scroll-container'

    // 吸顶分组行, 介于 scrollContiner 和 scrollSpacer 之间, 不有 transform 影响
    this.stickyGroupEl = document.createElement('div')
    this.stickyGroupEl.className = 'pivot-sticky-group'
    this.stickyGroupEl.style.display = 'none'

    // 撑高度的而 spacer
    this.scrollSpacer = document.createElement('div')
    this.scrollSpacer.className = 'pivot-scroll-spacer'

    // 虚拟内容区
    this.virtualContent = document.createElement('div')
    this.virtualContent.className = 'pivot-virtual-content'

    // 挂载
    this.scrollContainer.appendChild(this.stickyGroupEl)
    this.scrollContainer.appendChild(this.scrollSpacer)
    this.scrollContainer.appendChild(this.virtualContent)
    wrapper.appendChild(this.scrollContainer)
    this.tableArea.appendChild(wrapper)
    
    // 绑定滚动事件
    this.scrollContainer.addEventListener('scroll', this.scrollHandler)
  }

  /**
   * 刷新透视表
   * 
   * 流程: 
   * 1. 构建透视树 (PivotDataProcessor)
   * 2. 展平树结构 (PivotTreeNode.flattenTree)
   * 3. 渲染表头
   * 4. 更新滚动高度
   * 5. 清空可视区缓存 并 重新渲染可视区
   */
  private refresh(): void {
    if (!this.tableArea) return 
    // 构建透视树
    this.treeRoot = this.processor.buildPivotTree(this.data)
    // 展平
    this.flatRows = PivotTreeNode.flattenTree(this.treeRoot)
    // 渲染表头, 更新滚动高度, 清空并重新渲染可视区
    this.renderHeader()
    this.updateScrollHeight()
    this.clearVisibleRows()
    this.updateVisibleRows()
  }

  /** 渲染表头 */
  private renderHeader(): void {
    if (!this.headerEl) return 

    this.headerEl.innerHTML = ''
    const header = this.renderer.renderHeader()
    this.headerEl.appendChild(header)
  }

  /** 更新 spacer 高度 */
  private updateScrollHeight(): void {
    if (!this.scrollSpacer) return 

    const totalHeight = this.flatRows.length * this.ROW_HEIGHT // 行数 * 每行高度
    this.scrollSpacer.style.height = `${totalHeight}px`
  }

  /** 清空可视区缓存 */
  private clearVisibleRows(): void {
    if (this.virtualContent) {
      this.virtualContent.innerHTML = ''
    }

    this.visibleRowMap.clear()
    this.visibleSet.clear()

    if (this.stickyGroupEl) {
      this.stickyGroupEl.style.display = 'none'
    }
  }

  /** 
   * 增量更新可视区行 (虚拟滚动)
   * 
   * 原理与项目中 VirtualViewport.updateVisibleRowInternal 一致:
   * 1. 根据 scrollTop 计算 [startRow, endRow]
   * 2. 新进 可视区的行 -> 创建 DOM 并加入 fragment
   * 3. 离开 可视区的行 -> 移除 DOM
   * 4. translateY 定位 virturalContent
  */
  private updateVisibleRows(): void {
    if (!this.scrollContainer || !this.virtualContent) return 

    const scrollTop = this.scrollContainer.scrollTop 
    const viewportHeight = this.scrollContainer.clientHeight
    const totalRows = this.flatRows.length

    if (totalRows === 0) return 

    // 计算可视行范围 (带缓冲区)
    const startRow = Math.max(0, Math.floor(scrollTop / this.ROW_HEIGHT) - this.BUFFER_ROWS)
    const endRow = Math.min(
      totalRows - 1,
      Math.ceil((scrollTop + viewportHeight) / this.ROW_HEIGHT + this.BUFFER_ROWS)
    )
    
    // 定位虚拟内容区
    this.virtualContent.style.transform = `translateY(${startRow * this.ROW_HEIGHT}px)`

    const newVisibleSet = new Set<number>()
    const fragement = document.createDocumentFragment()

    for (let i = startRow; i <= endRow; i++) {
      newVisibleSet.add(i)

      if (!this.visibleSet.has(i)) {
        const flatRow = this.flatRows[i]
        if (!flatRow) continue 

        const rowEl = this.renderer.renderRow(flatRow)
        rowEl.style.height = `${this.ROW_HEIGHT}px`
        rowEl.style.lineHeight = `${this.ROW_HEIGHT}px`

        // 分组行绑定 展开 / 折叠
        if (flatRow.type === 'group') {
          rowEl.style.cursor = 'pointer'
          const nodeId = flatRow.nodeId
          rowEl.addEventListener('click', () => {
            this.toggleNode(nodeId)
          })
        }

        fragement.appendChild(rowEl)
        this.visibleRowMap.set(i, rowEl)
      }
    }

    // 批量插入
    if (fragement.children.length > 0) {
      this.virtualContent.appendChild(fragement)
    }

    // 清理离开可视区的行
    for (const idx of this.visibleSet) {
      if (!newVisibleSet.has(idx)) {
        const el = this.visibleRowMap.get(idx)
        el?.remove()
        this.visibleRowMap.delete(idx)
      }
    }

    this.visibleSet = newVisibleSet
    // 更新吸顶分组行
    this.updateStickyGroup(startRow)
  }

  /**
   * 更新吸顶分组行
   * 
   * 原理: 
   * 从当前可视区, 第一行往前找最近的 group 行
   * - 若该 group 行已经滚出视口, 则在顶部显示一个固定的副本
   * - 若该 group 行本身还在视口, 则隐藏吸顶行, 避免重复
   */
  private updateStickyGroup(startRow: number): void {
    if (!this.stickyGroupEl) return 

    // 从 startRow 往前找最近的 group 行 
    let groupRow: IPivotFlatRow | null = null 
    let groupRowIndex = -1

    for (let i = startRow; i >= 0; i--) {
      if (this.flatRows[i]?.type === 'group') {
        groupRow = this.flatRows[i]
        groupRowIndex = i
        break
      }
    }

    // 若没有找到分组行 或者 分组行就是当前第一行 (视口内, 则隐藏)
    if (!groupRow || groupRowIndex >= startRow) {
      this.stickyGroupEl.style.display = 'none'
      return 
    }

    // 分组行已滚出视口, 显示吸顶副本
    this.stickyGroupEl.innerHTML = ''
    const rowEl = this.renderer.renderRow(groupRow)
    rowEl.style.height = `${this.ROW_HEIGHT}px`
    rowEl.style.lineHeight = `${this.ROW_HEIGHT}px`

    // 吸顶行也支持点击 展开 / 折叠, 复用 toggleNode 逻辑
    rowEl.style.cursor = 'pointer'
    const nodeId = groupRow.nodeId
    rowEl.addEventListener('click', () => {
      this.toggleNode(nodeId)
    })

    this.stickyGroupEl.appendChild(rowEl)
    this.stickyGroupEl.style.display = 'block'
  }
 

  /**
   * 切换节点 展开/折叠
   * 
   * 流程: 
   * 1. 在树中找到目标节点, 切换 isExpanded
   * 2. 重新展平树结构 (不需要重建树)
   * 3. 更新滚动高度 + 重新渲染可视区
   */
  private toggleNode(nodeId: string): void {
    if (!this.treeRoot) return 

    // 切换状态
    PivotTreeNode.toggleNode(this.treeRoot, nodeId)
    // 重新展平 (无需重新构建树, 只需重新展平即可)
    this.flatRows = PivotTreeNode.flattenTree(this.treeRoot)
    // 更新滚动高度 + 清理可视区缓存 + 重渲染可视区行
    this.updateScrollHeight()
    this.clearVisibleRows()
    this.updateVisibleRows()
  }

  /**
   * 配置变化回调
   * 
   * 当用户在配置面板中, 修改分组字段, 或数值字段时触发
   * 需要查询构建 处理器 和 渲染器, 然后刷新
   */
  private onConfigChange(newConfig: IPivotConfig): void {
    this.pivotConfig = newConfig
    this.processor = new PivotDataProcessor(newConfig)
    this.renderer = new PivotRenderer(newConfig, this.columns)
    // 重新构建透树, 并渲染
    this.refresh()
  }

  /** 更新数据 (外部调用) */
  public updateData(data: Record<string, any>[]): void {
    this.data = data 
    this.refresh()
  }

  /** 更新列配置 (外部调用) */
  public updateColumns(columns: IColumn[]): void {
    this.columns = columns
    this.renderer.updateConfig(this.pivotConfig, columns)
    this.refresh()
  }

  /** 更新透视配置 (由外部 PivotPanel 调用) */
  public updateConfig(config: IPivotConfig, columns: IColumn[]): void {
    this.pivotConfig = config
    this.columns = columns
    this.processor = new PivotDataProcessor(config)
    this.renderer = new PivotRenderer(config, columns)
    this.refresh()
  }

  /** 销毁 */
  public destroy(): void {
    this.scrollContainer?.removeEventListener('scroll', this.scrollHandler)
    this.clearVisibleRows()

    if (this.container) {
      this.container.innerHTML = ''
    }

    this.treeRoot = null 
    this.flatRows = []
    this.container = null 
    this.tableArea = null 

    this.scrollContainer = null 
    this.scrollSpacer = null 
    this.virtualContent = null 
    this.headerEl = null
    this.stickyGroupEl = null  
  }
}