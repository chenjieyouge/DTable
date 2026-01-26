import { describe, it,  expect } from 'vitest'
import { ClientDataStrategy } from '@/table/data/ClientDataStrategy'

describe('ClientDataStrategy', () => {

  it ('applyQuery 后 getRow 应该返回 filterData 而非 fullData', async () => {
    const columns: any[] = [{ key: 'name'}]
    const s = new ClientDataStrategy([
      { name: 'a' },
      { name: 'bbb' },
      { name: 'cc' },
    ], columns as any)

    await s.bootstrap()
    await s.applyQuery({ filterText: 'bb' })
    expect(s.getTotalRows()).toBe(1)
    expect(s.getRow(0)).toEqual({ name: 'bbb' })
  })

  it('列筛选 Array includes 必须生效', async () => {
    const columns: any[] = [{ key: 'type' }]
    const s = new ClientDataStrategy(
      [
        { type: 'A' },
        { type: 'B' },
        { type: 'C' }
      ],
      columns as any 
    )
    await s.applyQuery({ columnFilters: { type: { kind: 'set', values: ['B', 'C'] } } })
    expect(s.getTotalRows()).toBe(2)
    expect(s.getRow(0)).toEqual({ type: 'B' })
    expect(s.getRow(1)).toEqual({ type: 'C' })
  })
})