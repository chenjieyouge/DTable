import { describe, it, expect, vi } from 'vitest'
import { createTableStore } from '@/table/state/createTableStore'
import { createColumnPanel } from '@/table/panel/panels/ColumnPanel'
import { PivotTable } from '@/table/pivot/PivotTable'
import type { IColumn } from '@/types'
import type { IPivotConfig } from '@/types/pivot'

/**
 * 快速查询 UI 集成测试 (happy-dom)
 *
 * 链路: 列管理面板 → Pivot 开关 → 配置区「⚡ 快速查询」→ 字段窗格
 *        → 按勾选顺序生成 flatMode 配置 → 透视表扁平渲染 (不合并同值)
 */
describe('快速查询 UI 链路', () => {
  const columns: IColumn[] = [
    { key: '品类', title: '品类', width: 100 },
    { key: '型号', title: '型号', width: 100 },
    { key: '激活量', title: '激活量', width: 100, summaryType: 'sum' },
    { key: '价位段', title: '价位段', width: 100 },
  ]

  const data = [
    { 品类: '护耳耳机', 型号: 'E2S', 激活量: 100, 价位段: '入门' },
    { 品类: '护耳耳机', 型号: 'E2S', 激活量: 150, 价位段: '入门' },
    { 品类: '电话手表', 型号: 'Z6A', 激活量: 200, 价位段: '中端' },
    { 品类: '电话手表', 型号: 'Z9', 激活量: 40, 价位段: '高端' },
  ]

  it('列管理面板: 开 Pivot → 点「⚡ 快速查询」→ 出现字段窗格', () => {
    const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
    const onPivotConfigChange = vi.fn()

    const panel = createColumnPanel(
      store,
      columns,
      data,
      undefined,
      onPivotConfigChange,
    )
    const el = panel.getContainer()
    document.body.appendChild(el)

    // 打开 Pivot 开关 → 渲染四区域配置区
    const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
    pivotInput.checked = true
    pivotInput.dispatchEvent(new Event('change', { bubbles: true }))

    // 配置区出现「⚡ 快速查询」按钮
    const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.vt-pivot-quick-btn'))
    const queryBtn = buttons.find(b => b.textContent?.includes('快速查询'))
    expect(queryBtn).toBeTruthy()

    // 点击进入快速查询字段窗格
    queryBtn!.click()
    const qqPanel = el.querySelector<HTMLDivElement>('.vt-quick-query-panel')
    expect(qqPanel).toBeTruthy()

    // 红色提示条 (不合并行语义)
    const tip = qqPanel!.querySelector<HTMLDivElement>('.vt-quick-query-tip')
    expect(tip?.textContent).toContain('不合并行')

    // 维度字段 = 非数值、非 id 类字段 (品类/型号/价位段), 度量字段自动聚合 (激活量 sum)
    const dimCbs = Array.from(qqPanel!.querySelectorAll<HTMLInputElement>('.vt-quick-query-dim-checkbox'))
    expect(dimCbs.map(c => c.value)).toEqual(['品类', '型号', '价位段'])

    const measureItems = Array.from(qqPanel!.querySelectorAll<HTMLDivElement>('.vt-quick-query-measure-item'))
    expect(measureItems[0]?.textContent).toContain('激活量')
    expect(measureItems[0]?.textContent).toContain('(sum)')

    panel.destroy()
  })

  it('快速查询: 按字段列表顺序 (勾选顺序) 生成 flatMode 配置并回调', () => {
    const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
    const onPivotConfigChange = vi.fn()

    const panel = createColumnPanel(
      store,
      columns,
      data,
      undefined,
      onPivotConfigChange,
    )
    const el = panel.getContainer()
    document.body.appendChild(el)

    const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
    pivotInput.checked = true
    pivotInput.dispatchEvent(new Event('change', { bubbles: true }))

    const queryBtn = Array.from(el.querySelectorAll<HTMLButtonElement>('.vt-pivot-quick-btn'))
      .find(b => b.textContent?.includes('快速查询'))!
    queryBtn.click()

    const qqPanel = el.querySelector<HTMLDivElement>('.vt-quick-query-panel')!
    const cbs = Array.from(qqPanel.querySelectorAll<HTMLInputElement>('.vt-quick-query-dim-checkbox'))
    // 勾选 品类 + 价位段, 跳过 型号 —— 行分组只含勾选字段, 且保持列表顺序
    cbs[0].checked = true  // 品类
    cbs[2].checked = true  // 价位段
    qqPanel.querySelector<HTMLButtonElement>('.vt-quick-query-submit')!.click()

    expect(onPivotConfigChange).toHaveBeenCalledTimes(1)
    const config = onPivotConfigChange.mock.calls[0][0] as IPivotConfig
    expect(config.flatMode).toBe(true)
    // 行分组 = 勾选字段, 按字段列表顺序
    expect(config.rowGroups).toEqual(['品类', '价位段'])
    expect(config.valueFields).toEqual([
      { key: '激活量', aggregation: 'sum', label: '激活量' },
    ])
    expect(config.showSubtotals).toBe(false)

    panel.destroy()
  })

  it('快速查询: 不勾选维度时点查询不触发配置变更', () => {
    const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
    const onPivotConfigChange = vi.fn()

    const panel = createColumnPanel(
      store,
      columns,
      data,
      undefined,
      onPivotConfigChange,
    )
    const el = panel.getContainer()
    document.body.appendChild(el)

    const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
    pivotInput.checked = true
    pivotInput.dispatchEvent(new Event('change', { bubbles: true }))

    const queryBtn = Array.from(el.querySelectorAll<HTMLButtonElement>('.vt-pivot-quick-btn'))
      .find(b => b.textContent?.includes('快速查询'))!
    queryBtn.click()

    const qqPanel = el.querySelector<HTMLDivElement>('.vt-quick-query-panel')!
    qqPanel.querySelector<HTMLButtonElement>('.vt-quick-query-submit')!.click()

    expect(onPivotConfigChange).not.toHaveBeenCalled()
    // 出现轻提示
    expect(qqPanel.querySelector('.vt-quick-query-toast')).toBeTruthy()

    panel.destroy()
  })
})

