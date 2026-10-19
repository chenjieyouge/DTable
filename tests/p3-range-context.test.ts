import { describe, it, expect, afterEach, vi } from 'vitest'
import { VirtualTable } from '@/table/VirtualTable'
import type { IUserConfig, IColumn } from '@/types'

/**
 * P3 普通表格 范围选择 + 右键菜单
 * 对标 ag-grid 企业版 Range Selection / Custom Context Menu / Clipboard
 */
const created: VirtualTable[] = []
afterEach(() => {
  for (const t of created) { try { t.destroy() } catch { /* noop */ } }
  created.length = 0
  document.body.innerHTML = ''
  localStorage.clear()
})

function mockSize(el: HTMLElement, w: number, h: number) {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: h, configurable: true })
}
const nextFrames = (n = 6) =>
  new Promise<void>((resolve) => {
    let left = n
    const tick = () => { if (--left <= 0) return resolve(); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })

const columns: IColumn[] = [
  { key: 'region', title: '地区', width: 90, filter: { type: 'set' } },
  { key: 'name', title: '姓名', width: 90, filter: { type: 'text' } },
  { key: 'amount', title: '金额', width: 90, summaryType: 'sum' },
]
const data = [
  { region: '广东', name: '张三', amount: 100 },
  { region: '广东', name: '李四', amount: 200 },
  { region: '浙江', name: '王五', amount: 50 },
  { region: '浙江', name: '张三', amount: 80 },
]

async function mount() {
  const h = document.createElement('div')
  document.body.appendChild(h)
  const table = new VirtualTable({
    container: h,
    columns,
    initialData: data,
    tableHeight: 600,
    rowHeight: 28,
    frozenColumns: 1,
    pageSize: 100,
    showToolbar: false,
  } as IUserConfig)
  await table.ready
  created.push(table)
  const sc = h.querySelector<HTMLDivElement>('.vt-table-container')!
  mockSize(sc, 900, 600)
  ;(table as any).viewport.updateVisibleRows()
  await nextFrames(8)
  return { host: h, table, sc }
}

/** 找到第 row 行、指定列 key 的单元格 */
function findCell(host: HTMLElement, row: number, key: string): HTMLDivElement {
  const rows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-virtual-row'))
    .filter(r => r.style.display !== 'none')
  return rows[row]!.querySelector<HTMLDivElement>(`.vt-table-cell[data-column-key="${key}"]`)!
}

describe('P3: 范围选择', () => {
  it('按下单元格 → 活动单元格高亮', async () => {
    const { host } = await mount()
    const cell = findCell(host, 0, 'region')
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(cell.classList.contains('vt-cell-range-active')).toBe(true)
  })

  it('Shift+按下另一单元格 → 矩形多格高亮', async () => {
    const { host } = await mount()
    const a = findCell(host, 0, 'region')
    const b = findCell(host, 1, 'name')
    a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }))
    const rangeCells = host.querySelectorAll('.vt-cell-range')
    expect(rangeCells.length).toBeGreaterThan(0)
  })

  it('Ctrl+A 全选所有行列', async () => {
    const { host } = await mount()
    const cell = findCell(host, 0, 'region')
    cell.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, ctrlKey: true, key: 'a',
    }))
    const rangeCells = host.querySelectorAll('.vt-cell-range')
    expect(rangeCells.length).toBeGreaterThan(0)
  })

  it('Esc 清空选区', async () => {
    const { host } = await mount()
    const cell = findCell(host, 0, 'region')
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    cell.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    expect(host.querySelectorAll('.vt-cell-range, .vt-cell-range-active').length).toBe(0)
  })
})

describe('P3: 复制 (Clipboard)', () => {
  it('Ctrl+C 复制选区为 TSV', async () => {
    const { host } = await mount()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText }, configurable: true,
    })
    const a = findCell(host, 0, 'region')
    const b = findCell(host, 1, 'amount')
    a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }))
    a.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true, ctrlKey: true, key: 'c',
    }))
    expect(writeText).toHaveBeenCalled()
    const tsv = writeText.mock.calls[0][0] as string
    expect(tsv).toContain('广东')
    expect(tsv.split('\n').length).toBeGreaterThan(1)
  })
})

describe('P3: 右键菜单', () => {
  it('表体右键 → 菜单出现 (复制/固定/隐藏/全选)', async () => {
    const { host } = await mount()
    const cell = findCell(host, 0, 'name')
    cell.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, clientX: 100, clientY: 100,
    }))
    const menu = document.querySelector('.vt-context-menu')
    expect(menu).toBeTruthy()
    const labels = Array.from(menu!.querySelectorAll('.vt-context-menu-item')).map(i => i.textContent)
    expect(labels).toContain('复制')
    expect(labels).toContain('全选')
    expect(labels.some(l => l?.includes('隐藏'))).toBe(true)
  })

  it('表头右键 → 排序/固定/列宽/隐藏/重置', async () => {
    const { host } = await mount()
    const header = host.querySelector<HTMLDivElement>('.vt-header-cell[data-column-key="name"]')!
    header.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, clientX: 100, clientY: 100,
    }))
    const menu = document.querySelector('.vt-context-menu')!
    const labels = Array.from(menu.querySelectorAll('.vt-context-menu-item')).map(i => i.textContent)
    expect(labels).toContain('升序')
    expect(labels).toContain('降序')
    expect(labels).toContain('列宽自适应')
    expect(labels).toContain('重置列')
  })

  it('表头右键「隐藏列」→ 该列从数据区消失', async () => {
    const { host } = await mount()
    const header = host.querySelector<HTMLDivElement>('.vt-header-cell[data-column-key="name"]')!
    header.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, clientX: 100, clientY: 100,
    }))
    const items = Array.from(document.querySelectorAll<HTMLDivElement>('.vt-context-menu-item'))
    const hideItem = items.find(i => i.textContent === '隐藏列')!
    hideItem.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextFrames(6)
    const remaining = host.querySelectorAll('.vt-table-cell[data-column-key="name"]')
    expect(remaining.length).toBe(0)
  })
})
