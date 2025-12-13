import { IPageInfo } from '@/types'

// 根据起始行号和分页配置, 计算当前可视区的, 页面范围
export function caculatePageRange(
  startRow: number,
  endRow: number,
  totalRows: number,
  pageSize: number
): IPageInfo {
  const totalPages = Math.ceil(totalRows / pageSize)
  const startPage = Math.floor(startRow / pageSize) + 1
  const endPage = Math.floor(endRow / pageSize) + 1
  // 防御性处理: 避免页面超过总页数
  return {
    startPage: Math.min(startPage, totalPages),
    endPage: Math.min(endPage, totalPages),
    totalPages,
  }
}
