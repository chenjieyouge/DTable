import { describe, it, expect } from 'vitest'
import { PivotDataProcessor } from '@/table/pivot/PivotDataProcessor'
import { PivotTreeNode } from '@/table/pivot/PivotTreeNode'
import type { IPivotConfig } from '@/types/pivot'

/**
 * 快速查询 (扁平透视) 回归测试
 *
 * 核心语义:
 * 1. 勾选字段按顺序作为行分组, 每个唯一组合一行
 * 2. 所有勾选字段值平铺显示, 不合并相邻同值单元格 (与树形透视的组头合并形态相反)
 * 3. 组合聚合值 = 该组合内全部原始行的聚合
 * 4. 末尾总计行 = 全量聚合
 */
describe('快速查询 flattenFlat: 扁平透视, 不合并相邻同值单元格', () => {
  const data = [
    { 品类: '护耳耳机', 型号: 'E2S', 激活量: 100 },
    { 品类: '护耳耳机', 型号: 'E2S', 激活量: 150 },
    { 品类: '护耳耳机', 型号: 'E2S', 激活量: 60 },
    { 品类: '电话手表', 型号: 'Z6A', 激活量: 200 },
    { 品类: '电话手表', 型号: 'Z6A', 激活量: 80 },
    { 品类: '电话手表', 型号: 'Z9', 激活量: 40 },
  ]

  function buildFlat(rowGroups: string[]) {
    const config: IPivotConfig = {
      enabled: true,
      flatMode: true,
      rowGroups,
      valueFields: [{ key: '激活量', aggregation: 'sum' }],
    }
    const processor = new PivotDataProcessor(config)
    processor.buildColTree(data)
    const root = processor.buildPivotTree(data)
    return { config, root, rows: PivotTreeNode.flattenFlat(root, rowGroups) }
  }

  it('每组一行, 相邻同值不合并 (平铺)', () => {
    const { rows } = buildFlat(['品类', '型号'])
    const comboRows = rows.filter(r => r.rowType !== 'grandtotal')

    expect(comboRows).toHaveLength(3)
    // 平铺: 每条组合行都完整带 品类+型号, 无树形组头
    expect(comboRows.map(r => `${r.data['品类']}/${r.data['型号']}`)).toEqual([
      '护耳耳机/E2S',
      '电话手表/Z6A',
      '电话手表/Z9',
    ])
    // 关键断言: "电话手表" 在相邻两行重复出现 (未合并成组头)
    expect(comboRows[1].data['品类']).toBe('电话手表')
    expect(comboRows[2].data['品类']).toBe('电话手表')
  })

  it('组合聚合正确: 该组合内全部行求和', () => {
    const { rows } = buildFlat(['品类', '型号'])
    const comboRows = rows.filter(r => r.rowType !== 'grandtotal')

    expect(comboRows[0].data['激活量']).toBe(310) // 护耳耳机/E2S: 100+150+60
    expect(comboRows[1].data['激活量']).toBe(280) // 电话手表/Z6A: 200+80
    expect(comboRows[2].data['激活量']).toBe(40)  // 电话手表/Z9: 40
  })

  it('末尾总计行: 全量聚合, 语义与树形透视一致', () => {
    const { rows } = buildFlat(['品类', '型号'])
    const total = rows[rows.length - 1]

    expect(total.rowType).toBe('grandtotal')
    expect(total.data['激活量']).toBe(630)
  })

  it('组合行数据补齐全部勾选字段路径值', () => {
    const { rows } = buildFlat(['品类', '型号'])
    const comboRows = rows.filter(r => r.rowType !== 'grandtotal')

    for (const row of comboRows) {
      expect(Object.prototype.hasOwnProperty.call(row.data, '品类')).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(row.data, '型号')).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(row.data, '激活量')).toBe(true)
    }
  })

  it('单维度同样扁平: 每组一行, 同值重复不合并', () => {
    const { rows } = buildFlat(['品类'])
    const comboRows = rows.filter(r => r.rowType !== 'grandtotal')

    expect(comboRows).toHaveLength(2)
    expect(comboRows.map(r => r.data['品类'])).toEqual(['护耳耳机', '电话手表'])
    expect(comboRows[0].data['激活量']).toBe(310)
    expect(comboRows[1].data['激活量']).toBe(320)
    // 总计仍为全量
    expect(rows[rows.length - 1].data['激活量']).toBe(630)
  })
})
