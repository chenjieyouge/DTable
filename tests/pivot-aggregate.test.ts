import { describe, it, expect } from 'vitest'
import { PivotDataProcessor } from '@/table/pivot/PivotDataProcessor'
import type { IPivotConfig } from '@/types/pivot'

/**
 * 截断策略回归测试
 *
 * 行方向和列方向的处理是刻意不同的:
 *   行 —— 不截断。代价是线性的(每层把行分一遍组), 渲染有虚拟滚动兜着,
 *        静默丢分组只会产出一张"看着正常但少了数据"的表。
 *   列 —— 必须限制。列数是各列分组唯一值数量的乘积, 会指数爆炸;
 *        但超限时应当拒绝渲染, 而不是只显示前 N 列。
 */
describe('PivotDataProcessor 截断策略', () => {
  it('行分组不再静默截断: 超过 50 个分组也全部保留', () => {
    // 旧实现有 MAX_NODES_PER_LEVEL = 50, 超出部分直接丢弃
    const data = Array.from({ length: 120 }, (_, i) => ({
      region: `区域${i}`,
      salary: i + 1,
    }))

    const processor = new PivotDataProcessor({
      enabled: true,
      rowGroups: ['region'],
      valueFields: [{ key: 'salary', aggregation: 'sum' }],
    })
    processor.buildColTree(data)
    const root = processor.buildPivotTree(data)

    expect(root.children).toHaveLength(120)
  })

  it('行分组保持数据原始出现顺序, 不按行数重排', () => {
    // 旧实现在超过阈值时会先按行数降序排序再截断, 导致行顺序随数据量漂移
    const data = [
      { region: '乙', salary: 1 },
      { region: '乙', salary: 1 },
      { region: '乙', salary: 1 },
      { region: '甲', salary: 1 },
    ]

    const processor = new PivotDataProcessor({
      enabled: true,
      rowGroups: ['region'],
      valueFields: [{ key: 'salary', aggregation: 'sum' }],
    })
    processor.buildColTree(data)
    const root = processor.buildPivotTree(data)

    expect(root.children.map((c) => c.groupValue)).toEqual(['乙', '甲'])
  })

  it('列数超过 colMaxLeafCols 时置截断标记', () => {
    const data = Array.from({ length: 30 }, (_, i) => ({
      region: `R${i}`,
      product: `P${i}`,
      salary: 1,
    }))

    const processor = new PivotDataProcessor({
      enabled: true,
      rowGroups: ['region'],
      colGroups: ['product'],
      valueFields: [{ key: 'salary', aggregation: 'sum' }],
      colMaxLeafCols: 5,
    })
    processor.buildColTree(data)

    expect(processor.isColTruncated()).toBe(true)
  })

  it('列数在上限内时不置截断标记', () => {
    const data = [
      { region: 'A', product: 'P1', salary: 1 },
      { region: 'B', product: 'P2', salary: 2 },
    ]

    const processor = new PivotDataProcessor({
      enabled: true,
      rowGroups: ['region'],
      colGroups: ['product'],
      valueFields: [{ key: 'salary', aggregation: 'sum' }],
      colMaxLeafCols: 50,
    })
    processor.buildColTree(data)

    expect(processor.isColTruncated()).toBe(false)
  })
})

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
