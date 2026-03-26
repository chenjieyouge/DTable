// api 类型定义
import { IPageResponse, ITableQuery } from "@/types";


/** 分页请求参数 */
export interface IPageRequest {
  pageIndex: number 
  pageSize: number 
  sort?: string  // 格式: "fieldKey:asc" 或 "fieldKey:desc"
  filter?: Record<string, any>
}

/** 全量数据请求参数 */
export interface IAllDataRequest {
  limit?: number  // 最大返回数量
}

/** 筛选项请求参数 */
export interface IFilterOptionsRequest {
  columnKey: string 
  query?: ITableQuery
}

/** 全量数据响应 */
export interface IAllDataResponse {
  list: Record<string, any>
  totalRows: number
}