import Taro from '@tarojs/taro'

const KEY = 'youbenpu_pending_invite'

/**
 * Invite codes that arrive from a scanned QR code (launch `scene` param) are
 * parked here until the family-setup sheet opens and can pre-fill them.
 */
export function setPendingInvite(code: string): void {
  Taro.setStorageSync(KEY, code)
}

export function peekPendingInvite(): string {
  return Taro.getStorageSync(KEY) || ''
}

/** Alias for peekPendingInvite (read without clearing). */
export const getPendingInvite = peekPendingInvite

/** Reads and clears the parked invite code. */
export function consumePendingInvite(): string {
  const code = peekPendingInvite()
  if (code) Taro.removeStorageSync(KEY)
  return code
}

/** Extracts an invite code from a launch `scene` string, if present. */
export function parseInviteScene(scene?: string): string {
  if (!scene) return ''
  try {
    const match = decodeURIComponent(scene).match(/invite=([A-Za-z0-9]+)/)
    return match ? match[1].toUpperCase() : ''
  } catch {
    return ''
  }
}
