import type { IConfig } from "@/types";

// LayoutManager 基础架构

// 布局配置
export interface LayoutConfig {
  mode: 'desktop' | 'tablet' | 'mobile'  // 当前模式: 电脑端, 平板, 手机
  sidePanel?: {
    position: 'left' | 'right' // 向左还是向右
    width: number 
    collapsible: boolean  // 是否可折叠
    defaultOpen?: boolean // 默认大块
  }
}

/**
 * 布局管理器: 负责整体布局结构
 * 
 * 职责: 
 * 1. 管理主表格区域 + 右侧面板区域的布局
 * 2. 响应式布局调整
 * 3. 面板展开/收起动画
 */
export class LayoutManager {
  private config: IConfig
  private layoutConfig: LayoutConfig 
  private container: HTMLDivElement | null = null 
  private mainArea: HTMLDivElement | null = null 
  private sideArea: HTMLDivElement | null = null 

  constructor(config: IConfig, layoutConfig?: Partial<LayoutConfig>) {
    this.config = config
    this.layoutConfig = {
      mode: 'desktop',
      ...layoutConfig
    }
  }

  // 渲染布局容器
  public render(): HTMLDivElement {
    // 最外层大容器
    this.container = document.createElement('div')
    this.container.className = 'table-layout-container'
    // 主表格区域
    this.mainArea = document.createElement('div')
    this.mainArea.className = 'table-layout-main'
    this.container.appendChild(this.mainArea)
    // 右侧面板区域 (可选)
    if (this.layoutConfig.sidePanel) {
      this.sideArea = document.createElement('div')
      this.sideArea.className = 'table-layout-side'
      this.sideArea.style.width = `${this.layoutConfig.sidePanel.width}px`
      // 右侧面板下的内容
      if (this.layoutConfig.sidePanel.position === 'right') {
        this.container.appendChild(this.sideArea)
      } else {
        this.container.insertBefore(this.sideArea, this.mainArea) // 左侧
      }
      // 模式是折叠状态
      if (!this.layoutConfig.sidePanel.defaultOpen) {
        this.sideArea.style.display = 'none'
      }
    }
    return this.container
  }

  // 获取主表格区域容器
  public getMainArea(): HTMLDivElement | null {
    return this.mainArea
  }

  // 获取右侧面板区域容器
  public getSideArea(): HTMLDivElement | null {
    return this.sideArea
  }

  // 切换显示/隐藏, 右侧面板
  public toggleSidePanel(show?: boolean): void {
    if (!this.sideArea) return

    const shouldShow = show ?? (this.sideArea.style.display === 'none')
    if (shouldShow) {
      // 缓慢从右侧往左展开
      this.sideArea.style.display = 'block'
      this.sideArea.style.animation = 'slideInRight 0.3s ease-out' // 展开动画
    } else {
      // 缩回去藏起来
      this.sideArea.style.animation = 'slideOutRight 0.3s ease-out'
      setTimeout(() => {
        if (this.sideArea) {
          this.sideArea.style.display = 'none'
        }
      }, 300)
    }
  }

  // 响应式调整
  public onResize(width: number): void {
    // 根据宽度自动切换模式: 手机 < 768; 电脑 > 1024, 其他就归属平板 (折叠屏呢?)
    if (width < 768) {
      this.setMode('mobile')
    } else if (width < 1024) {
      this.setMode('tablet')
    } else {
      this.setMode('desktop')
    }
  }

  // 设置布局模式
  public setMode(mode: LayoutConfig['mode']): void {
    // 当前模式和传入模式一样的, 则不用处理
    if (this.layoutConfig.mode === mode) return 

    this.layoutConfig.mode = mode 
    this.container?.setAttribute('data-layout-mode', mode)  // 标记给大容器
    // 移动端自动隐藏右侧面板
    if (mode === 'mobile' && this.sideArea) {
      this.sideArea.style.display = 'none'
    }
  }

  // 销毁容器, 解引用
  public destroy(): void {
    this.container?.remove()
    this.container = null 
    this.mainArea = null 
    this.sideArea = null 
  }


  // 其他...
}