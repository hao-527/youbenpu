import Taro from '@tarojs/taro'

import { getUploadPresign } from '../api'
import { API } from '../api/config'
import { getToken } from '../api/token'

/**
 * Pick one image, upload to COS, return the public URL.
 *
 * Flow:
 * 1. User picks image (compressed)
 * 2. Get presign credentials from backend
 * 3. Upload directly to COS via wx.uploadFile
 * 4. Return the full COS URL
 *
 * Falls back to local persistence if upload fails (offline mode).
 */
export async function choosePersistentImage(): Promise<string | null> {
  let tempFilePath = ''

  try {
    const result = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    tempFilePath = result.tempFilePaths[0] ?? ''
  } catch {
    return null
  }

  if (!tempFilePath) return null

  // Try uploading to COS
  try {
    const url = await uploadToCOS(tempFilePath)
    if (url) return url
  } catch {
    // Fall through to local save
  }

  // Fallback: save locally
  try {
    return await saveToUserData(tempFilePath)
  } catch {
    Taro.showToast({ title: '图片保存失败', icon: 'none', duration: 2500 })
    return null
  }
}

/**
 * Upload a temp file directly to COS using presigned credentials.
 * Returns the full public URL on success, null on failure.
 */
async function uploadToCOS(tempFilePath: string): Promise<string | null> {
  // Determine file extension
  const ext = tempFilePath.split('.').pop()?.toLowerCase() || 'jpg'
  const allowedExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg'

  // Get presign credentials from our API
  const presign = await getUploadPresign(allowedExt)

  // Upload to COS using POST Object
  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: presign.url,
      filePath: tempFilePath,
      name: 'file',
      formData: {
        key: presign.key,
        policy: presign.policy,
        'q-sign-algorithm': 'sha1',
        'q-ak': presign.secret_id,
        'q-key-time': getKeyTime(),
        'q-signature': presign.signature,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Construct the full URL
          const fullUrl = `${presign.url}/${presign.key}`
          resolve(fullUrl)
        } else {
          // COS POST Object may not work with simple policy for all configs.
          // Use PUT Object as alternative.
          uploadWithPut(tempFilePath, presign).then(resolve).catch(reject)
        }
      },
      fail: () => reject(new Error('upload failed'))
    })
  })
}

/**
 * Alternative: upload via PUT Object (simpler for COS with presigned URL).
 */
function uploadWithPut(tempFilePath: string, presign: { url: string; key: string }): Promise<string> {
  const fullUrl = `${presign.url}/${presign.key}`

  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: fullUrl,
      filePath: tempFilePath,
      name: 'file',
      header: {
        'Content-Type': 'image/jpeg'
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(fullUrl)
        } else {
          reject(new Error(`COS PUT failed: ${res.statusCode}`))
        }
      },
      fail: () => reject(new Error('upload failed'))
    })
  })
}

function getKeyTime(): string {
  const now = Math.floor(Date.now() / 1000)
  const end = now + 600 // 10 minutes
  return `${now};${end}`
}

/** Fallback: save to local file system (WeChat saved-file area). */
function saveToUserData(tempFilePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let manager: ReturnType<typeof Taro.getFileSystemManager>
    try {
      manager = Taro.getFileSystemManager()
    } catch (error) {
      reject(error)
      return
    }

    manager.saveFile({
      tempFilePath,
      success: (res) => {
        const saved = (res as { savedFilePath?: string }).savedFilePath
        if (typeof saved === 'string' && saved) resolve(saved)
        else reject(new Error('saveFile returned no savedFilePath'))
      },
      fail: (error) => reject(error)
    })
  })
}
