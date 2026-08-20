import Taro from '@tarojs/taro'

/**
 * The WeChat login `code` is single-use and changes on every call. In the
 * local demo environment (where no real WX_APPID is configured), keep a
 * device-local identifier so the backend can recognise the same tester after
 * a restart. Production ignores this field and uses the real WeChat openid.
 */
const DEV_IDENTITY_KEY = 'youbenpu_demo_identity'

export function getStableDemoIdentity(): string {
  const stored = Taro.getStorageSync(DEV_IDENTITY_KEY)
  if (typeof stored === 'string' && /^[a-z0-9-]{16,96}$/i.test(stored)) {
    return stored
  }

  const identity = `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
  Taro.setStorageSync(DEV_IDENTITY_KEY, identity)
  return identity
}
