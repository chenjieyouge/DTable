import { describe, it, expect, vi } from 'vitest'
import { PivotTable } from '@/table/pivot/PivotTable'
import type { IPivotConfig } from '@/types/pivot'
import type { IColumn } from '@/types'

/**
 * M3 细节回归测试:
 * 1. 右键菜单: 组行展开/折叠, 全部展开/折叠
 * 2. 展开状态记忆: refresh 后保留用户手动展开状态
 * 3. 导出 Excel 按钮存在 + .xls 下载触发
 */

function mountPivot(config: IPivotConfig, columns: IColumn[], data: Record<string, any>[]) {
  const table = new PivotTable(config, columns, data)
  const host = document.createElement('div')
  document.body.appendChild(host)
  table.mount(host)
  return { table, host }
}

describe('M3 透视表细节', () => {
  const columns: IColumn[] = [
    { key: '省', title: '省' },
    { key: '城市', title: '城市' },
    { key: '金额', title: '金额' },
  ]
  const data = [
    { 省: '广东', 城市: '广州', 金额: 100 },
    { 省: '广东', 城市: '深圳', 金额: 200 },
    { 省: '浙江', 城市: '杭州', 金额: 50 },
    { 省: '浙江', 城市: '宁波', 金额: 80 },
  ]
  const config: IPivotConfig = {
    enabled: true,
    rowGroups: ['省', '城市'],
    valueFields: [{ key: '金额', aggregation: 'sum' }],
  }

  it('右键组行弹出菜单: 含展开/折叠 与 全部展开/折叠', () => {
    const { host } = mountPivot(config, columns, data)

    // 找到第一行组行 (冻结区)
    const groupRow = host.querySelector<HTMLDivElement>('.vt-pivot-group-row')!
    expect(groupRow).toBeTruthy()
    expect(groupRow.dataset.type).toBe('group')
    expect(groupRow.dataset.nodeId).toBeTruthy()

    // 触发 contextmenu
    groupRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }))

    const menu = document.querySelector<HTMLDivElement>('.vt-pivot-context-menu')
    expect(menu).toBeTruthy()
    expect(menu!.textContent).toContain('全部展开')
    expect(menu!.textContent).toContain('全部折叠')
    // 菜单项里至少包含 展开/折叠 该组
    expect(menu!.textContent).toMatch(/展开该组|折叠该组/)
  })

  it('右键菜单「全部折叠」后组行变少 (子级组行折叠)', () => {
    const { host } = mountPivot(config, columns, data)
    const groupRowsBefore = host.querySelectorAll<HTMLDivElement>('.vt-pivot-group-row').length

    const groupRow = host.querySelector<HTMLDivElement>('.vt-pivot-group-row')!
    groupRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }))
    const menu = document.querySelector<HTMLDivElement>('.vt-pivot-context-menu')!
    const collapseAllItem = Array.from(menu.querySelectorAll<HTMLDivElement>('.vt-pivot-context-menu-item'))
      .find(i => i.textContent === '全部折叠')!
    collapseAllItem.click()

    const groupRowsAfter = host.querySelectorAll<HTMLDivElement>('.vt-pivot-group-row').length
    expect(groupRowsAfter).toBeLessThan(groupRowsBefore)
  })

  it('展开状态记忆: 手动折叠后 refresh 保持折叠, 而非重置为默认展开', () => {
    const { table, host } = mountPivot(config, columns, data)

    // 全部展开状态: 有省 + 城市两级组行
    const allGroupRows = host.querySelectorAll<HTMLDivElement>('.vt-pivot-group-row').length

    // 折叠第一个省节点 (广东)
    const 广东Row = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-group-row'))
      .find(r => r.textContent?.includes('广东'))!
    广东Row.click()
    const collapsedRows = host.querySelectorAll<HTMLDivElement>('.vt-pivot-group-row').length
    expect(collapsedRows).toBeLessThan(allGroupRows)

    // 触发一次 refresh (模拟筛选/配置变化)
    table.refresh()
    const afterRefresh = host.querySelectorAll<HTMLDivElement>('.vt-pivot-group-row').length
    expect(afterRefresh).toBe(collapsedRows)
  })

  it('工具栏存在「导出 Excel」按钮 (.xls)', () => {
    const { host } = mountPivot(config, columns, data)
    const xlsBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.vt-pivot-control-btn'))
      .find(b => b.textContent?.includes('导出 Excel'))
    expect(xlsBtn).toBeTruthy()

    // 触发导出: mock URL.createObjectURL 验证下载被调用
    const createURL = vi.fn(() => 'blob:mock')
    const revokeURL = vi.fn()
    const origCreate = URL.createObjectURL
    const origRevoke = URL.revokeObjectURL
    URL.createObjectURL = createURL as any
    URL.revokeObjectURL = revokeURL as any
    try {
      xlsBtn!.click()
      expect(createURL).toHaveBeenCalled()
    } finally {
      URL.createObjectURL = origCreate
      URL.revokeObjectURL = origRevoke
    }
  })
})

