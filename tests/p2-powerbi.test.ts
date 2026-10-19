import { describe, it, expect, afterEach } from 'vitest'
import { PivotTable } from '@/table/pivot/PivotTable'
import { createColumnPanel } from '@/table/panel/panels/ColumnPanel'
import { createTableStore } from '@/table/state/createTableStore'
import type { IPivotConfig } from '@/types/pivot'
import type { IColumn } from '@/types'

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
})

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

function mountPivot(config: IPivotConfig) {
  const table = new PivotTable(config, columns, data)
  const host = document.createElement('div')
  document.body.appendChild(host)
  table.mount(host)
  return { table, host }
}

describe('P2: 条件格式', () => {
  it('色阶: 数据单元格按值着色 (背景 rgb)', () => {
    const { host } = mountPivot({
      enabled: true,
      rowGroups: ['省', '城市'],
      valueFields: [{ key: '金额', aggregation: 'sum' }],
      conditionalFormat: 'colorScale',
    })
    const dataCells = Array.from(
      host.querySelectorAll<HTMLDivElement>('.vt-pivot-scroll-row .vt-table-cell')
    )
    const colored = dataCells.filter(c => /^rgb\(/.test(c.style.backgroundColor))
    expect(colored.length).toBeGreaterThan(0)
  })

  it('数据条: 数据单元格填充横向渐变条', () => {
    const { host } = mountPivot({
      enabled: true,
      rowGroups: ['省', '城市'],
      valueFields: [{ key: '金额', aggregation: 'sum' }],
      conditionalFormat: 'dataBar',
    })
    const dataCells = Array.from(
      host.querySelectorAll<HTMLDivElement>('.vt-pivot-scroll-row .vt-table-cell')
    )
    const barred = dataCells.filter(c => c.style.background.includes('linear-gradient'))
    expect(barred.length).toBeGreaterThan(0)
  })

  it('小计/总计不参与条件格式', () => {
    const { host } = mountPivot({
      enabled: true,
      rowGroups: ['省', '城市'],
      valueFields: [{ key: '金额', aggregation: 'sum' }],
      conditionalFormat: 'colorScale',
    })
    const totalCells = Array.from(
      host.querySelectorAll<HTMLDivElement>('.vt-pivot-row-subtotal .vt-table-cell, .vt-pivot-row-grandtotal .vt-table-cell')
    )
    const coloredTotal = totalCells.filter(c => /^rgb\(/.test(c.style.backgroundColor))
    expect(coloredTotal.length).toBe(0)
  })
})

describe('P2: 列总计', () => {
  it('有列分组时最右侧生成总计列, 值为跨列全部聚合', () => {
    const { host } = mountPivot({
      enabled: true,
      rowGroups: ['省'],
      colGroups: ['城市'],
      valueFields: [{ key: '金额', aggregation: 'sum' }],
      showColGrandTotal: true,
    })
    // 表头出现"总计"分组
    const headerCells = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-header-cell'))
    expect(headerCells.some(c => c.textContent === '总计')).toBe(true)
    // 数据行: 存在 total 单元格 (带 total header 标记的列)
    const totalHeaderCells = host.querySelectorAll('.vt-pivot-total-header-cell')
    expect(totalHeaderCells.length).toBeGreaterThan(0)
  })

  it('关闭 showColGrandTotal 时不出现总计列', () => {
    const { host } = mountPivot({
      enabled: true,
      rowGroups: ['省'],
      colGroups: ['城市'],
      valueFields: [{ key: '金额', aggregation: 'sum' }],
      showColGrandTotal: false,
    })
    const headerCells = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-header-cell'))
    expect(headerCells.some(c => c.textContent === '总计')).toBe(false)
  })
})

describe('P2: 钻取 Drill Up/Down', () => {
  it('双击组行钻取, 只展开本分支, 出现钻取条', () => {
    const { host } = mountPivot({
      enabled: true,
      rowGroups: ['省', '城市'],
      valueFields: [{ key: '金额', aggregation: 'sum' }],
    })
    const drillBar = host.querySelector<HTMLDivElement>('.vt-pivot-drillbar')
    expect(drillBar!.style.display).toBe('none')

    // 找到"广东"分组行 (冻结区)
    const groupRows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row.vt-pivot-group-row'))
    const guangdong = groupRows.find(r => r.textContent?.includes('广东'))!
    guangdong.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    // 钻取条出现
    expect(drillBar!.style.display).toBe('flex')
    // 浙江分支隐藏
    const groupLabels = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row'))
      .filter(r => r.style.display !== 'none')
    expect(groupLabels.some(r => r.textContent?.includes('浙江'))).toBe(false)
  })

  it('向上钻取恢复全部', () => {
    const { host } = mountPivot({
      enabled: true,
      rowGroups: ['省', '城市'],
      valueFields: [{ key: '金额', aggregation: 'sum' }],
    })
    const groupRows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row.vt-pivot-group-row'))
    const guangdong = groupRows.find(r => r.textContent?.includes('广东'))!
    guangdong.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    const upBtn = host.querySelector<HTMLButtonElement>('.vt-pivot-drillbar-up')!
    upBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(host.querySelector<HTMLDivElement>('.vt-pivot-drillbar')!.style.display).toBe('none')
    const labels = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row'))
    expect(labels.some(r => r.textContent?.includes('浙江'))).toBe(true)
  })
})

describe('P2: 布局预设 (面板)', () => {
  it('紧凑布局 → 配置 flatMode=true, 无小计', async () => {
    const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
    let captured: IPivotConfig | null = null
    const panel = createColumnPanel(store, columns, data, undefined, (c) => { captured = c })
    const el = panel.getContainer()
    document.body.appendChild(el)

    // 开启 pivot
    const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
    pivotInput.checked = true
    pivotInput.dispatchEvent(new Event('change', { bubbles: true }))

    // 勾选 省(文本→行) + 金额(数值→值)
    const fieldCbs = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input[type="checkbox"]'))
    const 省Cb = fieldCbs.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('省'))!
    const 金额Cb = fieldCbs.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('金额'))!
    省Cb.checked = true; 省Cb.dispatchEvent(new Event('change', { bubbles: true }))
    金额Cb.checked = true; 金额Cb.dispatchEvent(new Event('change', { bubbles: true }))

    // 点紧凑
    const segBtns = Array.from(el.querySelectorAll<HTMLButtonElement>('.vt-px-seg-btn'))
    const compact = segBtns.find(b => b.textContent === '紧凑')!
    compact.click()
    await new Promise(r => setTimeout(r, 350))
    expect(captured).toBeTruthy()
    expect(captured!.flatMode).toBe(true)
    expect(captured!.showSubtotals).toBe(false)
  })

  it('条件格式分段 → 配置带上 colorScale', async () => {
    const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
    let captured: IPivotConfig | null = null
    const panel = createColumnPanel(store, columns, data, undefined, (c) => { captured = c })
    const el = panel.getContainer()
    document.body.appendChild(el)
    const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
    pivotInput.checked = true
    pivotInput.dispatchEvent(new Event('change', { bubbles: true }))

    // 勾选 省(文本→行) + 金额(数值→值)
    const fieldCbs = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input[type="checkbox"]'))
    const 省Cb = fieldCbs.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('省'))!
    const 金额Cb = fieldCbs.find(c => c.closest('.vt-px-checkbox-item')?.textContent?.includes('金额'))!
    省Cb.checked = true; 省Cb.dispatchEvent(new Event('change', { bubbles: true }))
    金额Cb.checked = true; 金额Cb.dispatchEvent(new Event('change', { bubbles: true }))

    // 有多个分段组 (布局预设 + 条件格式), 定位"色阶"
    const segBtns = Array.from(el.querySelectorAll<HTMLButtonElement>('.vt-px-seg-btn'))
    const colorScale = segBtns.filter(b => b.textContent === '色阶')[0]
    colorScale.click()
    await new Promise(r => setTimeout(r, 350))
    expect(captured!.conditionalFormat).toBe('colorScale')
  })
})
