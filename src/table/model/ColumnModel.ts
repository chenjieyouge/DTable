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
  // key -> column 映射
  const map = new Map<string, IColumn>()

  originalColumns.forEach(c => map.set(c.key, c)) // 列初始列顺序, 就是配置顺序
  const orderKeys = state.columns.order
  const frozenCount = state.columns.frozenCount
  const widthOverrides = state.columns.widthOverrides

  // 按 state 的 order 生成最终列数组 (先不用支持隐藏列)
  const ordered = orderKeys
    .map(key => map.get(key))
    .filter((c): c is IColumn => Boolean(c))

  // 若 orderKeys 少了某些列, 用户少传, 则将缺失列放到末尾, 保证稳定
  if (ordered.length !== originalColumns.length) {
    const orderedKeySet = new Set(ordered.map(c => c.key))
    for (const c of originalColumns) {
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
