import { describe, it, expect, vi, afterEach } from 'vitest'
import { PivotTable } from '@/table/pivot/PivotTable'
import type { IPivotConfig } from '@/types/pivot'
import type { IColumn } from '@/types'

/**
 * P4 键盘导航补齐 + 列宽拖拽回归测试:
 * 1. Ctrl+A 全选 (矩形选区覆盖全部行)
 * 2. Home / End / Ctrl+Home / Ctrl+End
 * 3. PageUp / PageDown 翻页
 * 4. Esc 清除选区
 * 5. 表头拖拽调整列宽 → 数据行宽度变化 + localStorage 持久化
 */

function mountPivot(config: IPivotConfig, columns: IColumn[], data: Record<string, any>[]) {
  const table = new PivotTable(config, columns, data)
  const host = document.createElement('div')
  document.body.appendChild(host)
  table.mount(host)
  return { table, host }
}

const isDataRow = (r: Element) =>
  !r.classList.contains('vt-pivot-group-row') && !r.classList.contains('vt-pivot-row-subtotal')

describe('P4 Excel 级键盘导航补齐', () => {
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

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('Ctrl+A 全选 → 所有可见数据行整行高亮', () => {
    const { host } = mountPivot(config, columns, data)

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true }))

    const allRows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row'))
    const highlighted = allRows.filter(r => r.querySelector('.vt-pivot-cell-selected')).length
    // 全选后每个可见行都有高亮 (组行/小计也包含在内)
    expect(highlighted).toBe(allRows.length)
  })

  it('Home / End 跳行首列/末列, Ctrl+Home / Ctrl+End 跳首行/末行', () => {
    const { host } = mountPivot(config, columns, data)

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    // End → 末列 (值列, 高亮落在滚动区行)
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(host.querySelector('.vt-pivot-frozen-row .vt-pivot-cell-selected')).toBeFalsy()
    expect(host.querySelector('.vt-pivot-scroll-row .vt-pivot-cell-selected')).toBeTruthy()

    // Home → 首列 (高亮回到冻结区)
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(host.querySelector('.vt-pivot-frozen-row .vt-pivot-cell-selected')).toBeTruthy()
    expect(host.querySelector('.vt-pivot-scroll-row .vt-pivot-cell-selected')).toBeFalsy()
  })

  it('Ctrl+End 滚到末行, Ctrl+Home 滚回首行 (scrollToSelection)', () => {
    const { host } = mountPivot(config, columns, data)

    const dataRow2 = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow2.click()

    const body2 = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    const sc = host.querySelector<HTMLElement>('.vt-pivot-scroll-container')!

    body2.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }))
    expect(sc.scrollTop).toBeGreaterThan(0)

    body2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true }))
    expect(sc.scrollTop).toBe(0)
  })

  it('PageDown / PageUp 翻页移动选中', () => {
    const { host } = mountPivot(config, columns, data)

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()
    const before = dataRow.textContent

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))

    const selRows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row'))
      .filter(r => r.querySelector('.vt-pivot-cell-selected'))
    expect(selRows.length).toBe(1)
    // 数据仅 4 行, 翻页应已到末行
    expect(selRows[0]?.textContent).not.toBe(before)
  })

  it('Esc 清除选区高亮', () => {
    const { host } = mountPivot(config, columns, data)

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()
    expect(dataRow.querySelector('.vt-pivot-cell-selected')).toBeTruthy()

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    const highlighted = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-cell-selected'))
    expect(highlighted.length).toBe(0)
  })
})

describe('P4 透视状态栏信息反馈', () => {
  const columns: IColumn[] = [
    { key: '省', title: '省' },
    { key: '城市', title: '城市' },
    { key: '金额', title: '金额' },
  ]
  const data = [
    { 省: '广东', 城市: '广州', 金额: 100 },
    { 省: '广东', 城市: '深圳', 金额: 200 },
    { 省: '浙江', 城市: '杭州', 金额: 50 },
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

  it('初始显示共N行+分组数, 点击选中后显示已选RxC', () => {
    const { host } = mountPivot(config, columns, data)
    const bar = host.querySelector<HTMLElement>('.vt-pivot-statusbar')!
    expect(bar.textContent).toContain('共')
    expect(bar.textContent).toContain('行')

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()
    expect(bar.textContent).toContain('已选 1 行 × 1 列')
  })

  it('Shift 扩展选区后状态栏更新行×列数', () => {
    const { host } = mountPivot(config, columns, data)
    const bar = host.querySelector<HTMLElement>('.vt-pivot-statusbar')!

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }))
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))

    expect(bar.textContent).toContain('已选 2 行 × 2 列')
  })

  it('Esc 清除选区后状态栏回到纯统计', () => {
    const { host } = mountPivot(config, columns, data)
    const bar = host.querySelector<HTMLElement>('.vt-pivot-statusbar')!

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()
    expect(bar.textContent).toContain('已选')

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(bar.textContent).not.toContain('已选')
  })
})

describe('P4 透视表列宽拖拽 (Excel 式)', () => {
  const columns: IColumn[] = [
    { key: '省', title: '省' },
    { key: '城市', title: '城市' },
    { key: '金额', title: '金额' },
  ]
  const data = [
    { 省: '广东', 城市: '广州', 金额: 100 },
    { 省: '广东', 城市: '深圳', 金额: 200 },
  ]
  const config: IPivotConfig = {
    enabled: true,
    rowGroups: ['省', '城市'],
    valueFields: [{ key: '金额', aggregation: 'sum' }],
  }

  afterEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('拖值列表头右缘 → 数据行值单元格变宽 + 持久化', () => {
    const { host } = mountPivot(config, columns, data)

    const valueHeader = host.querySelector<HTMLElement>('.vt-pivot-scroll-header-area .vt-pivot-header-cell')!
    const resizer = valueHeader.querySelector<HTMLElement>('.vt-pivot-resizer')
    expect(resizer).toBeTruthy()

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    const valueCell = host.querySelector<HTMLElement>('.vt-pivot-scroll-row .vt-table-cell')!
    const beforeW = parseFloat(valueCell.style.width) || 120

    // mousedown + mousemove (+60px) + mouseup
    resizer!.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    // 拖拽期间数据行已实时变宽 (260 = 200+60 → 新宽 180)
    const afterW = parseFloat(valueCell.style.width) || 120
    expect(afterW).toBeGreaterThan(beforeW)

    // mouseup 后 refresh 重建, 且 localStorage 已保存新宽
    const saved = JSON.parse(localStorage.getItem('dtable.pivot.widths') || '{}')
    expect(saved.value).toBe(beforeW + 60)
  })

  it('拖行组列表头右缘 → 冻结区总宽变宽', () => {
    const { host } = mountPivot(config, columns, data)

    const frozenHeader = host.querySelector<HTMLElement>('.vt-pivot-frozen-header .vt-pivot-header-cell')!
    const resizer = frozenHeader.querySelector<HTMLElement>('.vt-pivot-resizer')
    expect(resizer).toBeTruthy()

    const before = host.querySelector<HTMLElement>('.vt-pivot-frozen-col')?.style.width

    resizer!.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 190, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))

    const saved = JSON.parse(localStorage.getItem('dtable.pivot.widths') || '{}')
    expect(saved.rowGroup).toBe(130 + 90) // 默认 130 + 拖 90
    expect(before).not.toBe(host.querySelector<HTMLElement>('.vt-pivot-frozen-col')?.style.width)
  })
})
