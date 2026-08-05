import Taro from '@tarojs/taro'

/**
 * Pick one compressed image and move it into the app's saved-file area.
 *
 * Returns null when the image could not be persisted. It deliberately does NOT
 * fall back to the temp path: temp files are discarded when the miniprogram
 * restarts, so persisting one produces an entry that silently turns into a
 * broken image later. Failing loudly and immediately is recoverable; a broken
 * reference written into storage is not.
 *
 * Known limitation: WeChat caps the saved-file area at 10MB and this never
 * deletes anything. Reference counting would be required first, because
 * MealOrderItem.photo snapshots a dish's photo path — deleting a replaced dish
 * photo would blank out the thumbnails on historical orders.
 */
export async function choosePersistentImage(): Promise<string | null> {
  let tempFilePath = ''

  try {
    const result = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
    tempFilePath = result.tempFilePaths[0] ?? ''
  } catch {
    // User cancelled the picker, or the platform denied access. Not an error.
    return null
  }

  if (!tempFilePath) return null

  try {
    return await saveToUserData(tempFilePath)
  } catch {
    Taro.showToast({ title: '图片保存失败，请清理本地空间后重试', icon: 'none', duration: 2500 })
    return null
  }
}

/** Promise wrapper over the non-deprecated FileSystemManager.saveFile. */
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
