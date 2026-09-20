import type { ColumnFilterValue } from '@/types'

/**
 * 判定哪些列当前"真的"在筛选
 *
 * 一个筛选条件被设置, 不等于它真的生效: set 选了 0 个值、文本框里只有空格、
 * 数值区间 min/max 都没填 —— 这些情况下筛选逻辑本身会跳过它。
 * 若还把这类条件当成"已筛选", 会出现两种毛病:
 *   1. 表头漏斗图标亮着, 但数据一点没变
 *   2. 空表时误报"筛选无匹配", 其实该说"暂无数据"
 */
export function getActiveFilterKeys(
  columnFilters: Record<string, ColumnFilterValue>
): string[] {
  const keys: string[] = []

  for (const [key, filter] of Object.entries(columnFilters)) {
    if (isFilterEffective(filter)) keys.push(key)
  }

  return keys
}

function isFilterEffective(filter: ColumnFilterValue): boolean {
  switch (filter.kind) {
    case 'set':
      return filter.values.length > 0

    case 'text':
      return filter.value.trim() !== ''

    case 'dateRange':
      // 空串等同于没填, 所以用 || 而不是 !== undefined
      return Boolean(filter.start) || Boolean(filter.end)

    case 'numberRange':
      // 必须用 !== undefined: 0 是最常见的有效边界值, 用真值判断会把它漏掉
      return filter.min !== undefined || filter.max !== undefined

    default:
      return false
  }
}
