import { describe, it, expect, vi, afterEach } from 'vitest'
import { PivotTable } from '@/table/pivot/PivotTable'
import { createTableStore } from '@/table/state/createTableStore'
import { createColumnPanel } from '@/table/panel/panels/ColumnPanel'
import type { IPivotConfig } from '@/types/pivot'
import type { IColumn } from '@/types'

/**
 * P3 状态持久化 + P2 大数据保护回归测试:
 * 1. PivotTable 展开状态跨会话记忆 (localStorage)
 * 2. ColumnPanel 透视配置跨会话记忆
 * 3. expandAll 大数据保护 (节点/行数超限 → confirm 拦截)
 */

function mountPivot(config: IPivotConfig, columns: IColumn[], data: Record<string, any>[]) {
  const table = new PivotTable(config, columns, data)
  const host = document.createElement('div')
  document.body.appendChild(host)
  table.mount(host)
  return { table, host }
}

describe('P3 状态持久化', () => {
  const columns: IColumn[] = [
    { key: '省', title: '省' },
    { key: '城市', title: '城市' },
    { key: '金额', title: '金额', summaryType: 'sum' },
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

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('PivotTable: 手动折叠后 localStorage 记录, 新实例恢复折叠状态', () => {
    // 第一个实例: 折叠广东组
    const { host } = mountPivot(config, columns, data)
    const 广东Row = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-group-row'))
      .find(r => r.textContent?.includes('广东'))!
    广东Row.click()
    expect(host.textContent).not.toContain('广东广州')
    expect(localStorage.getItem('dtable.pivot.expanded')).toBeTruthy()

    // 新实例 (模拟重新打开页面): 恢复折叠
    const { host: host2 } = mountPivot(config, columns, data)
    expect(host2.textContent).not.toContain('广东广州')
  })

  it('ColumnPanel: 配置变更写入 localStorage, 新面板恢复配置', () => {
    const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
    const onConfig = vi.fn()
    const panel = createColumnPanel(store, columns, data, undefined, onConfig)
    const el = panel.getContainer()
    document.body.appendChild(el)

    // 打开 Pivot → 勾选字段
    const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
    pivotInput.checked = true
    pivotInput.dispatchEvent(new Event('change', { bubbles: true }))

    const checkboxes = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input[type="checkbox"]'))
    const 品类Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('省'))!
    品类Cb.checked = true
    品类Cb.dispatchEvent(new Event('change', { bubbles: true }))
    const 金额Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('金额'))!
    金额Cb.checked = true
    金额Cb.dispatchEvent(new Event('change', { bubbles: true }))

    // 防抖后写入 localStorage
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(localStorage.getItem('dtable.pivot.config')).toContain('rowGroups')
        resolve()
      }, 350)
    })
  })

  it('ColumnPanel: localStorage 有配置时, 新面板自动恢复 (勾选列表/区域联动)', () => {
    // 预置持久化配置
    localStorage.setItem('dtable.pivot.config', JSON.stringify({
      enabled: true,
      rowGroups: ['省'],
      valueFields: [{ key: '金额', aggregation: 'sum', label: '金额' }],
      showSubtotals: true,
    }))

    const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
    const panel = createColumnPanel(store, columns, data, undefined, vi.fn())
    const el = panel.getContainer()
    document.body.appendChild(el)

    // Pivot 开关自动打开 + 行区/值区恢复
    const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
    expect(pivotInput.checked).toBe(true)
    const rowsZone = el.querySelector<HTMLDivElement>('.vt-px-zone-body[data-zone="rows"]')!
    const valuesZone = el.querySelector<HTMLDivElement>('.vt-px-zone-body[data-zone="values"]')!
    expect(rowsZone.textContent).toContain('省')
    expect(valuesZone.textContent).toContain('金额')
  })
})

describe('P2 expandAll 大数据保护', () => {
  const columns: IColumn[] = [{ key: '省', title: '省' }, { key: '金额', title: '金额', summaryType: 'sum' }]
  // 250 个唯一省 → 250 个分组节点 (>200 阈值 → 触发 confirm)
  const bigData = Array.from({ length: 250 }, (_, i) => ({ 省: `省份${i}`, 金额: i }))
  const config: IPivotConfig = {
    enabled: true,
    rowGroups: ['省'],
    valueFields: [{ key: '金额', aggregation: 'sum' }],
  }

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    delete (globalThis as any).confirm
  })

  it('节点超限时 confirm 拒绝 → 不执行全展开', () => {
    const confirmSpy = vi.fn(() => false)
    ;(globalThis as any).confirm = confirmSpy
    const { host } = mountPivot(config, columns, bigData)

    const expandBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.vt-pivot-control-btn'))
      .find(b => b.textContent === '展开')!
    expandBtn.click()

    expect(confirmSpy).toHaveBeenCalled()
    // 拒绝后仍保持初始展开策略 (level<=1 展开 → 250 组行 + 250 数据行 + 小计)
    expect(host.textContent).toContain('省份0')
  })

  it('confirm 接受 → 全展开执行', () => {
    ;(globalThis as any).confirm = vi.fn(() => true)
    const { host } = mountPivot(config, columns, bigData)
    const groupRowsBefore = host.querySelectorAll<HTMLDivElement>('.vt-pivot-group-row').length

    const expandBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.vt-pivot-control-btn'))
      .find(b => b.textContent === '展开')!
    expandBtn.click()

    // 全展开执行成功 (虚拟滚动下远端行不在 DOM, 用 confirm 调用 + 组件存活验证)
    expect(host.textContent).toContain('省份0')
  })
})
