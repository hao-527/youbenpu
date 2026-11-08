import Taro from '@tarojs/taro'
import { clearCurrentInviteCode } from '../utils/invite-state'
import { API, requireWechatLogin } from './config'

// Keep official WeChat sessions separate from simulator identities and from
// credentials issued by a different API environment.
const sessionPrefix = requireWechatLogin ? `youbenpu_wechat_${encodeURIComponent(API.BASE)}` : 'youbenpu'
const TOKEN_KEY = `${sessionPrefix}_token`
const USER_KEY = `${sessionPrefix}_user`

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
  const previous = getUserInfo()
  const changed = previous && (previous.familyId !== info.familyId || previous.userId !== info.userId)
  if (changed) clearCurrentInviteCode()
  Taro.setStorageSync(USER_KEY, JSON.stringify(info))
  if (changed) identityChangeListeners.forEach(listener => listener())
}

export function clearUserInfo(): void {
  Taro.removeStorageSync(USER_KEY)
}

const identityChangeListeners = new Set<() => void>()
export function onIdentityChanged(listener: () => void): () => void {
  identityChangeListeners.add(listener)
  return () => { identityChangeListeners.delete(listener) }
}

const sessionClearListeners = new Set<(reason: string) => void>()

export function onSessionCleared(listener: (reason: string) => void): () => void {
  sessionClearListeners.add(listener)
  return () => sessionClearListeners.delete(listener)
}

export function clearSession(reason = ''): void {
  clearCurrentInviteCode()
  clearToken()
  clearUserInfo()
  sessionClearListeners.forEach((listener) => listener(reason))
}

export function isLoggedIn(): boolean {
  return !!getToken()
}

export function hasFamily(): boolean {
  const info = getUserInfo()
  return !!info?.familyId
}

/** Ignore delayed failures from a request issued before the current login. */
export function clearSessionIfCurrent(requestToken: string, reason = ''): void {
  if (requestToken && getToken() === requestToken) clearSession(reason)
}
