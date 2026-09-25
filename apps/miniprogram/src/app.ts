import Taro from '@tarojs/taro'
import { createElement, useEffect } from 'react'
import type { PropsWithChildren } from 'react'

import { ensureLoggedIn } from './api'
import './app.scss'
import { FeedbackProvider } from './components/feedback'
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
    //
    // On H5 (used for design-capture / browser preview) there is no WeChat
    // runtime, so `Taro.login()` rejects with a plain object. Wrap in an async
    // IIFE with try/catch so that rejection can never surface as an unhandled
    // promise rejection (which the dev-server overlay would otherwise show).
    void (async () => {
      try {
        await ensureLoggedIn()
      } catch {
        /* offline / login failure — app stays browsable */
      }
    })()
  }, [])

  // FeedbackProvider wraps the app so any screen can call useToast()/useConfirm()
  // for self-designed toasts and confirm dialogs (replacing Taro.showToast/showModal).
  return createElement(FeedbackProvider, null, createElement(StoreProvider, null, children))
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
