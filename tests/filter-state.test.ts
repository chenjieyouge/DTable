import { describe, it, expect } from 'vitest'
import { getActiveFilterKeys } from '@/table/state/filterState'

/**
 * "哪些列真的在筛选"
 *
 * 一个筛选条件被设置, 不等于它真的生效: set 选了 0 个值、文本框里只有空格、
 * 数值区间 min/max 都没填 —— 这些情况筛选逻辑本身会跳过,
 * 若还把它们当成"已筛选", 就会出现"图标亮着但数据没变"的困惑。
 */
describe('getActiveFilterKeys', () => {
  it('没有筛选条件时返回空', () => {
    expect(getActiveFilterKeys({})).toEqual([])
  })

  it('set 类型: 选了值才算生效', () => {
    expect(getActiveFilterKeys({ region: { kind: 'set', values: ['华东'] } })).toEqual(['region'])
  })

  it('set 类型: 一个都没选不算生效', () => {
    expect(getActiveFilterKeys({ region: { kind: 'set', values: [] } })).toEqual([])
  })

  it('text 类型: 有内容才算生效', () => {
    expect(getActiveFilterKeys({ name: { kind: 'text', value: '张' } })).toEqual(['name'])
  })

  it('text 类型: 纯空格不算生效', () => {
    expect(getActiveFilterKeys({ name: { kind: 'text', value: '   ' } })).toEqual([])
  })

  it('text 类型: 空串不算生效', () => {
    expect(getActiveFilterKeys({ name: { kind: 'text', value: '' } })).toEqual([])
  })

  it('dateRange 类型: 只填开始 或 只填结束 都算生效', () => {
    expect(getActiveFilterKeys({ joinDate: { kind: 'dateRange', start: '2024-01-01' } })).toEqual(['joinDate'])
    expect(getActiveFilterKeys({ joinDate: { kind: 'dateRange', end: '2024-12-31' } })).toEqual(['joinDate'])
  })

  it('dateRange 类型: 两端都为空不算生效', () => {
    expect(getActiveFilterKeys({ joinDate: { kind: 'dateRange', start: '', end: '' } })).toEqual([])
  })

  it('numberRange 类型: min 为 0 是有效值, 必须算生效', () => {
    // 0 是 falsy, 用 if (filter.min) 判断会漏掉这个最常见的边界
    expect(getActiveFilterKeys({ salary: { kind: 'numberRange', min: 0 } })).toEqual(['salary'])
  })

  it('numberRange 类型: max 为 0 也算生效', () => {
    expect(getActiveFilterKeys({ salary: { kind: 'numberRange', max: 0 } })).toEqual(['salary'])
  })

  it('numberRange 类型: 都没填不算生效', () => {
    expect(getActiveFilterKeys({ salary: { kind: 'numberRange' } })).toEqual([])
  })

  it('混合场景: 只挑出真正生效的列', () => {
    const keys = getActiveFilterKeys({
      region: { kind: 'set', values: ['华东'] },
      name: { kind: 'text', value: '  ' },
      salary: { kind: 'numberRange', min: 0, max: 100 },
      joinDate: { kind: 'dateRange' },
    })
    expect(keys.sort()).toEqual(['region', 'salary'])
  })
})
