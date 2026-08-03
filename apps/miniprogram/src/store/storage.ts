import Taro from '@tarojs/taro'

const STORAGE_KEY = 'youbenpu_state'

export function loadState<T>(fallback: T): T {
  try {
    const raw = Taro.getStorageSync(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as T
  } catch { /* ignore */ }
  return fallback
}

export function saveState<T>(state: T): void {
  try {
    Taro.setStorageSync(STORAGE_KEY, JSON.stringify(state))
  } catch { /* ignore */ }
}
