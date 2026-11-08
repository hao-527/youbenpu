import Taro from '@tarojs/taro'

import { API } from '../api/config'
import { clearSessionIfCurrent, getToken } from '../api/token'

interface UploadResponse {
  url?: string
  error?: {
    code?: string
    message?: string
  }
}

/**
 * Pick one image, upload it to the current API server, and return its shared URL.
 * Device-only `wxfile://` paths are never persisted in family records.
 */
export async function choosePersistentImage(): Promise<string | null> {
  let tempFilePath = ''

  try {
    const result = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    tempFilePath = result.tempFilePaths[0] ?? ''
  } catch (error: unknown) {
    const cause = error as { errMsg?: string; message?: string }
    if (!/cancel/i.test(String(cause?.errMsg || cause?.message || ''))) {
      Taro.showToast({ title: '图片选择失败，请重试或在微信客户端中选择', icon: 'none', duration: 2500 })
    }
    return null
  }

  if (!tempFilePath) return null

  try {
    return await uploadImage(tempFilePath)
  } catch (error) {
    const message = error instanceof Error ? error.message : '图片上传暂不可用，请稍后重试'
    Taro.showToast({ title: message, icon: 'none', duration: 2500 })
    return null
  }
}

/** Upload a selected image to the authenticated local API endpoint. */
function uploadImage(tempFilePath: string): Promise<string> {
  const token = getToken()
  if (!token) {
    return Promise.reject(new Error('登录状态已失效，请稍后重试'))
  }

  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: API.UPLOAD,
      // JWT is the credential; H5 must not send cookie credentials to a '*' CORS endpoint.
      ...(process.env.TARO_ENV === 'h5' ? { withCredentials: false } : {}),
      timeout: 30000,
      filePath: tempFilePath,
      name: 'file',
      header: {
        Authorization: `Bearer ${token}`,
      },
      success: (result) => {
        if (result.statusCode === 401) clearSessionIfCurrent(token, '登录已过期，请重试')
        let body: UploadResponse = {}
        try {
          body = JSON.parse(result.data || '{}') as UploadResponse
        } catch {
          reject(new Error('图片上传响应异常，请稍后重试'))
          return
        }

        if (result.statusCode >= 200 && result.statusCode < 300 && body.url) {
          resolve(body.url)
          return
        }

        reject(new Error(body.error?.message || '图片上传暂不可用，请稍后重试'))
      },
      fail: () => reject(new Error('图片上传失败，请检查网络后重试')),
    })
  })
}
