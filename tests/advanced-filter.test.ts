import { describe, it, expect, vi, afterEach } from 'vitest'
import { VirtualTable } from '@/table/VirtualTable'
import { ClientDataStrategy } from '@/table/data/ClientDataStrategy'
import { AdvancedFilterBar } from '@/table/filterbar/AdvancedFilterBar'
import {
  matchAdvancedFilter,
  inferColumnKind,
  getOperators,
  emptyJoin,
} from '@/table/interaction/advancedFilter'
import type { IUserConfig, IColumn, IJoinAdvancedFilter } from '@/types'

// ---------- 公共数据 ----------
const columns: IColumn[] = [
  { key: 'region', title: '地区', width: 100, filter: { type: 'set' } },
  { key: 'name', title: '名称', width: 120, filter: { type: 'set' } },
  { key: 'amount', title: '金额', width: 100, filter: { type: 'numberRange' } },
  { key: 'date', title: '日期', width: 120, filter: { type: 'dateRange' } },
]
const rows = [
  { region: '华东', name: '张三', amount: 100, date: '2024-01-05' },
  { region: '华南', name: '李四', amount: 300, date: '2024-02-10' },
  { region: '华北', name: '王五', amount: 50, date: '2024-03-20' },
  { region: '华东', name: '赵六', amount: 500, date: '2024-04-01' },
]

const createdTables: VirtualTable[] = []
afterEach(() => {
  for (const t of createdTables) { try { t.destroy() } catch { /* noop */ } }
  createdTables.length = 0
  document.body.innerHTML = ''
})

// =====================================================
// 1. 类型推断 / 操作符
// =====================================================
describe('高级筛选: 类型推断与操作符', () => {
  it('按 filter 配置推断 text/number/date', () => {
    expect(inferColumnKind(columns[0])).toBe('text')
    expect(inferColumnKind(columns[2])).toBe('number')
    expect(inferColumnKind(columns[3])).toBe('date')
  })
  it('各类型操作符非空, 区间操作符带第二个值', () => {
    expect(getOperators('text').length).toBe(6)
    expect(getOperators('number').length).toBe(7)
    expect(getOperators('date').length).toBe(6)
    expect(getOperators('number').find(o => o.value === 'inRange')?.range).toBe(true)
  })
})

// =====================================================
// 2. 求值器
// =====================================================
describe('高级筛选: 求值器', () => {
  it('空模型 / 空 join 恒真', () => {
    expect(matchAdvancedFilter(rows[0], null)).toBe(true)
    expect(matchAdvancedFilter(rows[0], emptyJoin('AND'))).toBe(true)
  })

  it('文本: 包含 / 等于 / 开头', () => {
    const f = (type: any, val: string) =>
      matchAdvancedFilter(rows[0], { filterType: 'text', colId: 'region', type, filter: val })
    expect(f('contains', '华')).toBe(true)
    expect(f('contains', '南')).toBe(false)
    expect(f('notContains', '南')).toBe(true)
    expect(f('equals', '华东')).toBe(true)
    expect(f('startsWith', '华')).toBe(true)
    expect(f('endsWith', '东')).toBe(true)
  })

  it('数值: 比较与区间', () => {
    const cmp = (type: any, filter?: number, filterTo?: number) =>
      matchAdvancedFilter(rows[1], { filterType: 'number', colId: 'amount', type, filter, filterTo })
    expect(cmp('greaterThan', 200)).toBe(true)
    expect(cmp('lessThan', 200)).toBe(false)
    expect(cmp('inRange', 200, 400)).toBe(true)
    expect(cmp('inRange', 400, 600)).toBe(false)
  })

  it('日期: 比较与区间', () => {
    const cmp = (type: any, filter?: string, filterTo?: string) =>
      matchAdvancedFilter(rows[1], { filterType: 'date', colId: 'date', type, filter, filterTo })
    expect(cmp('greaterThan', '2024-01-01')).toBe(true)
    expect(cmp('lessThan', '2024-01-01')).toBe(false)
    expect(cmp('inRange', '2024-02-01', '2024-02-28')).toBe(true)
  })

  it('AND: 跨字段同时满足', () => {
    const model: IJoinAdvancedFilter = {
      filterType: 'join',
      type: 'AND',
      conditions: [
        { filterType: 'text', colId: 'region', type: 'equals', filter: '华东' },
        { filterType: 'number', colId: 'amount', type: 'greaterThan', filter: 200 },
      ],
    }
    const result = rows.filter(r => matchAdvancedFilter(r, model))
    expect(result.length).toBe(1)
    expect(result[0].name).toBe('赵六')
  })

  it('OR: 满足任一即可', () => {
    const model: IJoinAdvancedFilter = {
      filterType: 'join',
      type: 'OR',
      conditions: [
        { filterType: 'text', colId: 'region', type: 'equals', filter: '华南' },
        { filterType: 'number', colId: 'amount', type: 'lessThan', filter: 60 },
      ],
    }
    const result = rows.filter(r => matchAdvancedFilter(r, model))
    expect(result.map(r => r.name).sort()).toEqual(['李四', '王五'])
  })

  it('树形嵌套 join (为方案 B 预留)', () => {
    const model: IJoinAdvancedFilter = {
      filterType: 'join',
      type: 'AND',
      conditions: [
        { filterType: 'text', colId: 'region', type: 'contains', filter: '华' },
        {
          filterType: 'join',
          type: 'OR',
          conditions: [
            { filterType: 'number', colId: 'amount', type: 'greaterThan', filter: 400 },
            { filterType: 'text', colId: 'name', type: 'equals', filter: '李四' },
          ],
        },
      ],
    }
    const result = rows.filter(r => matchAdvancedFilter(r, model))
    expect(result.map(r => r.name)).toEqual(['李四', '赵六'])
  })
})

