import type { TableStore } from "@/table/state/createTableStore";


/**
 * 面板接口: 所有右侧面板均要实现这个接口
 * 
 * 设计原则: 
 * 1. 每个面板独立, 可独立创建和销毁
 * 2. 面板通过 store 与表格通信
 * 3. 面板声明周期可控 (onShow/onHide)
 */
export interface IPanel {
  getContainer(): HTMLDivElement // 获取面板的 dom 容器
  onShow?(): void // 面板显示时的回调, 用于初始化数据, 开始监听等
  onHide?(): void // 面板隐藏时的回调, 用于暂停更新, 释放资源等
  destroy(): void // 用于移除事件监听, 清空 dom 等
}

// 面板配置: 用于注册面板
export interface IPanelConfig {
  id: string // 面板的唯一ID, 如 'columns', 'filters', 'pivot' 等
  title: string // 面板标题, 如 '列管理', '筛选器', '透视表' 等
  icon?: string // 面板图标(可选), 如 '⚙️', '🔍', '📊' 等
  component: (store: TableStore, ...args: any[]) => IPanel // 工厂函数类型
}
