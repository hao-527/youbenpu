import Taro from '@tarojs/taro'

const TOKEN_KEY = 'youbenpu_token'
const USER_KEY = 'youbenpu_user'

export interface UserInfo {
  userId: string
  familyId: string | null
  displayName: string
  role: string
}

export function getToken(): string {
  return Taro.getStorageSync(TOKEN_KEY) || ''
}

export function setToken(token: string): void {
  Taro.setStorageSync(TOKEN_KEY, token)
}

export function clearToken(): void {
  Taro.removeStorageSync(TOKEN_KEY)
}

export function getUserInfo(): UserInfo | null {
  const raw = Taro.getStorageSync(USER_KEY)
  if (!raw) return null
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

export function setUserInfo(info: UserInfo): void {
  Taro.setStorageSync(USER_KEY, JSON.stringify(info))
}

export function clearUserInfo(): void {
  Taro.removeStorageSync(USER_KEY)
}

const sessionClearListeners = new Set<() => void>()

export function onSessionCleared(listener: () => void): () => void {
  sessionClearListeners.add(listener)
  return () => sessionClearListeners.delete(listener)
}

export function clearSession(): void {
  clearToken()
  clearUserInfo()
  sessionClearListeners.forEach((listener) => listener())
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

export function hasFamily(): boolean {
  const info = getUserInfo()
  return !!info?.familyId
}
