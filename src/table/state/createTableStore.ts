import type { IColumn, ITableQuery } from "@/types";
import type { TableAction, TableState, TableMode, SortValue } from "@/table/state/types";

export type StateListener = (next: TableState, prev: TableState, action: TableAction) => void 

export interface TableStore {
  getState(): TableState
  dispatch(action: TableAction): void 
  subscribe(listener: StateListener): () => void  // 监听状态变化后, 执行的函数, 即响应式
}

export function createTableStore(params: {
  columns: IColumn[]
  mode: TableMode // bootstrapTable 决策出来的模式(数据量)
  frozenCount: number 
  initialState?: Partial<TableState> // 外部传入的初始 state
  onStateChange?: StateListener // 状态变化回调, 这时库对外的关键能力
}): TableStore {

  const { columns, mode, frozenCount, initialState, onStateChange } = params
  // 初始化 state, 默认按列的 key 顺序
  let state: TableState = {
    data: {
      mode,
      query: { filterText: '' },
      clientFilterText: '',
      sort: null,
    },
    columns: {
      order: columns.map((c) => c.key),
      frozenCount,
      widthOverrides: {}
    }
  }

  // 将外部的 initialState 浅浅合并进来 (前期够用的), 即, 用户传的去替换内置的
  if (initialState) {
    state = {
      ...state,
      ...initialState,
      data: { ...state.data, ...(initialState.data ?? {})},
      columns: { ...state.columns, ...(initialState.columns ?? {})}
    }
  }

  const listeners = new Set<StateListener>() // ([n,p,a], [n,p,a]....)

  function emit(next: TableState, prev: TableState, action: TableAction): void {
    listeners.forEach((fn) => fn(next, prev, action))
    onStateChange?.(next, prev, action)
  }

  function reduce(prev: TableState, action: TableAction): TableState {
    switch(action.type) {
      case 'INIT_FROM_CONFIG': {
        const order = action.payload.columns.map((c) => c.key)
        return {
          ...prev,
          data: {
            ...prev.data,
            mode: action.payload.mode
          },
          columns: {
            ...prev.columns,
            order,
            frozenCount: action.payload.frozenCount
          }
        }
      }

      case 'SET_MODE': {
        return {...prev, data: { ...prev.data, mode: action.payload.mode }}
      }

      case 'CLEAR_FILTER_TEXT': {
        const nextQuery: ITableQuery = { ...prev.data.query, filterText: ''}
        return {
          ...prev,
          data: { ...prev.data, query: nextQuery, clientFilterText: ''}
        }
      }

      case 'SET_FILTER_TEXT': {
        const text = action.payload.text
        const nextQuery: ITableQuery = { ...prev.data.query, filterText: text }
        return {
          ...prev,
          data: {
            ...prev.data,
            query: nextQuery,
            clientFilterText: text // client 也暂用这个文本筛选
          }
        }
      }

      case 'SORT_SET': {
        const sort: SortValue = action.payload.sort
        const nextQuery: ITableQuery = {
          ...prev.data.query,
          sortKey: sort?.key,
          sortDirection: sort?.direction
        }
        return { ...prev, data: { ...prev.data, sort, query: nextQuery }}
      }

      case 'SORT_TOGGLE': {
        const key = action.payload.key 
        const curr = prev.data.sort 
        let next: SortValue
        // 继续沿用排序三态: desc -> asc -> null 
        if (curr && curr.key === key) { // 当前字段
          if (curr.direction === 'desc') next = { key, direction: 'asc' }
          else next = null 
        } else {
          // 点击排序的是其他字段, 则先默认降序
          next = { key, direction: 'desc' }
        }
        const nextQuery: ITableQuery = {
          ...prev.data.query,
          sortKey: next?.key,
          sortDirection: next?.direction
        }
        return { ...prev, data: { ...prev.data, sort: next, query: nextQuery }}
      }

      case 'COLUMN_ORDER_SET': {
        return { ...prev, columns: { ...prev.columns, order: action.payload.order }}
      }

      case 'COLUMN_WIDTH_SET': {
        return {
          ...prev,
          columns: {
            ...prev.columns,
            widthOverrides: { ...prev.columns.widthOverrides, [action.payload.key]: action.payload.width}
          }
        }
      }

      case 'FROZEN_COUNT_SET': {
        return { ...prev, columns: { ...prev.columns, frozenCount: action.payload.count }}
      }

      default:
        return prev
    }
  }

  return {
    getState() {
      return state
    },
    
    dispatch(action: TableAction) {
      const prev = state 
      const next = reduce(prev, action)
      if (next === prev) return
      state = next 
      emit(next, prev, action) // 向外通知事件
    },

    subscribe(listener: StateListener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}