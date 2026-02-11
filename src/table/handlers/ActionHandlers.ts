import type { TableAction } from "@/table/state/types";
import type { VirtualTable } from "@/table/VirtualTable";
import { ITableQuery } from "@/types";

// ActionHandlers 策略模式, 搞成类似 vue 的风格了

// Action 上下文, 就是 VirtualTable 类啦 
export interface ActionContext {
  table: VirtualTable
}

// Action 处理器类型
export type ActionHandler = (
  action: TableAction,
  context: ActionContext
) => void 

// ===== effects 副作用白名单分类: 数据; 列管理; 表结构; 纯状态; ========== 
/**
 * 数据-副作用白名单:  这些 action 会触发数据更新 (排序/筛选/查询等变化)
 * 只有这些 action 才能调用 applyClientState / applyServerQuery
 */
export const DATA_EFFECT_ACTIONS = new Set<string>([
  'SORT_TOGGLE',
  'SORT_SET',
  'SET_FILTER_TEXT',
  'CLEAR_FILTER_TEXT',
  'COLUMN_FILTER_SET',
  'COLUMN_FILTER_CLEAR'
])

/**
 * 列管理-副作用白名单: 这些 action 会触发 列 UI 更新
 */
export const COLUMN_EFFTECT_ACTIONS = new Set<string>([
  'COLUMN_WIDTH_SET',
  'COLUMN_ORDER_SET',
  'COLUMN_HIDE',
  'COLUMN_SHOW',
  'COLUMN_BATCH_HIDE',
  'COLUMN_BATCH_SHOW',
  'COLUMNS_RESET_VISIBILITY'
])

/**
 * 结构-副作用白名单: 这些 action 会触发表格重建 rebuild 
 */
export const STRUCTURAL_EFFECT_ACTIONS = new Set<string>([
  'FROZEN_COUNT_SET'
])

/**
 * 纯状态更新-副作用白名单:  这些 action 只是更新 state, 不触发任何副作用
 */
export const STATE_ONLY_ACTIONS = new Set<string>([
  'SET_TOTAL_ROWS',
  'SET_CURRENT_PAGE',
  'INIT_FROM_CONFIG',
  'SET_MODE'
])


// ===== Action 注册处理映射表 ========== 

export const actionHandlers = new Map<string, ActionHandler>([
  // 表宽度和列顺序变化
  ['COLUMN_WIDTH_SET', handleColumnWidthSet], 
  ['COLUMN_ORDER_SET', handleColumnOrderSet],
  // 列显示隐藏都是一个套路
  ['COLUMN_HIDE', handleColumnVisibility],
  ['COLUMN_SHOW', handleColumnVisibility],
  ['COLUMN_BATCH_HIDE', handleColumnVisibility],
  ['COLUMN_BATCH_SHOW', handleColumnVisibility],
  ['COLUMNS_RESET_VISIBILITY', handleColumnVisibility],
  // 冻结列
  ['FROZEN_COUNT_SET', handleFrozenCountSet],
  // 纯状态更新
  ['SET_TOTAL_ROWS', handleNoOp],
  ['SET_CURRENT_PAGE', handleNoOp],
  // 数据副作用
  ['SORT_TOGGLE', handleDataChange],
  ['SORT_SET', handleDataChange],
  ['SET_FILTER_TEXT', handleDataChange],
  ['CLEAR_FILTER_TEXT', handleDataChange],
  ['COLUMN_FILTER_SET', handleDataChange],
  ['COLUMN_FILTER_CLEAR', handleDataChange]
])

// 列宽处理器
export function handleColumnWidthSet(action: TableAction, ctx: ActionContext): void {
  // 白名单校验
  if (!COLUMN_EFFTECT_ACTIONS.has(action.type)) {
    console.error(`[handleColumnWidthSet] action "${action.type}" 不在列管理副作用白名单中!`)
    return
  }

  if (action.type !== 'COLUMN_WIDTH_SET') return 

  ctx.table['applyColumnsFromState']()
  ctx.table['shell'].updateColumnWidths(
    ctx.table['config'].columns,
    ctx.table['viewport'].getVisibleRows()
  )
  // 保存到 localStorage
  const storage = ctx.table['widthStorage']
  if (storage) {
    const widths: Record<string, number> = {}
    ctx.table['config'].columns.forEach(col =>{
      if (col.width) {
        widths[col.key] = col.width
      }
    })
    storage.saveColumnWidth(widths)
  }
}

// 列顺序调整处理器
export function handleColumnOrderSet(action: TableAction, ctx: ActionContext): void {
  // 白名单校验 
  if (!COLUMN_EFFTECT_ACTIONS.has(action.type)) {
    console.error(`[handleColumnOrderSet] action "${action.type}" 不在列管理副作用白名单中!`)
    return 
  }

  if (action.type !== 'COLUMN_ORDER_SET') return 
  
  ctx.table['updateColumnUI']()
  // 也保存到 localStorage
  const storage = ctx.table['widthStorage']
  if (storage) {
    const columnKeys = ctx.table['config'].columns.map(col => col.key)
    storage.saveColumnOrder(columnKeys)
  }
}

// 列显示/隐藏/重置等处理器
export function handleColumnVisibility(action: TableAction, ctx: ActionContext): void {
  // 白名单校验
  if (!COLUMN_EFFTECT_ACTIONS.has(action.type)) {
    console.error(`[handleColumnVisibility] action "${action.type} 不在列管理副作用白名单中!`)
    return 
  }

  ctx.table['updateColumnUI']()
}

// 冻结列调整处理器 (当前暴力 rebuild)
export function handleFrozenCountSet(action: TableAction, ctx: ActionContext): void {
  // 白名单校验
  if (!STRUCTURAL_EFFECT_ACTIONS.has(action.type)) {
    console.error(`[handleFrozenCountSet] action "${action.type}" 不再结构副作用白名单中!`)
    return 
  }

  if (action.type !== 'FROZEN_COUNT_SET') return 
  ctx.table['rebuild']() // 就用了一次暴力重建, 感觉增量更新都搞完了
}

// 数据变化统一处理: 筛选/排序等处理器
export function handleDataChange(action: TableAction, ctx: ActionContext): void {
  // 白名单校验
  if (!DATA_EFFECT_ACTIONS.has(action.type)) {
    console.error(`[handleDataChange] action "${action.type}" 不在数据副作用名单中!`)
    return 
  }

  const shell = ctx.table['shell']
  const store = ctx.table['store']
  const state = store.getState()
  // 排序指示器永远以 state 为准
  shell?.setSortIndicator(store.getState().data.sort)

  // 统一走 applyQuery, 不再区分 client/server
  const query: ITableQuery = {
    sortKey: state.data.sort?.key,
    sortDirection: state.data.sort?.direction,
    filterText: state.data.mode === 'client' ? state.data.clientFilterText : state.data.query.filterText,
    columnFilters: state.data.columnFilters
  }

  void ctx.table['applyQuery'](query)
}

// 空处理器, 用于更新 state, 不触发副作用的 action 
export function handleNoOp(action: TableAction, ctx: ActionContext): void {
  // 什么都不做, 只是为了防止走到 默认的 handleDataChange
}

