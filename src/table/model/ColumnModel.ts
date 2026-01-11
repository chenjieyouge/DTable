import type { IColumn } from "@/types";
import type { TableState } from "@/table/state/types";

export interface ResolvedColumn extends IColumn {
  isFrozen: boolean // 只做前 N 行冻结
}

// 校验用户传入的列字段 key 必须是唯一, title 别名无所谓
export function assertUniqueColumnKeys(columns: IColumn[]) {
  const set = new Set<string>()
  for (const col of columns) {
    if (set.has(col.key)) {
      throw new Error(`columns.key must be unique, duplicate key: ${col.key}`)
    }
    set.add(col.key)
  }
}

// 列解析: 顺序, 宽度, 冻结等
export function resolveColumns(params: {
  originalColumns: IColumn[]
  state: TableState
}): ResolvedColumn[] {

  const { originalColumns, state } = params
  const { order, widthOverrides, hiddenKeys, frozenCount } = state.columns

  // 先过滤掉隐藏的列, 技巧就是: 先过滤, 后排序
  const visibleColumns = originalColumns.filter(col => !hiddenKeys.includes(col.key))
  // 构建 key -> column 映射, 只包含可见列
  const map = new Map<string, IColumn>()
  visibleColumns.forEach(c => map.set(c.key, c))  

  // 按 state.order 排序, 只包含可见的 key 
  const visibleOrder = order.filter(key => !hiddenKeys.includes(key))
  const ordered = visibleOrder
    .map(key => map.get(key))
    .filter((c): c is IColumn => Boolean(c))

  // 若 order 中 缺少某些可见列, 则补充到末尾
  if (ordered.length !== visibleColumns.length) {
    const orderedKeySet = new Set(ordered.map(c => c.key))
    for (const c of visibleColumns) {
      if (!orderedKeySet.has(c.key)) {
        ordered.push(c) // 找出少的列补充到后面即可
      }
    }
  }

  // 列宽度覆写 + 计算冻结列 (前 N 列)
  return ordered.map((col, index) => {
    const overrideWidth = widthOverrides[col.key]
    return {
      ...col,
      width: typeof overrideWidth === 'number' ? overrideWidth: col.width,
      isFrozen: index < frozenCount
    }
  })
}
