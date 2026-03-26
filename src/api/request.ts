// 封装 fetch 请求
import { API_CONFIG } from "./config";


/** 请求错误类 */
export class RequestError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: any
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

/** 通用函数请求 */
export async function request<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {

  const { baseURL, timeout, headers: defaultHeaders } = API_CONFIG
  // 拼接完整的 url
  const fullURL = url.startsWith('http') ? url : `${baseURL}${url}`
  // 合并请求头
  const headers = {
    ...defaultHeaders,
    ...options.headers,
  }

  // 创建 AbortController 实现超时
  const controller = new AbortController()
  const timeoutID = setTimeout(() => controller.abort(), timeout)

  try {
    // 发 fetch 请求
    const response = await fetch(fullURL, {
      ...options,
      headers,
      signal: controller.signal
    })

    clearTimeout(timeoutID)

    // 处理非 2xx 响应
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new RequestError(
        errorData.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorData
      )
    }

    // 解析成功的 json 数据
    return await response.json()
    
  } catch (error) {
    clearTimeout(timeoutID)    

    if (error instanceof RequestError) {
      throw error 
    }

    // 先上 any 大法吧
    const err = error as any 

    if (err.name === 'AbortError') {
      throw new RequestError('请求超时')
    }

    // 尝试获取 message, 若无则给默认值
    const message = typeof err === 'string' ? err : (err.message || '网络请求失败')

    throw new RequestError(message, undefined, err)
  }
}

/**
 * GET 请求
 */
export function get<T = any>(url: string, params?: Record<string, any>): Promise<T> {
  // 构建查询参数
  const queryString = params ? `?${new URLSearchParams(params).toString()}` : ''
  return request<T>(`${url}${queryString}`, { method: 'GET' })
}

/**
 * POST 请求
 */
export function post<T = any>(url: string, data?: any): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}