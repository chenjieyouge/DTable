import { describe, it, expect, vi, afterEach } from 'vitest'
import { PivotTable } from '@/table/pivot/PivotTable'
import type { IPivotConfig } from '@/types/pivot'
import type { IColumn } from '@/types'

/**
 * P1 Excel 级交互回归测试:
 * 1. 点击数据单元格 → 选中高亮
 * 2. 方向键导航移动选中
 * 3. Shift+方向键 扩展选区 (多格高亮)
 * 4. Enter 折叠选中的组行
 * 5. Ctrl+C 复制选区 (TSV)
 * 注: showSubtotals=true 时 flatRows 顺序为 组行/小计/数据行 交错,
 *     第一个数据行是「广东广州」(flatRows[4])。
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

describe('P1 Excel 级交互', () => {
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

  it('点击数据单元格 → 该格获得选中高亮', () => {
    const { host } = mountPivot(config, columns, data)

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    expect(dataRow.textContent).toContain('广东')
    dataRow.click()

    const frozenSel = dataRow.querySelector<HTMLDivElement>('.vt-pivot-cell-selected')
    expect(frozenSel).toBeTruthy()
  })

  it('方向键导航移动选中单元格', () => {
    const { host } = mountPivot(config, columns, data)

    const dataRows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).filter(isDataRow)
    dataRows[0]!.click() // 广东广州 (flatRows[4])

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.focus()
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))

    // 选中行已移动: 高亮行数量 = 1, 且不再是广州行
    const allRows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row'))
    const selRows = allRows.filter(r => r.querySelector('.vt-pivot-cell-selected'))
    expect(selRows.length).toBe(1)
    expect(selRows[0]?.textContent).not.toContain('广东广州')
  })

  it('Shift+方向键扩展选区 (多格高亮)', () => {
    const { host } = mountPivot(config, columns, data)

    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }))

    const allRows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row'))
    const highlighted = allRows.filter(r => r.querySelector('.vt-pivot-cell-selected')).length
    expect(highlighted).toBeGreaterThanOrEqual(2)
  })

  it('Enter 折叠选中的组行 (键盘路径)', () => {
    const { host } = mountPivot(config, columns, data)
    expect(host.textContent).toContain('广东广州')

    // 选中第一个数据行 (广东广州, flatRows[4]), ArrowUp 到小计行再上到 广州组行 (flatRows[2])
    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    // 广州组折叠 → 广东广州数据行消失
    expect(host.textContent).not.toContain('广东广州')
  })

  it('Ctrl+C 复制选区为 TSV (扩展两列后)', () => {
    const clipboardSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardSpy },
      configurable: true,
    })

    const { host } = mountPivot(config, columns, data)

    // 点选第一个数据行第 1 列 (省), Shift+Right 扩展 1 列 (城市)
    const dataRow = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-pivot-frozen-row')).find(isDataRow)!
    dataRow.click()

    const body = host.querySelector<HTMLDivElement>('.vt-pivot-body-container')!
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }))
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }))

    expect(clipboardSpy).toHaveBeenCalled()
    const text = clipboardSpy.mock.calls[0]?.[0] as string
    expect(text).toContain('广东')
    expect(text).toContain('广州')
  })
})