/**
 * PivotTable 扁平模式渲染测试 (happy-dom)
 *
 * 验证: flatMode 下不产出树形组头, 相邻行同值重复出现 (不合并),
 *       冻结区每个勾选字段一列, 末尾总计行存在。
 */
describe('PivotTable flatMode 渲染', () => {
  const columns: IColumn[] = [
    { key: '品类', title: '品类', width: 100 },
    { key: '型号', title: '型号', width: 100 },
    { key: '激活量', title: '激活量', width: 100, summaryType: 'sum' },
  ]
  const data = [
    { 品类: '护耳耳机', 型号: 'E2S', 激活量: 100 },
    { 品类: '护耳耳机', 型号: 'E2S', 激活量: 150 },
    { 品类: '电话手表', 型号: 'Z6A', 激活量: 200 },
    { 品类: '电话手表', 型号: 'Z9', 激活量: 40 },
  ]

  const config: IPivotConfig = {
    enabled: true,
    flatMode: true,
    rowGroups: ['品类', '型号'],
    valueFields: [{ key: '激活量', aggregation: 'sum' }],
  }

  it('渲染扁平行: 同值不合并, 每行字段平铺, 末尾总计', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    const table = new PivotTable(config, columns, data)
    table.mount(host)

    // 冻结区行: 每个勾选字段一列
    const frozenRows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-cell'))
    // 可视区应包含组合行 (品类/型号 平铺)
    const frozenTexts = frozenRows.map(c => c.textContent).filter(Boolean)
    expect(frozenTexts.length).toBeGreaterThan(0)

    // 断言相邻同值重复: 电话手表 出现多次 (不合并)
    const phoneCount = frozenTexts.filter(t => t === '电话手表').length
    expect(phoneCount).toBeGreaterThan(1)

    // 总计行存在
    const grandTotal = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-row-grandtotal'))
    expect(grandTotal.length).toBeGreaterThan(0)
    const totalTexts = grandTotal.map(c => c.textContent).filter(Boolean)
    expect(totalTexts.some(t => t === '总计')).toBe(true)

    // 扁平模式冻结区宽度 = 字段数 * 120
    const frozenCol = host.querySelector<HTMLDivElement>('.vt-pivot-frozen-col')!
    expect(frozenCol.style.width).toBe('240px')

    table.destroy()
    host.remove()
  })
})