// =====================================================
// 3. 数据层: 与列筛选共存 (AND)
// =====================================================
describe('高级筛选: 数据层共存', () => {
  it('列筛选与高级筛选同时生效 (AND)', async () => {
    const strategy = new ClientDataStrategy(rows, columns)
    await strategy.applyQuery({
      columnFilters: {
        region: { kind: 'set', values: ['华东', '华南', '华北'] },
      },
      advancedFilter: {
        filterType: 'join',
        type: 'AND',
        conditions: [
          { filterType: 'number', colId: 'amount', type: 'greaterThan', filter: 80 },
        ],
      },
    })
    // 列筛选保留全部 4 行; 金额 >80: 张三100 李四300 赵六500 (王五50)
    expect(strategy.getAllData().map(r => r.name).sort()).toEqual(['张三', '李四', '赵六'])
  })
})

// =====================================================
// 4. 条件条 UI
// =====================================================
describe('高级筛选: 条件条 UI', () => {
  function createBar() {
    const onApply = vi.fn()
    const bar = new AdvancedFilterBar(columns, { onApply })
    document.body.appendChild(bar.el)
    bar.toggle(true)
    return { bar, onApply }
  }

  it('添加条件后生成一行', () => {
    const { bar } = createBar()
    bar.addCondition()
    expect(bar.el.querySelectorAll('.vt-af-row').length).toBe(1)
    bar.addCondition()
    expect(bar.el.querySelectorAll('.vt-af-row').length).toBe(2)
  })

  it('移除条件', () => {
    const { bar } = createBar()
    bar.addCondition(); bar.addCondition()
    bar.el.querySelector<HTMLButtonElement>('.vt-af-remove')!.click()
    expect(bar.el.querySelectorAll('.vt-af-row').length).toBe(1)
  })

  it('清空所有条件', () => {
    const { bar } = createBar()
    bar.addCondition()
    bar.el.querySelector<HTMLButtonElement>('.vt-af-clear')!.click()
    expect(bar.el.querySelectorAll('.vt-af-row').length).toBe(0)
  })

  it('切换 AND/OR 分段', () => {
    const { bar } = createBar()
    const seg = bar.el.querySelectorAll<HTMLButtonElement>('.vt-af-seg-btn')
    seg[1].click() // OR
    expect(bar.getModel().type).toBe('OR')
    seg[0].click() // AND
    expect(bar.getModel().type).toBe('AND')
  })

  it('切换字段后重建操作符与值', () => {
    const { bar } = createBar()
    bar.addCondition() // 默认第一列 region (text)
    const field = bar.el.querySelector<HTMLSelectElement>('.vt-af-field')!
    field.value = 'amount'
    field.dispatchEvent(new Event('change'))
    const op = bar.el.querySelector<HTMLSelectElement>('.vt-af-operator')!
    // 数值列默认操作符 =
    expect(op.value).toBe('equals')
    expect(bar.getModel().conditions[0]).toMatchObject({ colId: 'amount', filterType: 'number' })
  })

  it('区间操作符显示两个值输入', () => {
    const { bar } = createBar()
    bar.addCondition()
    const field = bar.el.querySelector<HTMLSelectElement>('.vt-af-field')!
    field.value = 'amount'
    field.dispatchEvent(new Event('change'))
    const op = bar.el.querySelector<HTMLSelectElement>('.vt-af-operator')!
    op.value = 'inRange'
    op.dispatchEvent(new Event('change'))
    expect(bar.el.querySelectorAll('.vt-af-value').length).toBe(2)
  })

  it('值输入防抖后 emit (需等待 300ms)', async () => {
    const { bar, onApply } = createBar()
    bar.addCondition()
    const input = bar.el.querySelector<HTMLInputElement>('.vt-af-value')!
    input.value = '华东'
    input.dispatchEvent(new Event('input'))
    // 300ms 防抖, 等 350ms
    await new Promise(r => setTimeout(r, 350))
    expect(onApply).toHaveBeenCalled()
    const last = onApply.mock.calls[onApply.mock.calls.length - 1][0]
    expect(last.conditions[0].filter).toBe('华东')
  })

  it('setModel 恢复条件行', () => {
    const { bar } = createBar()
    bar.setModel({
      filterType: 'join',
      type: 'OR',
      conditions: [
        { filterType: 'number', colId: 'amount', type: 'greaterThan', filter: 100 },
      ],
    })
    expect(bar.el.querySelectorAll('.vt-af-row').length).toBe(1)
    expect(bar.getModel().type).toBe('OR')
  })

  it('展开/收起', () => {
    const { bar } = createBar()
    expect(bar.isOpen()).toBe(true)
    bar.toggle(false)
    expect(bar.isOpen()).toBe(false)
  })
})

