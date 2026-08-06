import Taro from '@tarojs/taro'

import { clearToken, clearUserInfo, getToken } from './token'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  /** Skip auth header (for login endpoint) */
  noAuth?: boolean
  /** Query params for GET */
  params?: Record<string, string>
}

interface ApiError {
  code: string
  message: string
}

export class HttpError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

async function request<T>(method: Method, url: string, data?: unknown, options?: RequestOptions): Promise<T> {
  const header: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (!options?.noAuth) {
    const token = getToken()
    if (token) {
      header['Authorization'] = `Bearer ${token}`
    }
  }

  // Append query params for GET
  let finalUrl = url
  if (options?.params && method === 'GET') {
    const search = Object.entries(options.params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    if (search) finalUrl += `?${search}`
  }

  try {
    const response = await Taro.request({
      url: finalUrl,
      method,
      data: method !== 'GET' ? data : undefined,
      header,
      timeout: 15000
    })

    const { statusCode, data: responseData } = response

    if (statusCode >= 200 && statusCode < 300) {
      return responseData as T
    }

    // Handle auth errors
    if (statusCode === 401) {
      clearToken()
      clearUserInfo()
      // Will be caught by the app to redirect to login
      throw new HttpError(401, 'UNAUTHORIZED', '登录已过期')
    }

    // Parse error response
    const apiError = responseData as ApiError
    throw new HttpError(
      statusCode,
      apiError?.code || 'UNKNOWN',
      apiError?.message || '请求失败'
    )
  } catch (error) {
    if (error instanceof HttpError) throw error

    // Network errors
    throw new HttpError(0, 'NETWORK_ERROR', '网络连接失败，请检查网络')
  }
}

export function get<T>(url: string, options?: RequestOptions): Promise<T> {
  return request<T>('GET', url, undefined, options)
}

export function post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>('POST', url, data, options)
}

export function put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>('PUT', url, data, options)
}

export function del<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>('DELETE', url, data, options)
}
