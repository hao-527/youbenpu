import Taro from '@tarojs/taro'

export async function chooseBillFile(): Promise<string | File | null> {
  if (process.env.TARO_ENV !== 'h5') {
    try {
      const chosen = await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['csv', 'xlsx'] })
      return chosen.tempFiles?.[0]?.path || null
    } catch (error: unknown) {
      const cause = error as { errMsg?: string; message?: string }
      const message = String(cause?.errMsg || cause?.message || '')
      if (/cancel/i.test(message)) return null
      if (/not.?support|unsupported|devtools|开发者工具/i.test(message)) {
        throw new Error('当前环境不支持聊天文件选择，请在微信客户端中导入账单')
      }
      throw new Error('账单文件选择失败，请重试，或在微信客户端中从聊天选择文件')
    }
  }
  // H5 has no chat file API. Use the browser's native picker for the same formats.
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.csv,.xlsx'
    input.style.display = 'none'
    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      input.remove()
      resolve(file)
    }
    const onFocus = () => setTimeout(() => { if (!input.files?.length) finish(null) }, 500)
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true })
    input.addEventListener('cancel', () => finish(null), { once: true })
    window.addEventListener('focus', onFocus, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}
