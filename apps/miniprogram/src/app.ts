import Taro from '@tarojs/taro'
import { useEffect } from 'react'
import type { PropsWithChildren } from 'react'

import { ensureLoggedIn } from './api'
import './app.scss'
import { StoreProvider } from './store'
import { parseInviteScene, setPendingInvite, getPendingInvite } from './utils/pending-invite'
import { getCurrentInviteCode } from './utils/invite-state'

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    // Park an invite code from a scanned QR so the family-setup sheet can
    // pre-fill it whenever the user opens it.
    const scene = Taro.getLaunchOptionsSync?.().query?.scene as string | undefined
    const code = parseInviteScene(scene)
    if (code) setPendingInvite(code)

    // Silent login. There is no longer a blocking auth page: a new user lands
    // straight in the app and is only asked to create/join a family when they
    // open 我的 or use a feature that needs one. Family setup shares this
    // in-flight request so an early tap still has a valid token.
    ensureLoggedIn().catch(() => { /* offline / login failure — app still browsable */ })
  }, [])

  return StoreProvider({ children })
}

// Global share handler for WeChat native share (分享)
App.onShareAppMessage = () => {
  // Try to get invite code from current state, fallback to pending invite
  const code = getCurrentInviteCode() || getPendingInvite()

  if (code) {
    return {
      title: '邀请你加入我的家庭 | 生活有本谱',
      path: `/pages/family-manage/index?invite=${code}`,
      imageUrl: '', // WeChat will use default thumbnail if empty
      promise: Promise.resolve()
    }
  }

  // Default share if no invite code
  return {
    title: '生活有本谱 - 家庭日常记录工具',
    path: '/pages/home/index',
    imageUrl: '',
    promise: Promise.resolve()
  }
}

export default App
