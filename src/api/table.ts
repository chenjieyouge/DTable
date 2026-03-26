// 表格数据接口
import { API_ENDPOINTS } from "@/api/config";
import { get, post } from "@/api/request";
import { IAllDataResponse } from "@/api/types";
import { ColumnFilterValue, IPageResponse, ITableQuery } from "@/types";


/** 将前端 ColumnFilterValue 转换为后端可识别的格式 */
function serializeFilters(
  columnFilters: Record<string, ColumnFilterValue>
): Record<string, unknown> {

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(columnFilters)) {
    if (value.kind === 'set') {
      result[key] = value.values

    } else if (value.kind === 'text') {
      result[key] = value.value

    } else if (value.kind === 'numberRange') {
      result[key] = { min: value.min, max: value.max }

    } else if (value.kind === 'dateRange') {
      result[key] = { min: value.start, max: value.end }
    }
  }

  return result
}


/** 获取分页数据 */
export async function fetchTablePage(
  pageIndex: number,
  pageSize: number = 50,
  query?: ITableQuery

): Promise<IPageResponse> {
  const body: Record<string, unknown> = {
    pageIndex,  // 都是传 int 
    pageSize,
  }

  // 添加排序参数
  if (query?.sortKey && query?.sortDirection) {
    body.sort = `${query.sortKey}:${query.sortDirection}`
  }

  // 添加筛选参数
  if (query?.columnFilters) {
    body.filters = serializeFilters(query.columnFilters)
  }

  return post<IPageResponse>(API_ENDPOINTS.TABLE_PAGE, body)
}


/** 获取全量数据 */
export async function fetchTableAll(
  limit: number = 100000

): Promise<IAllDataResponse>{
  return get<IAllDataResponse>(API_ENDPOINTS.TABLE_ALL, { limit })
}

/** 获取筛选项 */
export async function fetchFilterOptions(
  columnKey: string,
  query?: ITableQuery,

): Promise<string[]> {
  const body: Record<string, unknown> = { columnKey }
  // 可选: 传递当前查询条件, 后端返回基于当前筛选的可选值
  if (query?.columnFilters) {
    body.filters = serializeFilters(query.columnFilters)
  }

  return post<string[]>(API_ENDPOINTS.TABLE_FILTER_OPTIONS, body)
}

