import type { IColumn, IConfig } from "@/types";
import type { IPivotConfig, IPivotFlatRow, IPivotTreeNode } from "@/types/pivot";
import { PivotDataProcessor } from "@/table/pivot/PivotDataProcessor";
import { PivotRenderer } from "@/table/pivot/PivotRenderer";
import { PivotConfigPanel } from "@/table/pivot/PivotConfigPanel";
import { PivotTreeNode } from "@/table/pivot/PivotTreeNode";

/**
 * 透视表主类
 * 
 * 职责: 
 * 1. 整合数据处理器, 渲染器, 配置面板
 * 2. 管理透视表生命周期 (挂载, 刷新, 销毁)
 * 3. 处理用户交互 (展开/折叠, 配置变更)
 * 
 * 使用方式: 
 * const pivot = new PivotTable(pivotConfig, columns, data)
 * pivot.mount(document.getElementById('container'))
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
   * 布局结构: 
   * ┌──────────────────────────────────┐
   * │ pivot-layout                     │
   * │ ┌──────────────┐ ┌────────────┐ │
   * │ │ table-area   │ │ config-area│ │
   * │ │ (表格)       │ │ (配置面板) │ │
   * │ └──────────────┘ └────────────┘ │
   * └──────────────────────────────────┘
   */
  public mount(container: HTMLDivElement): void {
    this.container = container
    container.innerHTML = ''

    // 最外层布局
    const layout = document.createElement('div')
    layout.className = 'pivot-layout'

    // 左侧: 表格区域
    this.tableArea = document.createElement('div')
    this.tableArea.className = 'pivot-table-area'

    // 右侧: 配置面板
    const configArea = document.createElement('div')
    configArea.className = 'pivot-config-area'
    configArea.appendChild(this.configPanel.render())

    layout.appendChild(this.tableArea)
    layout.appendChild(configArea)
    container.appendChild(layout)

    // 初始化渲染
    this.refresh()
  }

  /**
   * 刷新透视表
   * 
   * 流程: 
   * 1. 构建透视树 (PivotDataProcessor)
   * 2. 展平树结构 (PivotTreeNode.flattenTree)
   * 3. 渲染表格 (PivotRender)
   */
  private refresh(): void {
    if (!this.tableArea) return 

    // 构建透视树
    this.treeRoot = this.processor.buildPivotTree(this.data)
    // 展平
    this.flatRows = PivotTreeNode.flattenTree(this.treeRoot)
    // 渲染
    this.renderTable()
  }

  /** 渲染表格 */
  private renderTable(): void {
    if (!this.tableArea) return 
    this.tableArea.innerHTML = ''

    // 表格容器
    const table = document.createElement('div')
    table.className = 'pivot-table'
    // 表头
    const header = this.renderer.renderHeader()
    table.appendChild(header)
    // 数据区域
    const body = document.createElement('div')
    body.className = 'pivot-table-body'

    for (const flatRow of this.flatRows) {
      const row = this.renderer.renderRow(flatRow)
      // 分组行绑定 展开/折叠 事件
      if (flatRow.type === 'group') {
        const expandIcon = row.querySelector('.pivot-expand-icon')
        if (expandIcon) {
          expandIcon.addEventListener('click', (e) => {
            e.stopPropagation()
            this.toggleNode(flatRow.nodeId)
          })
        }
        // 点击整行也可以 展开/折叠
        row.style.cursor = 'pointer'
        row.addEventListener('click', () => {
          this.toggleNode(flatRow.nodeId)
        })
      }

      body.appendChild(row)
    }

    table.appendChild(body)
    this.tableArea.appendChild(table)
  }

  /**
   * 切换节点 展开/折叠
   * 
   * 流程: 
   * 1. 在树中找到目标节点, 切换 isExpanded
   * 2. 重新展平树结构
   * 3. 重新渲染表格
   */
  private toggleNode(nodeId: string): void {
    if (!this.treeRoot) return 

    // 切换状态
    PivotTreeNode.toggleNode(this.treeRoot, nodeId)
    // 重新展平 (无需重新构建树, 只需重新展平即可)
    this.flatRows = PivotTreeNode.flattenTree(this.treeRoot)
    // 重新渲染
    this.renderTable()
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

  /** 销毁 */
  public destroy(): void {
    if (this.container) {
      this.container.innerHTML = ''
    }
    this.treeRoot = null 
    this.flatRows = []
    this.container = null 
    this.tableArea = null 
  }
}