// =====================================================
// 5. 端到端: 打开条件条 → 输入条件 → 数据筛选
// =====================================================
describe('高级筛选: 端到端', () => {
  function mockSize(el: HTMLElement, w: number, h: number) {
    Object.defineProperty(el, 'clientWidth', { value: w, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: h, configurable: true })
    Object.defineProperty(el, 'scrollWidth', { value: w, configurable: true })
  }
  const nextFrames = (n = 6) =>
    new Promise<void>((resolve) => {
      let left = n
      const tick = () => { if (--left <= 0) return resolve(); requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })

  it('点击工具条按钮打开条件条, 输入金额条件后筛选', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dataRows = Array.from({ length: 200 }, (_, i) => ({
      region: i % 2 === 0 ? '华东' : '华南',
      amount: i * 10,
    }))
    const table = new VirtualTable({
      container: host,
      columns: [
        { key: 'region', title: '地区', width: 120, filter: { type: 'set' } },
        { key: 'amount', title: '金额', width: 120, filter: { type: 'numberRange' } },
      ],
      initialData: dataRows,
      tableHeight: 600,
      rowHeight: 28,
      pageSize: 1000,
    } as IUserConfig)
    await table.ready
    createdTables.push(table)
    const scroller = host.querySelector<HTMLDivElement>('.vt-table-container')!
    mockSize(scroller, 900, 600)
    ;(table as any).viewport.updateVisibleRows()
    await nextFrames(8)

    // 点击高级筛选按钮 (首次展开会自动补一条空条件)
    const toggleBtn = host.querySelector<HTMLButtonElement>('.vt-advanced-filter-toggle-btn')!
    expect(toggleBtn).toBeTruthy()
    toggleBtn.click()
    expect(host.querySelector('.vt-advanced-filter-bar')?.style.display).toBe('block')

    const bar = host.querySelector<HTMLDivElement>('.vt-advanced-filter-bar')!
    // 首次展开已自动出现一条条件
    expect(bar.querySelectorAll('.vt-af-row').length).toBe(1)
    // 选字段 amount
    const field = bar.querySelector<HTMLSelectElement>('.vt-af-field')!
    field.value = 'amount'
    field.dispatchEvent(new Event('change'))
    // 操作符 >
    const op = bar.querySelector<HTMLSelectElement>('.vt-af-operator')!
    op.value = 'greaterThan'
    op.dispatchEvent(new Event('change'))
    // 值 1000
    const input = bar.querySelector<HTMLInputElement>('.vt-af-value')!
    input.value = '1000'
    input.dispatchEvent(new Event('input'))
    await new Promise(r => setTimeout(r, 350))
    await nextFrames(4)

    // 筛选后 amount > 1000: i*10 > 1000 => i > 100, 共 99 行
    const state = (table as any).store.getState()
    expect(state.data.totalRows).toBe(99)
  })
})
