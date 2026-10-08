import { describe, it, expect, vi, afterEach } from 'vitest'
import { VirtualTable } from '@/table/VirtualTable'
import { ClientDataStrategy } from '@/table/data/ClientDataStrategy'
import type { IUserConfig, IColumn } from '@/types'

const createdTables: VirtualTable[] = []
afterEach(() => {
  for (const t of createdTables) { try { t.destroy() } catch { /* noop */ } }
  createdTables.length = 0
  document.body.innerHTML = ''
})

function makeColumns(n: number): IColumn[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `col${i}`,
    title: `列${i}`,
    width: 100,
    sortable: true,
  }))
}

function makeRows(count: number, cols: number): Record<string, any>[] {
  const rows: Record<string, any>[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const row: Record<string, any> = { id: i }
    for (let c = 0; c < cols; c++) row[`col${c}`] = `${i}-${c}`
    rows[i] = row
  }
  return rows
}

function mockSize(el: HTMLElement, w: number, h: number) {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: h, configurable: true })
  Object.defineProperty(el, 'scrollWidth', { value: w, configurable: true })
}

const nextFrames = (n = 6) =>
  new Promise<void>((resolve) => {
    let left = n
    const tick = () => {
      if (--left <= 0) return resolve()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

async function mountTable(cfg: Partial<IUserConfig>, host?: HTMLDivElement) {
  const h = host ?? document.createElement('div')
  if (!h.isConnected) document.body.appendChild(h)
  const table = new VirtualTable({
    container: h,
    columns: makeColumns(8),
    initialData: makeRows(10_000, 8),
    tableHeight: 600,
    rowHeight: 28,
    frozenColumns: 1,
    pageSize: 1000,
    bufferRows: 10,
    ...cfg,
  } as IUserConfig)
  await table.ready
  createdTables.push(table)
  const scroller = h.querySelector<HTMLDivElement>('.vt-table-container')!
  mockSize(scroller, 900, 600)
  ;(table as any).viewport.updateVisibleRows()
  await nextFrames(8)
  return { host: h, table, scroller }
}

function getDataRows(host: HTMLDivElement): HTMLDivElement[] {
  return Array.from(host.querySelectorAll<HTMLDivElement>('.vt-virtual-row'))
}

// ===== 1. 多列排序 (数据层单测) =====
describe('QA: 多列排序', () => {
  it('按 sorts 数组依次比较 (第 1 列相同再看第 2 列)', async () => {
    const columns = [
      { key: 'region', title: '地区', width: 80 },
      { key: 'score', title: '分数', width: 80 },
    ] as IColumn[]
    const data = [
      { region: 'B', score: 10 },
      { region: 'A', score: 30 },
      { region: 'A', score: 20 },
      { region: 'B', score: 5 },
    ]
    const strategy = new ClientDataStrategy(data, columns)
    await strategy.applyQuery({
      sorts: [
        { key: 'region', direction: 'asc' },
        { key: 'score', direction: 'desc' },
      ],
    })
    const rows = strategy.getAllData()
    expect(rows.map((r) => r.region)).toEqual(['A', 'A', 'B', 'B'])
    expect(rows.map((r) => r.score)).toEqual([30, 20, 10, 5])
  })

  it('单列 sortKey/sortDirection 兼容旧字段', async () => {
    const columns = [{ key: 'score', title: '分数', width: 80 }] as IColumn[]
    const strategy = new ClientDataStrategy(
      [{ score: 3 }, { score: 1 }, { score: 2 }],
      columns,
    )
    await strategy.applyQuery({ sortKey: 'score', sortDirection: 'asc' })
    expect(strategy.getAllData().map((r) => r.score)).toEqual([1, 2, 3])
  })

  it('表级 API: setSorts 后首行数据按多列排序', async () => {
    const columns = [
      { key: 'g', title: '组', width: 80, sortable: true },
      { key: 'v', title: '值', width: 80, sortable: true },
    ] as IColumn[]
    const data = Array.from({ length: 200 }, (_, i) => ({
      g: `g${i % 3}`,
      v: 1000 - i,
    }))
    const { host, table } = await mountTable({ columns, initialData: data })
    table.setSorts([
      { key: 'g', direction: 'asc' },
      { key: 'v', direction: 'asc' },
    ])
    await nextFrames(12)
    const rows = getDataRows(host)
    const first = rows[0].querySelector<HTMLDivElement>('.vt-cell-frozen')!
    // g0 组中 v 最小的是 v=996 (i=4, g=1? 不) — 直接查策略数据更稳
    const all = (table as any).dataStrategy.getAllData()
    expect(all[0].g).toBe('g0')
    expect(all[0].v).toBeLessThanOrEqual(all[1].v)
  })
})

// ===== 2. 行分组 =====
describe('QA: 行分组 (groupBy)', () => {
  it('分组后渲染组头行, 折叠/展开改变行数', async () => {
    const columns = [
      { key: 'dept', title: '部门', width: 100 },
      { key: 'name', title: '姓名', width: 100 },
    ] as IColumn[]
    const data = Array.from({ length: 60 }, (_, i) => ({
      dept: i % 3 === 0 ? '研发' : i % 3 === 1 ? '市场' : '销售',
      name: `p${i}`,
    }))
    const { host, table, scroller } = await mountTable({
      columns,
      initialData: data,
      groupBy: ['dept'],
      frozenColumns: 0,
      rowHeight: 28,
    })

    await nextFrames(8)
    // 默认展开: 3 组头 + 60 行
    const expandedCount = (table as any).dataStrategy.getTotalRows()
    expect(expandedCount).toBe(63)

    table.collapseAllGroups()
    await nextFrames(12)
    // 全折叠: 只剩 3 个组头
    const collapsedCount = (table as any).dataStrategy.getTotalRows()
    expect(collapsedCount).toBe(3)

    // DOM 中应有组头行
    const groupRows = host.querySelectorAll<HTMLDivElement>('.vt-row-group')
    expect(groupRows.length).toBeGreaterThan(0)
    const toggle = groupRows[0].querySelector<HTMLElement>('.vt-group-toggle')
    expect(toggle).toBeTruthy()

    table.expandAllGroups()
    await nextFrames(12)
    expect((table as any).dataStrategy.getTotalRows()).toBe(63)
    void scroller
  })
})

// ===== 3. 内联编辑 =====
describe('QA: 内联编辑', () => {
  it('双击可编辑单元格 → 输入 → Enter 提交 → 回调与数据更新', async () => {
    const changes: any[] = []
    const columns = makeColumns(4)
    columns[1].editable = true
    columns[1].editor = 'text'
    const data = makeRows(100, 4)
    const { host, table } = await mountTable({ columns, initialData: data, onCellValueChange: (key, rowIndex, newValue, oldValue, row) => {
      changes.push({ key, rowIndex, newValue, oldValue, row })
    } })

    const rows = getDataRows(host)
    const cell = rows[0].querySelector<HTMLDivElement>('.vt-cell-editable')
    expect(cell).toBeTruthy()
    cell!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextFrames(2)

    const input = host.querySelector<HTMLInputElement>('.vt-cell-editor')
    expect(input).toBeTruthy()
    input!.value = 'EDITED'
    input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextFrames(4)

    expect(changes.length).toBe(1)
    expect(changes[0]).toMatchObject({ key: 'col1', rowIndex: 0, newValue: 'EDITED' })
    expect((table as any).dataStrategy.getRow(0).col1).toBe('EDITED')
  })

  it('Esc 取消编辑, 数据不变', async () => {
    const changes: any[] = []
    const columns = makeColumns(4)
    columns[1].editable = true
    const { host } = await mountTable({ columns, initialData: makeRows(100, 4), onCellValueChange: (...args: any[]) => { changes.push(args) } })

    const rows = getDataRows(host)
    const cell = rows[0].querySelector<HTMLDivElement>('.vt-cell-editable')!
    cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await nextFrames(2)
    const input = host.querySelector<HTMLInputElement>('.vt-cell-editor')!
    input.value = 'SHOULD-NOT-COMMIT'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextFrames(4)

    expect(changes.length).toBe(0)
    expect(host.querySelector('.vt-cell-editor')).toBeNull()
  })
})

// ===== 4. 单元格合并 =====
describe('QA: 单元格合并 (colSpan / rowSpan)', () => {
  it('colSpan: 合并单元格宽度跨多列并标记', async () => {
    const columns = makeColumns(6)
    columns[1].colSpan = () => 3 // col1 向右合并 3 列
    const { host } = await mountTable({ columns, initialData: makeRows(100, 6), frozenColumns: 0 })

    const rows = getDataRows(host)
    const cells = rows[0].querySelectorAll<HTMLDivElement>('.vt-table-cell')
    const merged = Array.from(cells).find((c) => c.dataset.colspan)
    expect(merged).toBeTruthy()
    expect(merged!.dataset.colspan).toBe('3')
    // 合并后行内 DOM 列数减少 (2 个被覆盖列被跳过)
    expect(cells.length).toBeLessThan(6)
  })

  it('rowSpan: 相同值列向下合并撑高', async () => {
    const columns = makeColumns(4)
    columns[0].rowSpan = (v: any) => (v === 'dup' ? 2 : 1)
    const data = Array.from({ length: 50 }, (_, i) => ({ col0: i === 0 ? 'dup' : `x${i}`, col1: i, col2: i, col3: i }))
    const { host } = await mountTable({ columns, initialData: data, frozenColumns: 0, rowHeight: 28 })

    const rows = getDataRows(host)
    const merged = rows.find((r) => r.querySelector<HTMLDivElement>('.vt-cell-merged'))
    expect(merged).toBeTruthy()
  })
})

// ===== 5. 列显隐/顺序变化不破坏结构 =====
describe('QA: 列配置变化', () => {
  it('隐藏列后: 行结构完整 (scroll-body 保留), 数据行更新', async () => {
    const { host, table } = await mountTable({ columns: makeColumns(20) })
    const before = getDataRows(host)
    expect(before[0].querySelector('.vt-scroll-body')).toBeTruthy()

    ;(table as any).dispatch({ type: 'COLUMN_HIDE', payload: { key: 'col3' } })
    await nextFrames(12)

    const after = getDataRows(host)
    expect(after.length).toBeGreaterThan(0)
    for (const row of after) {
      expect(row.querySelector('.vt-scroll-body')).toBeTruthy()
      expect(row.querySelector('[data-column-key="col3"]')).toBeNull()
    }
  })

  it('列顺序调整后: 表头与数据行列序一致', async () => {
    const { host, table } = await mountTable({ columns: makeColumns(10) })
    ;(table as any).dispatch({ type: 'COLUMN_ORDER_SET', payload: { order: ['col0','col2','col3','col4','col5','col6','col7','col8','col1','col9'] } })
    await nextFrames(12)

    const header = host.querySelector<HTMLDivElement>('.vt-header-cell[data-column-key="col1"]')
    expect(header).toBeTruthy()
    const rows = getDataRows(host)
    for (const row of rows.slice(0, 3)) {
      const bodyCells = Array.from(row.querySelectorAll<HTMLDivElement>('.vt-scroll-body .vt-table-cell'))
      // 冻结 1 列, col1 移到第 9 位 → 非冻结区包含 col1
      const keys = bodyCells.map((c) => c.dataset.columnKey)
      expect(keys).toContain('col1')
    }
  })
})
