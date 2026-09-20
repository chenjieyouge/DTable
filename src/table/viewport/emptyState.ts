/**
 * 数据区占位层判定
 *
 * 加载态和空态都覆盖在数据区上, 两者互斥 —— 与其做两个浮层互相压制,
 * 不如合并成一个判定函数、一个 DOM 元素。优先级: 加载 > 空态。
 *
 * 抽成纯函数的原因: 这部分逻辑与 DOM 无关, 却最容易出错 ——
 * 尤其是"本来就没数据"和"筛选后没数据"是两件完全不同的事:
 * 前者用户无从下手, 后者必须给出"清空筛选"这条可操作的出路。
 */

import type { ColumnFilterValue } from '@/types'
import { getActiveFilterKeys } from '@/table/state/filterState'

export type EmptyKind = 'none' | 'no-data' | 'no-match'

export interface EmptyStateInput {
  totalRows: number
  /** 当前生效的列筛选, 空对象表示没有列筛选 */
  columnFilters: Record<string, ColumnFilterValue>
  /** 全局搜索关键词 */
  filterText: string
}

export interface EmptyStateDecision {
  kind: EmptyKind
  title: string
  hint: string
  /** 是否提供"清空筛选"入口 */
  canClearFilters: boolean
}

/** 表格里有数据, 不显示任何空态 */
const HIDDEN: EmptyStateDecision = {
  kind: 'none',
  title: '',
  hint: '',
  canClearFilters: false,
}

export function resolveEmptyState(input: EmptyStateInput): EmptyStateDecision {
  const { totalRows, columnFilters, filterText } = input

  if (totalRows > 0) return HIDDEN

  // 注意是"真的生效"而不是"设置过": 空 set / 纯空格文本都不算, 见 filterState.ts
  const hasColumnFilters = getActiveFilterKeys(columnFilters).length > 0
  // 纯空格的搜索词等同于没搜索, 否则会出现"空态说有筛选但清不掉"的怪状态
  const hasTextFilter = filterText.trim() !== ''

  if (hasColumnFilters || hasTextFilter) {
    return {
      kind: 'no-match',
      title: '没有匹配的数据',
      hint: '当前筛选条件下没有结果，试试放宽筛选条件',
      canClearFilters: true,
    }
  }

  return {
    kind: 'no-data',
    title: '暂无数据',
    hint: '没有可展示的数据',
    canClearFilters: false,
  }
}

// ============ 数据区占位层 (加载态 + 空态) ============

export type PlaceholderKind = 'none' | 'loading' | 'no-data' | 'no-match'

export interface PlaceholderInput extends EmptyStateInput {
  loading: boolean
}

export interface PlaceholderDecision {
  kind: PlaceholderKind
  title: string
  hint: string
  showSpinner: boolean
  canClearFilters: boolean
}

export function resolvePlaceholder(input: PlaceholderInput): PlaceholderDecision {
  // 加载优先级最高: 此刻表格里既有的行很可能是上一轮的旧数据,
  // 这时显示"没有匹配的数据"会误导用户
  if (input.loading) {
    return {
      kind: 'loading',
      title: '加载中…',
      hint: '',
      showSpinner: true,
      canClearFilters: false,
    }
  }

  const empty = resolveEmptyState(input)
  return {
    kind: empty.kind,
    title: empty.title,
    hint: empty.hint,
    showSpinner: false,
    canClearFilters: empty.canClearFilters,
  }
}
