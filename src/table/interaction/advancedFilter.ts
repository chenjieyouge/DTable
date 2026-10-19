/**
 * 高级筛选 (对标 ag-grid Advanced Filter)
 *
 * - 纯函数递归求值 matchAdvancedFilter
 * - 字段类型推断 (text / number / date)
 * - 按类型给出操作符列表
 *
 * 数据模型是树形 join (即使 UI 平铺只有一层, 也为将来嵌套分组留好结构)
 */
import type {
  IColumn,
  AdvancedFilterModel,
  IJoinAdvancedFilter,
  ITextAdvancedFilter,
  INumberAdvancedFilter,
  IDateAdvancedFilter,
  AdvancedFilterJoin,
  AdvancedTextOperator,
  AdvancedNumberOperator,
  AdvancedDateOperator,
} from '@/types'

export type AdvancedKind = 'text' | 'number' | 'date'

/** 条件是否为空 (字段/值未填全, 不产生约束) */
export function isEmptyCondition(model: AdvancedFilterModel | undefined | null): boolean {
  if (!model) return true
  if (model.filterType === 'join') return model.conditions.length === 0
  if (model.filterType === 'text') return !model.filter
  if (model.filterType === 'number') {
    if (model.type === 'inRange') return model.filter === undefined && model.filterTo === undefined
    return model.filter === undefined
  }
  // date
  if (model.type === 'inRange') return !model.filter && !model.filterTo
  return !model.filter
}

/** 推断列的筛选类型 */
export function inferColumnKind(col: IColumn): AdvancedKind {
  const ft = col.filter?.type
  if (ft === 'dateRange') return 'date'
  if (ft === 'numberRange') return 'number'
  if (col.summaryType === 'sum' || col.summaryType === 'avg') return 'number'
  // 数值列常见 key
  if (/^(amount|price|num|count|age|sales|qty|total|金额|数量|价格|总额)/i.test(col.key)) {
    return 'number'
  }
  // 日期列常见 key
  if (/(date|time|日期|时间)/i.test(col.key)) return 'date'
  return 'text'
}

export interface OperatorOption<T extends string = string> {
  value: T
  label: string
  /** 是否需要第二个值 (区间) */
  range?: boolean
}

const TEXT_OPERATORS: OperatorOption<AdvancedTextOperator>[] = [
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'equals', label: '等于' },
  { value: 'notEqual', label: '不等于' },
  { value: 'startsWith', label: '开头是' },
  { value: 'endsWith', label: '结尾是' },
]
const NUMBER_OPERATORS: OperatorOption<AdvancedNumberOperator>[] = [
  { value: 'equals', label: '=' },
  { value: 'notEqual', label: '≠' },
  { value: 'greaterThan', label: '>' },
  { value: 'greaterThanOrEqual', label: '≥' },
  { value: 'lessThan', label: '<' },
  { value: 'lessThanOrEqual', label: '≤' },
  { value: 'inRange', label: '介于', range: true },
]
const DATE_OPERATORS: OperatorOption<AdvancedDateOperator>[] = [
  { value: 'equals', label: '等于' },
  { value: 'greaterThan', label: '晚于' },
  { value: 'greaterThanOrEqual', label: '不早于' },
  { value: 'lessThan', label: '早于' },
  { value: 'lessThanOrEqual', label: '不晚于' },
  { value: 'inRange', label: '介于', range: true },
]

export function getOperators(kind: AdvancedKind): OperatorOption[] {
  if (kind === 'number') return NUMBER_OPERATORS
  if (kind === 'date') return DATE_OPERATORS
  return TEXT_OPERATORS
}

/** 判断操作符是否需要第二个值 */
export function isRangeOperator(kind: AdvancedKind, op: string): boolean {
  return getOperators(kind).some(o => o.value === op && o.range)
}

// =====================================================
// 求值
// =====================================================

/** 行数据是否满足高级筛选模型; 空模型返回 true */
export function matchAdvancedFilter(
  row: Record<string, any>,
  model: AdvancedFilterModel | undefined | null,
): boolean {
  if (!model) return true
  if (model.filterType === 'join') return matchJoin(row, model)
  return matchLeaf(row, model)
}

function matchJoin(row: Record<string, any>, model: IJoinAdvancedFilter): boolean {
  if (model.conditions.length === 0) return true
  if (model.type === 'AND') {
    return model.conditions.every(c => matchAdvancedFilter(row, c))
  }
  return model.conditions.some(c => matchAdvancedFilter(row, c))
}

function matchLeaf(
  row: Record<string, any>,
  model: ITextAdvancedFilter | INumberAdvancedFilter | IDateAdvancedFilter,
): boolean {
  const raw = row[model.colId]
  if (model.filterType === 'text') return matchText(String(raw ?? ''), model)
  if (model.filterType === 'number') return matchNumber(raw, model)
  return matchDate(String(raw ?? ''), model)
}

function matchText(val: string, m: ITextAdvancedFilter): boolean {
  const f = m.filter
  if (!f) return true // 未填值, 不约束
  const v = val.toLowerCase()
  const q = f.toLowerCase()
  switch (m.type) {
    case 'contains': return v.includes(q)
    case 'notContains': return !v.includes(q)
    case 'equals': return v === q
    case 'notEqual': return v !== q
    case 'startsWith': return v.startsWith(q)
    case 'endsWith': return v.endsWith(q)
    default: return true
  }
}

function matchNumber(raw: any, m: INumberAdvancedFilter): boolean {
  const num = Number(raw)
  const f = m.filter
  const t = m.filterTo
  if (m.type === 'inRange') {
    if (f === undefined && t === undefined) return true
    if (isNaN(num)) return false
    if (f !== undefined && num < f) return false
    if (t !== undefined && num > t) return false
    return true
  }
  if (f === undefined) return true
  if (isNaN(num)) return false
  switch (m.type) {
    case 'equals': return num === f
    case 'notEqual': return num !== f
    case 'greaterThan': return num > f
    case 'greaterThanOrEqual': return num >= f
    case 'lessThan': return num < f
    case 'lessThanOrEqual': return num <= f
    default: return true
  }
}

function matchDate(val: string, m: IDateAdvancedFilter): boolean {
  // 取 yyyy-MM-dd 前 10 位, 按字符串比较
  const d = (val ?? '').slice(0, 10)
  const f = m.filter ? m.filter.slice(0, 10) : ''
  const t = m.filterTo ? m.filterTo.slice(0, 10) : ''
  if (m.type === 'inRange') {
    if (!f && !t) return true
    if (f && d < f) return false
    if (t && d > t) return false
    return true
  }
  if (!f) return true
  switch (m.type) {
    case 'equals': return d === f
    case 'greaterThan': return d > f
    case 'greaterThanOrEqual': return d >= f
    case 'lessThan': return d < f
    case 'lessThanOrEqual': return d <= f
    default: return true
  }
}

/** 构造一个空的 join 根 */
export function emptyJoin(type: AdvancedFilterJoin = 'AND'): IJoinAdvancedFilter {
  return { filterType: 'join', type, conditions: [] }
}
