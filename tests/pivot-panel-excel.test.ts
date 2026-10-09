import { describe, it, expect, vi } from 'vitest'
import { createTableStore } from '@/table/state/createTableStore'
import { createColumnPanel } from '@/table/panel/panels/ColumnPanel'
import { PivotTable } from '@/table/pivot/PivotTable'
import type { IColumn } from '@/types'
import type { IPivotConfig } from '@/types/pivot'

/**
 * M2 字段面板 Excel 化测试:
 * 1. 字段列表勾选视图: 勾选文本→行区, 数值→值区; 取消→全域移除
 * 2. 值字段设置弹层: 重命名 / 数字格式 / 聚合方式 → 透传到 config + 表头命名
 */

function openPivotPanel(columns: IColumn[], data: Record<string, any>[], onConfig: any) {
  const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
  const panel = createColumnPanel(store, columns, data, undefined, onConfig)
  const el = panel.getContainer()
  document.body.appendChild(el)
  const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
  pivotInput.checked = true
  pivotInput.dispatchEvent(new Event('change', { bubbles: true }))
  return { panel, el }
}

describe('M2 字段面板 Excel 化', () => {
  const columns: IColumn[] = [
    { key: '品类', title: '品类', width: 100 },
    { key: '型号', title: '型号', width: 100 },
    { key: '激活量', title: '激活量', width: 100, summaryType: 'sum' },
    { key: '活跃渗透率', title: '活跃渗透率', width: 100 },
  ]
  const data = [
    { 品类: '护耳耳机', 型号: 'E2S', 激活量: 100, 活跃渗透率: 0.5 },
    { 品类: '护耳耳机', 型号: 'Z6A', 激活量: 150, 活跃渗透率: 0.3 },
  ]

  it('字段列表勾选: 勾选文本字段自动加入行区, 数值字段自动加入值区', () => {
    vi.useFakeTimers()
    const onConfig = vi.fn()
    const { el } = openPivotPanel(columns, data, onConfig)

    const items = el.querySelectorAll<HTMLLabelElement>('.vt-px-checkbox-item')
    expect(items.length).toBe(columns.length)

    // 勾选「品类」(文本) 与「激活量」(数值)
    const checkboxes = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input[type="checkbox"]'))
    const 品类Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('品类'))!
    const 激活量Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('激活量'))!

    品类Cb.checked = true
    品类Cb.dispatchEvent(new Event('change', { bubbles: true }))
    激活量Cb.checked = true
    激活量Cb.dispatchEvent(new Event('change', { bubbles: true }))

    // 行区 chip 出现「品类」, 值区 chip 出现「激活量」
    const rowsZone = el.querySelector<HTMLDivElement>('.vt-px-zone-body[data-zone="rows"]')!
    const valuesZone = el.querySelector<HTMLDivElement>('.vt-px-zone-body[data-zone="values"]')!
    expect(rowsZone.textContent).toContain('品类')
    expect(valuesZone.textContent).toContain('激活量')

    // 推进 300ms 防抖, config 应带 rowGroups=['品类'] valueFields=[激活量 sum]
    vi.advanceTimersByTime(350)
    const call = onConfig.mock.calls[onConfig.mock.calls.length - 1]?.[0] as IPivotConfig
    expect(call.rowGroups).toEqual(['品类'])
    expect(call.valueFields[0]?.key).toBe('激活量')
    expect(call.valueFields[0]?.aggregation).toBe('sum')
    vi.useRealTimers()
  })

  it('字段列表取消勾选: 字段从所有区域移除', () => {
    const onConfig = vi.fn()
    const { el } = openPivotPanel(columns, data, onConfig)

    const checkboxes = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input[type="checkbox"]'))
    const 品类Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('品类'))!
    品类Cb.checked = true
    品类Cb.dispatchEvent(new Event('change', { bubbles: true }))

    const rowsZone = el.querySelector<HTMLDivElement>('.vt-px-zone-body[data-zone="rows"]')!
    expect(rowsZone.textContent).toContain('品类')

    // 取消勾选 → 从行区移除
    品类Cb.checked = false
    品类Cb.dispatchEvent(new Event('change', { bubbles: true }))
    expect(rowsZone.textContent).not.toContain('品类')
  })

  it('值字段设置弹层: 重命名 + 数字格式 + 聚合方式 透传到 config', () => {
    vi.useFakeTimers()
    const onConfig = vi.fn()
    const { el } = openPivotPanel(columns, data, onConfig)

    // 先勾选行字段(品类) + 数值字段(激活量) 加入对应区域
    const checkboxes = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input[type="checkbox"]'))
    const 品类Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('品类'))!
    品类Cb.checked = true
    品类Cb.dispatchEvent(new Event('change', { bubbles: true }))
    const 激活量Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('激活量'))!
    激活量Cb.checked = true
    激活量Cb.dispatchEvent(new Event('change', { bubbles: true }))

    // 点值区 chip 上的 ⚙ 按钮 → 弹层
    const settingsBtn = el.querySelector<HTMLButtonElement>('.vt-px-chip-settings')
    expect(settingsBtn).toBeTruthy()
    settingsBtn!.click()

    // 弹层挂载在 body (fixed 定位), 不在面板容器内
    const pop = document.querySelector<HTMLDivElement>('.vt-px-value-settings')
    expect(pop).toBeTruthy()

    // 重命名为「26Q3活跃人数」, 格式选 decimal2, 聚合选 avg
    const nameInput = pop!.querySelector<HTMLInputElement>('.vt-px-value-settings-input')!
    nameInput.value = '26Q3活跃人数'
    const selects = pop!.querySelectorAll<HTMLSelectElement>('.vt-px-value-settings-select')
    selects[0]!.value = 'avg'
    selects[0]!.dispatchEvent(new Event('change', { bubbles: true }))
    selects[1]!.value = 'decimal2'
    selects[1]!.dispatchEvent(new Event('change', { bubbles: true }))

    pop!.querySelector<HTMLButtonElement>('.vt-px-value-settings-ok')!.click()

    // 推进防抖, 校验 config 透传
    vi.advanceTimersByTime(350)
    const call = onConfig.mock.calls[onConfig.mock.calls.length - 1]?.[0] as IPivotConfig
    const vf = call.valueFields.find(v => v.key === '激活量')!
    expect(vf.label).toBe('26Q3活跃人数')
    expect(vf.aggregation).toBe('avg')
    expect(vf.format).toBe('decimal2')
    vi.useRealTimers()
  })

  it('值字段设置后表头显示「平均值项:26Q3活跃人数」', () => {
    vi.useFakeTimers()
    const onConfig = vi.fn()
    const { el } = openPivotPanel(columns, data, onConfig)

    const checkboxes = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input[type="checkbox"]'))
    const 品类Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('品类'))!
    品类Cb.checked = true
    品类Cb.dispatchEvent(new Event('change', { bubbles: true }))
    const 激活量Cb = checkboxes.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('激活量'))!
    激活量Cb.checked = true
    激活量Cb.dispatchEvent(new Event('change', { bubbles: true }))

    const settingsBtn = el.querySelector<HTMLButtonElement>('.vt-px-chip-settings')!
    settingsBtn.click()
    const pop = document.querySelector<HTMLDivElement>('.vt-px-value-settings')!
    const nameInput = pop.querySelector<HTMLInputElement>('.vt-px-value-settings-input')!
    nameInput.value = '26Q3活跃人数'
    // 聚合方式选 avg (影响表头前缀「平均值项」)
    const selects = pop.querySelectorAll<HTMLSelectElement>('.vt-px-value-settings-select')
    selects[0]!.value = 'avg'
    selects[0]!.dispatchEvent(new Event('change', { bubbles: true }))
    pop.querySelector<HTMLButtonElement>('.vt-px-value-settings-ok')!.click()

    // 推进防抖后直接用 config 构建透视表, 验证表头命名
    vi.advanceTimersByTime(350)
    const call = onConfig.mock.calls[onConfig.mock.calls.length - 1]?.[0] as IPivotConfig
    const table = new PivotTable(call, columns, data)
    const host = document.createElement('div')
    document.body.appendChild(host)
    table.mount(host)
    const headers = host.querySelectorAll<HTMLDivElement>('.vt-pivot-header-wrapper .vt-pivot-header-cell')
    expect(headers[0]?.textContent).toContain('平均值项:26Q3活跃人数')
    vi.useRealTimers()
  })
})
