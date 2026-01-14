import type { TableAction } from "@/table/state/types";
import type { VirtualTable } from "@/table/VirtualTable";

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

// Action 处理映射表
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
])

// 列宽处理器
export function handleColumnWidthSet(action: TableAction, ctx: ActionContext): void {
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
      widths[col.key] = col.width
    })
    storage.saveColumnWidth(widths)
  }
}

// 列顺序调整处理器
export function handleColumnOrderSet(action: TableAction, ctx: ActionContext): void {
  if (action.type !== 'COLUMN_ORDER_SET') return 
  ctx.table['updateColumnUI']()
  // 也保存到 localStorage
  const storage = ctx.table['widthStorage']
  if (storage) {
    const columnKeys = ctx.table['config'].columns.map(col => col.key)
    storage.saveColumnOrder(columnKeys)
  }
}

// 列显示/隐藏处理器
export function handleColumnVisibility(action: TableAction, ctx: ActionContext): void {
  // 列的隐藏, 显示, 批量隐藏, 显示, 重置, 都是一个处理套路
  const types = ['COLUMN_HIDE', 'COLUMN_SHOW', 'COLUMN_BATCH_HIDE', 'COLUMN_BATCH_SHOW', 'COLUMNS_RESET_VISIBILITY']

  if (!types.includes(action.type)) return 
  ctx.table['updateColumnUI']()
}

// 冻结列调整处理器 (当前暴力 rebuild)
export function handleFrozenCountSet(action: TableAction, ctx: ActionContext): void {
  if (action.type !== 'FROZEN_COUNT_SET') return 
  ctx.table['rebuild']()
}

// 数据筛选/排序处理器
export function handleDataChange(action: TableAction, ctx: ActionContext): void {
  const shell = ctx.table['shell']
  const store = ctx.table['store']
  // 排序指示器永远以 state 为准
  shell?.setSortIndicator(store.getState().data.sort)

   // 排序/筛选变化 -> 根据模式(cleint, server) 触发数据侧更新
   const state = store.getState()
   if (state.data.mode === 'client') {

    void ctx.table['applyClientState'](state)
    void ctx.table['refreshSummary']()  // 更新总结行会自动判断是 client 还是 server

   } else {
    // 走服务端 api 模式, 后端处理好筛选, 排序等逻辑, 前端直接渲染即可
    void ctx.table['applyServerQuery'](state.data.query)
    void ctx.table['refreshSummary']()
   }
}

