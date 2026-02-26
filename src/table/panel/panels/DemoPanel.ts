import type { IPanel } from "@/table/panel/IPanel";
import { TableStore } from "@/table/state/createTableStore";

/**
 * 实例面板: 用于测试面板系统
 * 
 * 这时一个最简单的面板实现, 用于验证: 
 * 1. 面板可以正常创建嗯哼销毁
 * 2. 面板可以访问 state
 * 3. 面板生命周期回调正常
 */
export class DemoPanelImpl implements IPanel {
  private container: HTMLDivElement 
  private unsubscribe: (() => void) | null = null 

  constructor(private store: TableStore) {
    this.container = this.render()
  }

  private render(): HTMLDivElement {
    const container = document.createElement('div')
    container.className = 'vt-demo-panel'
    container.innerHTML = `
      <div class="vt-panel-header">
        <h3>示例面板</h3>
        <p>这是俺的测试面板, 用于验证面板系统滴</p>
      </div>
      <div class="vt-panel-body">
        <p>当前表格状态: </p>
        <pre id="vt-demo-panel-state"></pre>
        <button id="vt-demo-panel-test-btn">测试按钮</button>
      </div>
    `
    // 绑定测试按钮
    const btn = container.querySelector('#vt-demo-panel-test-btn') as HTMLButtonElement
    btn.onclick = () => {
      alert('面板按钮点击成功!')
    }
    return container
  }

  // 必须要实现 IPanel 接口的所有方法
  public getContainer(): HTMLDivElement {
    return this.container
  }

  public onShow(): void {
    console.log('[DemoPanel] 面板展示中...')

    // 添加防御性检查, 因为可能此时还拿不到 store
    if (!this.store) {
      console.error('[DemoPanel] store 未初始化, 无法订阅哦!')
      return
    }

    // 订阅 store 变化, 实时更新状态
    this.unsubscribe = this.store.subscribe(() => {
      this.updateState()
    })
    this.updateState()
  }

  public onHide(): void {
    console.log('[DemoPanle] 面板隐藏中')
    // 取消订阅, 避免内存泄露
    this.unsubscribe?.()
    this.unsubscribe = null 
  }

  private updateState(): void {
    // 防御性检查 store 可能还没数据
    if (!this.store) {
      console.error('[DemoPanel] store 未初始化, 无法订阅哦!')
      return
    }

    const state = this.store.getState()
    const stateEl = this.container.querySelector('#vt-demo-panel-state')
    if (stateEl) {
      stateEl.textContent = JSON.stringify({
        mode: state.data.mode,
        columnCount: state.columns.order.length,
        frozenCount: state.columns.frozenCount
      }, null, 2)
    }
  }

  public destroy(): void {
    console.log('[DemoPanel] 面板销毁')
    this.unsubscribe?.()
    this.container.remove()
  }

}

// 导出工厂函数
export const DemoPanel = (store: TableStore): IPanel => {
  return new DemoPanelImpl(store)
}