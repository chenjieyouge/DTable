import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SidePanelManager } from '@/table/panel/SidePanelManager'
import { createTableStore } from '@/table/state/createTableStore'
import { DemoPanel } from '@/table/panel/panels/DemoPanel'
import type { IPanelConfig } from '@/table/panel/IPanel'


describe('SidePanelManger', () => {
  let manager: SidePanelManager
  let store: ReturnType<typeof createTableStore>

  const configs: IPanelConfig[] = [
    { id: 'demo1', title: '面板1', icon: '📊', component: DemoPanel },
    { id: 'demo2', title: '面板2', icon: '🔍', component: DemoPanel }
  ]

  beforeEach(() => {
    // 创建测试用的 store 
    store = createTableStore({
      columns: [],
      mode: 'client',
      frozenCount: 0
    })
    manager = new SidePanelManager(store, configs)
  })

  // 单项测试用例
  it('能创建面板管理器', () => {
    expect(manager).toBeDefined()
    expect(manager.getContainer()).toBeInstanceOf(HTMLDivElement)
  })

  it('能渲染所有Tab', () => {
    const container = manager.getContainer()
    const tabs = container.querySelectorAll('.vt-side-tab')
    expect(tabs.length).toBe(2)
  })

  it('能显示某个面板', () => {
    manager.showPanel('demo1')
    expect(manager.getActivePanel()).toBe('demo1')
  })

  it('能切换某个面板', () => {
    manager.showPanel('demo1')
    manager.showPanel('demo2')
    expect(manager.getActivePanel()).toBe('demo2')
  })

  it('能隐藏当前面板', () => {
    manager.showPanel('demo1')
    manager.hideCurrentPanel()
    expect(manager.getActivePanel()).toBe(null)
  })

  it('能调用面板的生命周期回调', () => {
    // vi 是 Vitest 提供的全局工具对象, 用于 mock, spyOn 等操作
    const onShowSpy = vi.fn()
    const onHideSpy = vi.fn()
    // 创建带有 spy 的面板
    class TestPanel extends DemoPanel {
      onShow = onShowSpy
      onHide = onHideSpy
    }

    const testManager = new SidePanelManager(store, [
      { id: 'test', title: '测试', component: TestPanel }
    ])

    testManager.showPanel('test')
    expect(onShowSpy).toHaveBeenCalled()

    testManager.hideCurrentPanel()
    expect(onHideSpy).toHaveBeenCalled()
  })

  it('能销毁面板管理器', () => {
    manager.showPanel('demo1'),
    manager.destroy()
    expect(manager.getActivePanel()).toBe(null)
  })


})