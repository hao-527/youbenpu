import Taro from '@tarojs/taro'

/**
 * Pick one compressed image and persist it when the platform exposes a temp file.
 * Static bundled/remote paths are returned unchanged by callers and are never removed.
 */
export async function choosePersistentImage(): Promise<string | null> {
  try {
    const result = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    const tempFilePath = result.tempFilePaths[0]
    if (!tempFilePath) return null

    try {
      const saved = await Taro.saveFile({ tempFilePath })
      return 'savedFilePath' in saved && typeof saved.savedFilePath === 'string'
        ? saved.savedFilePath
        : tempFilePath
    } catch {
      return tempFilePath
    }
  } catch {
    return null
  }
}
