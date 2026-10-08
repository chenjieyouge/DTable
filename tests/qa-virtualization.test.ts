import { describe, it, expect, vi, afterEach } from 'vitest'
import { VirtualTable } from '@/table/VirtualTable'
import type { IUserConfig, IColumn, IPageResponse } from '@/types'

// ===== 测试基建 =====
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

/** happy-dom 无布局引擎, 手动补尺寸 */
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

async function setupTable(cfg: Partial<IUserConfig>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const table = new VirtualTable({
    container: host,
    columns: makeColumns(8),
    initialData: makeRows(50_000, 8),
    tableHeight: 600,
    rowHeight: 28,
    frozenColumns: 1,
    pageSize: 1000,
    bufferRows: 10,
    ...cfg,
  } as IUserConfig)
  await table.ready
  createdTables.push(table)
  const scroller = host.querySelector<HTMLDivElement>('.vt-table-container')!
  mockSize(scroller, 900, 600)
  ;(table as any).viewport.updateVisibleRows()
  await nextFrames(8)
  return { host, table, scroller }
}

function getDataRows(host: HTMLDivElement): HTMLDivElement[] {
  return Array.from(host.querySelectorAll<HTMLDivElement>('.vt-virtual-row'))
}

describe('QA: 列虚拟化 (横向)', () => {
  it('窄视口只渲染可见列 + 缓冲列, 而非全部列', async () => {
    const { host } = await setupTable({ columns: makeColumns(20) })
    const rows = getDataRows(host)
    expect(rows.length).toBeGreaterThan(0)
    const first = rows[0]
    const scrollBody = first.querySelector<HTMLDivElement>('.vt-scroll-body')
    expect(scrollBody).toBeTruthy()
    const bodyCells = scrollBody!.querySelectorAll<HTMLDivElement>('.vt-table-cell')
    expect(bodyCells.length).toBeLessThanOrEqual(10)
    expect(bodyCells.length).toBeGreaterThan(0)
  })

  it('横向滚动后, 既有行的可见列集同步更新 (列内容正确)', async () => {
    const { host, scroller } = await setupTable({ columns: makeColumns(20) })
    const rowsBefore = getDataRows(host)
    expect(rowsBefore.length).toBeGreaterThan(0)

    scroller.scrollLeft = 500
    scroller.dispatchEvent(new Event('scroll'))
    await nextFrames(8)

    const rowsAfter = getDataRows(host)
    expect(rowsAfter.length).toBe(rowsBefore.length)
    for (const row of rowsAfter) {
      const scrollBody = row.querySelector<HTMLDivElement>('.vt-scroll-body')
      const cells = scrollBody!.querySelectorAll<HTMLDivElement>('.vt-table-cell')
      const keys = Array.from(cells).map((c) => c.dataset.columnKey)
      expect(keys).not.toContain('col0')
      const firstVisible = parseInt(keys[0]!.replace('col', ''), 10)
      expect(firstVisible).toBeGreaterThanOrEqual(3)
      expect(firstVisible).toBeLessThanOrEqual(7)
      const rowIndex = parseInt(row.dataset.rowIndex!, 10)
      const cellText = cells[0]!.textContent
      expect(cellText).toBe(`${rowIndex}-${firstVisible}`)
    }
  })

  it('横向滚动过程中, 行内 cell 数有上限, 不随滚动累积泄漏', async () => {
    const { host, scroller } = await setupTable({ columns: makeColumns(20) })
    for (let step = 0; step < 4; step++) {
      scroller.scrollLeft = step * 300
      scroller.dispatchEvent(new Event('scroll'))
      await nextFrames(4)
      const rows = getDataRows(host)
      for (const row of rows) {
        const n = row.querySelectorAll('.vt-table-cell').length
        expect(n).toBeGreaterThanOrEqual(2)
        expect(n).toBeLessThanOrEqual(14)
      }
    }
  })
})

describe('QA: 行池化复用', () => {
  it('滚动后行 DOM 节点被回收复用 (元素身份复用)', async () => {
    const { host, scroller } = await setupTable({})
    const before = new Set(getDataRows(host))

    scroller.scrollTop = 28 * 500
    scroller.dispatchEvent(new Event('scroll'))
    await nextFrames(8)
    const after1 = getDataRows(host)

    scroller.scrollTop = 28 * 2000
    scroller.dispatchEvent(new Event('scroll'))
    await nextFrames(8)
    const after2 = getDataRows(host)

    // 第 1 次滚动: acquire 先于 release, 全新建; 初始行进池
    const reusedAfter1 = [...after1].filter((r) => before.has(r)).length
    expect(reusedAfter1).toBe(0)
    // 第 2 次滚动: 复用池中的初始行
    const reusedAfter2 = [...after2].filter((r) => before.has(r)).length
    expect(reusedAfter2).toBeGreaterThan(0)
  })

  it('纵向滚动后, DOM 行数不累积 (释放行被摘除)', async () => {
    const { host, scroller } = await setupTable({})
    for (let step = 0; step < 6; step++) {
      scroller.scrollTop = 28 * step * 1000
      scroller.dispatchEvent(new Event('scroll'))
      await nextFrames(4)
      const n = getDataRows(host).length
      expect(n).toBeLessThan(50)
    }
  })

  it('离开视口的渲染器组件被 destroy (生命周期闭合)', async () => {
    let mounted = 0
    let destroyed = 0
    const render = vi.fn(() => ({
      mount: () => { mounted++ },
      update: () => {},
      destroy: () => { destroyed++ },
    }))
    const columns = makeColumns(4)
    columns[1].render = render
    const host = document.createElement('div')
    document.body.appendChild(host)
    const table = new VirtualTable({
      container: host,
      columns,
      initialData: makeRows(50_000, 4),
      tableHeight: 600,
      rowHeight: 28,
      frozenColumns: 0,
      pageSize: 1000,
      bufferRows: 5,
    } as IUserConfig)
    await table.ready
    createdTables.push(table)
    const scroller = host.querySelector<HTMLDivElement>('.vt-table-container')!
    mockSize(scroller, 900, 600)
    ;(table as any).viewport.updateVisibleRows()
    await nextFrames(8)

    expect(mounted).toBeGreaterThan(0)
    const m1 = mounted

    scroller.scrollTop = 28 * 1000
    scroller.dispatchEvent(new Event('scroll'))
    await nextFrames(8)
    expect(destroyed).toBeGreaterThan(0)
    expect(mounted).toBeGreaterThanOrEqual(m1)
  })
})

