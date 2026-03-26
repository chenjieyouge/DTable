/** API 配置 */
export const API_CONFIG = {
  // 开发环境: baseURL 为空, 走 Vite 代理 (/api -> localhost:8080)
  // 生产环境
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  }
}

/** API 端点路径 */
export const API_ENDPOINTS = {
  // 表格数据相关
  TABLE_PAGE: '/api/table/page',  // 分页数据
  TABLE_ALL: '/api/table/all',    // 全量数据
  TABLE_SUMMARY: '/api/table/summary', // 汇总行数据
  TABLE_FILTER_OPTIONS: '/api/table/filter-options', // 筛选选项
} as const 