import { describe, it, expect } from 'vitest'
import { PivotDataProcessor } from '@/table/pivot/PivotDataProcessor'
import type { IPivotConfig } from '@/types/pivot'

/**
 * PivotDataProcessor 聚合正确性回归测试
 *
 * 背景: aggregate() 曾以 `${rows.length}_${fieldKey}_${aggregation}` 作为缓存 key,
 * 只含行数、不含行内容。导致行数相同的两个分组互相串值, 且跨次构建复用脏数据。
 * 这两个用例分别锁住这两种表现。
 */
describe('PivotDataProcessor 聚合正确性', () => {
  const baseConfig: IPivotConfig = {
    enabled: true,
    rowGroups: ['region'],
    valueFields: [{ key: 'salary', aggregation: 'sum' }],
  }

  it('行数相同的兄弟分组, 必须各算各的聚合值, 不能互相串值', () => {
    // 华东 2 行 sum=100, 华北 2 行 sum=500 —— 行数相同, 聚合值完全不同
    const data = [
      { region: '华东', salary: 40 },
      { region: '华东', salary: 60 },
      { region: '华北', salary: 200 },
      { region: '华北', salary: 300 },
    ]

    const processor = new PivotDataProcessor(baseConfig)
    processor.buildColTree(data)
    const root = processor.buildPivotTree(data)

    expect(root.children).toHaveLength(2)
    expect(root.children[0].aggregatedData['salary']).toBe(100)
    expect(root.children[1].aggregatedData['salary']).toBe(500)
  })

  it('数据变更后重新构建, 不能复用上一次残留的聚合结果', () => {
    const processor = new PivotDataProcessor(baseConfig)

    const first = [
      { region: '华东', salary: 40 },
      { region: '华东', salary: 60 },
      { region: '华北', salary: 200 },
      { region: '华北', salary: 300 },
    ]
    processor.buildColTree(first)
    const root1 = processor.buildPivotTree(first)
    expect(root1.children[0].aggregatedData['salary']).toBe(100)
    expect(root1.children[1].aggregatedData['salary']).toBe(500)

    // 换了数据, 但每个分组的行数依旧是 2 —— 行数不变, 值全变了
    const second = [
      { region: '华东', salary: 7 },
      { region: '华东', salary: 3 },
      { region: '华北', salary: 11 },
      { region: '华北', salary: 22 },
    ]
    processor.buildColTree(second)
    const root2 = processor.buildPivotTree(second)

    expect(root2.children[0].aggregatedData['salary']).toBe(10)
    expect(root2.children[1].aggregatedData['salary']).toBe(33)
  })
})