describe('QA: 可变行高', () => {
  it('rowHeight 回调生效: 各行 offset 按实际高度累加', async () => {
    const heights = (i: number) => 20 + (i % 3) * 10
    const host = document.createElement('div')
    document.body.appendChild(host)
    const table = new VirtualTable({
      container: host,
      columns: makeColumns(4),
      initialData: makeRows(10_000, 4),
      tableHeight: 500,
      rowHeight: heights,
      frozenColumns: 0,
      pageSize: 1000,
      bufferRows: 10,
    } as IUserConfig)
    await table.ready
    createdTables.push(table)
    const scroller = host.querySelector<HTMLDivElement>('.vt-table-container')!
    mockSize(scroller, 900, 500)
    ;(table as any).viewport.updateVisibleRows()
    await nextFrames(8)

    const rows = getDataRows(host)
    expect(rows.length).toBeGreaterThan(0)
    const top0 = parseFloat(rows[0].style.top)
    const top1 = parseFloat(rows[1].style.top)
    expect(top0).toBe(0)
    expect(top1).toBe(heights(0))
    const h0 = parseFloat(rows[0].style.height)
    expect(h0).toBe(heights(0))
  })
})

describe('QA: 大数据灵活渲染', () => {
  it('50 万行 (client 上限): 渲染行数受控, 深滚动数据正确', async () => {
    const cols = 8
    const host = document.createElement('div')
    document.body.appendChild(host)
    const table = new VirtualTable({
      container: host,
      columns: makeColumns(cols),
      initialData: makeRows(500_000, cols),
      tableHeight: 600,
      rowHeight: 28,
      frozenColumns: 1,
      pageSize: 2000,
      bufferRows: 10,
    } as IUserConfig)
    await table.ready
    createdTables.push(table)
    const scroller = host.querySelector<HTMLDivElement>('.vt-table-container')!
    mockSize(scroller, 900, 600)
    ;(table as any).viewport.updateVisibleRows()
    await nextFrames(8)

    const initialRows = getDataRows(host)
    expect(initialRows.length).toBeGreaterThan(0)
    expect(initialRows.length).toBeLessThan(40)

    scroller.scrollTop = 28 * 250_000
    scroller.dispatchEvent(new Event('scroll'))
    await nextFrames(8)
    const midRows = getDataRows(host)
    expect(midRows.length).toBeLessThanOrEqual(45)
    const midIndex = parseInt(midRows[0].dataset.rowIndex!, 10)
    expect(midIndex).toBeGreaterThan(200_000)
    const frozenCell = midRows[0].querySelector<HTMLDivElement>('.vt-cell-frozen')
    expect(frozenCell).toBeTruthy()
    expect(frozenCell!.textContent).toBe(`${midIndex}-0`)
  })

  it('100 万行 (server 分页): 按需加载 + 虚拟化', async () => {
    const TOTAL = 1_000_000
    const PAGE = 2000
    const cols = 8
    let fetchCount = 0
    const fetchPageData = async (pageIndex: number): Promise<IPageResponse> => {
      fetchCount++
      const start = pageIndex * PAGE
      const list: Record<string, any>[] = []
      const n = Math.min(PAGE, TOTAL - start)
      for (let i = 0; i < n; i++) {
        const row: Record<string, any> = { id: start + i }
        for (let c = 0; c < cols; c++) row[`col${c}`] = `${start + i}-${c}`
        list.push(row)
      }
      return { list, totalRows: TOTAL, page: pageIndex }
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const table = new VirtualTable({
      container: host,
      columns: makeColumns(cols),
      fetchPageData,
      pageSize: PAGE,
      tableHeight: 600,
      rowHeight: 28,
      frozenColumns: 1,
      bufferRows: 10,
    } as IUserConfig)
    await table.ready
    createdTables.push(table)
    const scroller = host.querySelector<HTMLDivElement>('.vt-table-container')!
    mockSize(scroller, 900, 600)
    ;(table as any).viewport.updateVisibleRows()
    await nextFrames(8)

    const initialRows = getDataRows(host)
    expect(initialRows.length).toBeGreaterThan(0)
    expect(initialRows.length).toBeLessThan(40)
    const fetchAfterInit = fetchCount

    scroller.scrollTop = 28 * 500_000
    scroller.dispatchEvent(new Event('scroll'))
    await nextFrames(12)

    const midRows = getDataRows(host)
    expect(midRows.length).toBeLessThanOrEqual(45)
    const midIndex = parseInt(midRows[0].dataset.rowIndex!, 10)
    expect(midIndex).toBeGreaterThan(450_000)
    expect(fetchCount).toBeLessThan(fetchAfterInit + 10)
  })
})
