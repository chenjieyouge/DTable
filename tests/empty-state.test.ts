import { describe, it, expect } from 'vitest'
import { resolveEmptyState, resolvePlaceholder } from '@/table/viewport/emptyState'

/**
 * 空态判定
 *
 * 关键区分: "本来就没数据" 和 "筛选后没数据" 是两件不同的事。
 * 前者用户无从下手, 后者要给出"清空筛选"这个可操作的出路。
 */
describe('resolveEmptyState', () => {
  it('有数据时不显示空态', () => {
    const d = resolveEmptyState({ totalRows: 10, columnFilters: {}, filterText: '' })
    expect(d.kind).toBe('none')
  })

  it('有数据时即使带筛选也不显示空态', () => {
    const d = resolveEmptyState({
      totalRows: 3,
      columnFilters: { region: { kind: 'set', values: ['华东'] } },
      filterText: '张',
    })
    expect(d.kind).toBe('none')
  })

  it('无数据且无筛选 => 暂无数据, 不提供清空入口', () => {
    const d = resolveEmptyState({ totalRows: 0, columnFilters: {}, filterText: '' })
    expect(d.kind).toBe('no-data')
    expect(d.canClearFilters).toBe(false)
  })

  it('无数据且带列筛选 => 筛选无匹配, 提供清空入口', () => {
    const d = resolveEmptyState({
      totalRows: 0,
      columnFilters: { region: { kind: 'set', values: ['华东'] } },
      filterText: '',
    })
    expect(d.kind).toBe('no-match')
    expect(d.canClearFilters).toBe(true)
  })

  it('无数据且带全局搜索 => 筛选无匹配, 提供清空入口', () => {
    const d = resolveEmptyState({ totalRows: 0, columnFilters: {}, filterText: '不存在的员工' })
    expect(d.kind).toBe('no-match')
    expect(d.canClearFilters).toBe(true)
  })

  it('纯空格的搜索词不算筛选条件', () => {
    const d = resolveEmptyState({ totalRows: 0, columnFilters: {}, filterText: '   ' })
    expect(d.kind).toBe('no-data')
    expect(d.canClearFilters).toBe(false)
  })

  it('两种空态都要给出可读的文案', () => {
    const noData = resolveEmptyState({ totalRows: 0, columnFilters: {}, filterText: '' })
    const noMatch = resolveEmptyState({ totalRows: 0, columnFilters: {}, filterText: 'x' })

    for (const d of [noData, noMatch]) {
      expect(d.title.length).toBeGreaterThan(0)
      expect(d.hint.length).toBeGreaterThan(0)
    }
    // 两种并列展示时文案不能一样, 否则用户无法区分处境
    expect(noData.title).not.toBe(noMatch.title)
  })
})

/**
 * 数据区占位层: 加载态与空态共用一个覆盖层, 加载优先级最高
 */
describe('resolvePlaceholder', () => {
  it('加载中优先于一切', () => {
    const d = resolvePlaceholder({ loading: true, totalRows: 0, columnFilters: {}, filterText: '' })
    expect(d.kind).toBe('loading')
    expect(d.showSpinner).toBe(true)
  })

  it('加载中即使已有旧数据(如刷新/翻页)也显示加载态', () => {
    const d = resolvePlaceholder({ loading: true, totalRows: 500, columnFilters: {}, filterText: '' })
    expect(d.kind).toBe('loading')
  })

  it('加载中不提供清空筛选入口', () => {
    const d = resolvePlaceholder({
      loading: true,
      totalRows: 0,
      columnFilters: { region: { kind: 'set', values: ['华东'] } },
      filterText: '张',
    })
    expect(d.canClearFilters).toBe(false)
  })

  it('非加载态下透传空态判定', () => {
    const none = resolvePlaceholder({ loading: false, totalRows: 10, columnFilters: {}, filterText: '' })
    expect(none.kind).toBe('none')
    expect(none.showSpinner).toBe(false)

    const noData = resolvePlaceholder({ loading: false, totalRows: 0, columnFilters: {}, filterText: '' })
    expect(noData.kind).toBe('no-data')

    const noMatch = resolvePlaceholder({ loading: false, totalRows: 0, columnFilters: {}, filterText: 'x' })
    expect(noMatch.kind).toBe('no-match')
    expect(noMatch.canClearFilters).toBe(true)
  })

  it('非加载态的四种结果都不显示转圈', () => {
    const cases = [
      { totalRows: 10, filterText: '' },
      { totalRows: 0, filterText: '' },
      { totalRows: 0, filterText: 'x' },
    ]
    for (const c of cases) {
      const d = resolvePlaceholder({ loading: false, columnFilters: {}, ...c })
      expect(d.showSpinner).toBe(false)
    }
  })
})
