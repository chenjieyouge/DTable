import { describe, it, expect, afterEach } from 'vitest'
import { VirtualTable } from '@/table/VirtualTable'
import { ClientDataStrategy } from '@/table/data/ClientDataStrategy'
import type { IUserConfig, IColumn } from '@/types'

/**
 * P1 普通表格体验对齐 ag-grid 商业版
 * 快速筛选 / 工具条 / 行选择增强 / 主题 / 斑马纹 / 筛选菜单
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
    rowSelection: { enabled: true },
    enableRangeSelection: false, // 隔离测试行选择 (范围选择在 p3 用例)
    showToolbar: true,
  } as IUserConfig)
  await table.ready
  created.push(table)
  const sc = h.querySelector<HTMLDivElement>('.vt-table-container')!
  mockSize(sc, 900, 600)
  ;(table as any).viewport.updateVisibleRows()
  await nextFrames(8)
  return { host: h, table, sc }
}

// 1. 快速筛选: 拆词 AND (数据层)
describe('P1: 全局快速筛选 (Quick Filter)', () => {
  it('数据层: 空格拆词, 每个词都要命中 (AND)', async () => {
    const strategy = new ClientDataStrategy(data, columns)
    await strategy.applyQuery({ filterText: '张三' } as any)
    expect(strategy.getAllData().length).toBe(2)

    const s2 = new ClientDataStrategy(data, columns)
    await s2.applyQuery({ filterText: '张三 广东' } as any)
    const rows = s2.getAllData()
    expect(rows.length).toBe(1)
    expect(rows[0].name).toBe('张三')
    expect(rows[0].region).toBe('广东')
  })

  it('工具条输入框实时过滤 (debounce)', async () => {
    const { host, sc } = await mount()
    const input = host.querySelector<HTMLInputElement>('.vt-quick-filter-input')!
    expect(input).toBeTruthy()
    input.value = '张三'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 260)) // debounce 180ms
    await nextFrames(6)
    const rows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-virtual-row'))
      .filter(r => !r.classList.contains('vt-row-group'))
    const visible = rows.filter(r => r.style.display !== 'none')
    expect(visible.length).toBe(2)
  })

  it('工具条含搜索框与主题按钮', async () => {
    const { host } = await mount()
    expect(host.querySelector('.vt-toolbar')).toBeTruthy()
    expect(host.querySelector('.vt-theme-toggle-btn')).toBeTruthy()
  })
})

// 2. 行选择增强
describe('P1: 行选择增强 (ag-grid 风格)', () => {
  it('点击行体单选整行, 再点另一行仍只选 1 行', async () => {
    const { host } = await mount()
    const rows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-virtual-row'))
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(host.querySelectorAll('.vt-row-selected').length).toBe(1)
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(host.querySelectorAll('.vt-row-selected').length).toBe(1)
  })

  it('Shift+点击批量选中区间', async () => {
    const { host } = await mount()
    const rows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-virtual-row'))
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    rows[3].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    expect(host.querySelectorAll('.vt-row-selected').length).toBe(4)
  })

  it('复选框仍然可点选', async () => {
    const { host } = await mount()
    const cb = host.querySelector<HTMLInputElement>('.vt-virtual-row .vt-checkbox:not([data-select-all])')!
    cb.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(host.querySelectorAll('.vt-row-selected').length).toBe(1)
  })
})

// 3. 主题系统
describe('P1: 主题系统 (浅色/暗色)', () => {
  it('点击主题按钮切换暗色, 实例根加 class 并持久化', async () => {
    const { host, table } = await mount()
    const instance = host.querySelector<HTMLElement>('.vt-instance') ?? host
    const btn = host.querySelector<HTMLButtonElement>('.vt-theme-toggle-btn')!
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(instance.classList.contains('vt-theme-dark')).toBe(true)
    expect(localStorage.getItem('dtable.theme')).toBe('dark')
    // 再点切回浅色
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(instance.classList.contains('vt-theme-light')).toBe(true)
    expect(table).toBeTruthy()
  })

  it('刷新后恢复上次主题', async () => {
    localStorage.setItem('dtable.theme', 'dark')
    const { host } = await mount()
    const instance = host.querySelector<HTMLElement>('.vt-instance') ?? host
    expect(instance.classList.contains('vt-theme-dark')).toBe(true)
  })
})

// 4. 斑马纹
describe('P1: 斑马纹', () => {
  it('行按行号奇偶带 class', async () => {
    const { host } = await mount()
    const rows = Array.from(host.querySelectorAll<HTMLDivElement>('.vt-virtual-row'))
    expect(rows[0].classList.contains('vt-row-even')).toBe(true)
    expect(rows[1].classList.contains('vt-row-odd')).toBe(true)
    expect(host.querySelector('.vt-table-wrapper.vt-stripe')).toBeTruthy()
  })
})

// 5. 筛选 set 菜单 ag-grid 化
describe('P1: set 筛选菜单 ag-grid 化', () => {
  it('弹窗含搜索 + 全选/清空 + 列表', async () => {
    const { host } = await mount()
    const filterBtn = host.querySelector<HTMLButtonElement>('.vt-col-filter-btn')!
    filterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextFrames(4)
    const popup = host.querySelector<HTMLDivElement>('.vt-col-filter-popup')!
    expect(popup).toBeTruthy()
    expect(popup.querySelector('.vt-filter-search-input')).toBeTruthy()
    const mini = Array.from(popup.querySelectorAll<HTMLButtonElement>('.vt-filter-mini-btn'))
    expect(mini.map(b => b.textContent)).toEqual(['全选', '清空'])
    expect(popup.querySelectorAll('.vt-filter-option').length).toBe(2)
    // 底部按钮: 确定 / 取消
    const foot = Array.from(popup.querySelectorAll<HTMLButtonElement>('button'))
    expect(foot.some(b => b.textContent === '取消')).toBe(true)
  })
})
