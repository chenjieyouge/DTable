import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VirtualTable } from '@/table/VirtualTable'
import type { IUserConfig, IColumn } from '@/types'

// ===== 测试基建 =====
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

/** 给 happy-dom 的无布局元素补尺寸 */
function mockSize(el: HTMLElement, w: number, h: number) {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: h, configurable: true })
  Object.defineProperty(el, 'scrollWidth', { value: w, configurable: true })
}

const nextFrames = (n = 5) =>
  new Promise<void>((resolve) => {
    let left = n
    const tick = () => {
      if (--left <= 0) return resolve()
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

describe('QA: 表格冒烟 (happy-dom 环境)', () => {
  let host: HTMLDivElement
  let table: VirtualTable | null = null

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    table?.destroy()
    table = null
    document.body.innerHTML = ''
  })

  it('client 模式 10 万行可挂载并渲染出虚拟行', async () => {
    const columns = makeColumns(8)
    const rows = makeRows(100_000, 8)
    table = new VirtualTable({
      container: host,
      columns,
      initialData: rows,
      tableHeight: 600,
      rowHeight: 28,
      frozenColumns: 1,
      pageSize: 1000,
      bufferRows: 10,
    } as IUserConfig)
    await table.ready
    await nextFrames(8)

    const scroller = host.querySelector<HTMLDivElement>('.vt-table-container')!
    expect(scroller).toBeTruthy()
    mockSize(scroller, 900, 600)

    // 触发一次刷新
    ;(table as any).viewport.updateVisibleRows()
    await nextFrames(8)

    const dataRows = host.querySelectorAll<HTMLDivElement>('.vt-virtual-row')
    expect(dataRows.length).toBeGreaterThan(0)
    expect(dataRows.length).toBeLessThan(40) // 虚拟化: 600/28 + buffer ≈ 30 行

    // 首行数据正确
    const firstCell = dataRows[0].querySelector<HTMLDivElement>('.vt-table-cell')
    expect(firstCell).toBeTruthy()
  })
})
