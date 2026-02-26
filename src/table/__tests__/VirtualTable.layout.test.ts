import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VirtualTable } from "@/table/VirtualTable";
import { DemoPanel } from "@/table/panel/panels/DemoPanel";

describe('VirtualTable-LayoutManager 集成', () => {
  let container: HTMLDivElement
  let table: VirtualTable

  beforeEach(() => {
    // 创建测试表格容器
    container = document.createElement('div')
    container.id = 'test-container'
    document.body.appendChild(container)
  })

  afterEach(() => {
    // 清理整个容器
    table?.destroy()
    container.remove()
  })

  it('能创建带右侧面板的表格', async () => {
    table = new VirtualTable({
      container: '#test-container',
      columns: [{ key: 'id', title: 'ID', width: 100}],
      initialData: [{id: 1}],
      sidePanel: {
        enabled: true,
        panels: [
          { id: 'demo', title: '测试', component: DemoPanel }
        ]
      }
    })
    await table.ready
    table.mount()
    // 验证布局容器存在
    const layoutContainer = container.querySelector('.vt-layout-container')
    expect(layoutContainer).toBeTruthy() // 除 false, 0, '', null, undefined, NaN
    // 验证 mainArea 和 sideArea 都存在
    const mainArea = container.querySelector('.vt-layout-main')
    const sideArea = container.querySelector('.vt-layout-side')
    expect(mainArea).toBeTruthy()
    expect(sideArea).toBeTruthy()
  })

  it('不启用右侧面板时应自动用标准布局', async () => {
    table = new VirtualTable({
      container: '#test-container',
      columns: [{ key: 'id', title: 'ID', width: 100}],
      initialData: [{id: 1}]
      // 不配置 sidePanel
    })
    await table.ready
    table.mount()
    // 不应该有布局容器
    const layoutContainer = container.querySelector('.vt-layout-container')
    expect(layoutContainer).toBeFalsy()
    // 应该直接有表格容器
    const tableWrapper = container.querySelector('.vt-table-wrapper')
    expect(tableWrapper).toBeTruthy()
  })
})