// 对标 ag-grid 透视面板体验: 勾选列表搜索过滤 + 拖回字段池移除
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTableStore } from '@/table/state/createTableStore'
import { createColumnPanel } from '@/table/panel/panels/ColumnPanel'
import type { IColumn, IPivotConfig } from '@/types'

function openPivotPanel(): { panel: any; el: HTMLElement; onConfig: ReturnType<typeof vi.fn>; columns: IColumn[] } {
  const columns: IColumn[] = [
    { key: '省', title: '省' },
    { key: '城市', title: '城市' },
    { key: '门店', title: '门店' },
    { key: '金额', title: '金额', summaryType: 'sum' },
  ]
  const data: Record<string, any>[] = [
    { 省: '广东', 城市: '广州', 门店: '店A', 金额: 100 },
    { 省: '广东', 城市: '深圳', 门店: '店B', 金额: 200 },
    { 省: '浙江', 城市: '杭州', 门店: '店C', 金额: 50 },
  ]
  const onConfig = vi.fn()
  const store = createTableStore({ columns, mode: 'client', frozenCount: 0 })
  const panel = createColumnPanel(store, columns, data, undefined, onConfig)
  const el = panel.getContainer()
  document.body.appendChild(el)
  const pivotInput = el.querySelector<HTMLInputElement>('.vt-pivot-switch-input')!
  pivotInput.checked = true
  pivotInput.dispatchEvent(new Event('change', { bubbles: true }))
  return { panel, el, onConfig, columns }
}

describe('ColumnPanel: 对标 ag-grid 拖拽面板体验', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    localStorage.clear()
  })

  it('勾选列表带搜索框, 输入过滤字段项', () => {
    const { el } = openPivotPanel()
    const search = el.querySelector<HTMLInputElement>('.vt-px-checkbox-search')
    expect(search).toBeTruthy()

    const items = () => Array.from(el.querySelectorAll<HTMLElement>('.vt-px-checkbox-item'))
    expect(items().length).toBe(4)

    search!.value = '门店'
    search!.dispatchEvent(new Event('input'))
    const visible = items().filter(i => i.style.display !== 'none')
    expect(visible.length).toBe(1)
    expect(visible[0].dataset.fieldTitle).toBe('门店')

    search!.value = ''
    search!.dispatchEvent(new Event('input'))
    expect(items().filter(i => i.style.display !== 'none').length).toBe(4)
  })

  it('把行区字段拖回字段池 → 字段移出该区域', () => {
    const { el, onConfig } = openPivotPanel()
    // 勾选省 → 自动进行区
    const provinceCb = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input'))
      .find(cb => cb.closest('label')!.dataset.fieldTitle === '省')!
    provinceCb.checked = true
    provinceCb.dispatchEvent(new Event('change', { bubbles: true }))
    vi.advanceTimersByTime(350)

    const rowsZone = el.querySelector('[data-zone="rows"]')!
    expect(rowsZone.textContent).toContain('省')

    // 从行区 chip 拖回字段池
    const chip = rowsZone.querySelector<HTMLElement>('.vt-px-chip')!
    const pool = el.querySelector<HTMLElement>('.vt-px-pool-list')!
    // happy-dom DragEvent 不支持 dataTransfer 构造参数 → Event + 注入 mock
    const fireDrag = (target: HTMLElement, type: string) => {
      const ev = new Event(type, { bubbles: true })
      Object.defineProperty(ev, 'dataTransfer', {
        value: { effectAllowed: 'move', dropEffect: 'move' },
        configurable: true,
      })
      target.dispatchEvent(ev)
    }
    fireDrag(chip, 'dragstart')
    fireDrag(pool, 'dragover')
    fireDrag(pool, 'drop')

    expect(rowsZone.textContent).not.toContain('省')
    // 勾选列表同步取消勾选
    const provinceCb2 = Array.from(el.querySelectorAll<HTMLInputElement>('.vt-px-checkbox-item input'))
      .find(cb => cb.closest('label')!.dataset.fieldTitle === '省')!
    expect(provinceCb2.checked).toBe(false)
  })
})
