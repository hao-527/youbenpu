
import { useShareAppMessage, useShareTimeline } from '@tarojs/taro'
import type { ShareAppMessageReturnObject, ShareTimelineReturnObject } from '@tarojs/taro'

import { getCurrentInviteCode } from '../utils/invite-state'
import { getPendingInvite } from '../utils/pending-invite'

const APP_NAME = '生活有本谱'
const DEFAULT_TITLE = '生活有本谱 · 家庭记账、物品管理、一起点餐'
const DEFAULT_PATH = '/pages/home/index'

export interface ShareContent {
  title?: string
  /** Absolute path starting with `/`, e.g. `/pages/meals/index`. */
  path?: string
  imageUrl?: string
}

/**
 * Resolves the best invite code available: an explicitly shared one wins over
 * a code parked from a scanned QR / opened share link.
 */
function resolveInviteCode(): string {
  return getCurrentInviteCode() || getPendingInvite() || ''
}

function buildShareMessage(custom?: ShareContent): ShareAppMessageReturnObject {
  if (custom?.path || custom?.title) {
    return {
      title: custom.title || DEFAULT_TITLE,
      path: custom.path || DEFAULT_PATH,
      imageUrl: custom.imageUrl
    }
  }

  const code = resolveInviteCode()
  if (code) {
    return {
      title: `邀请你加入我的家庭 | ${APP_NAME}`,
      path: `/pages/family-manage/index?invite=${encodeURIComponent(code)}`
    }
  }

  return { title: DEFAULT_TITLE, path: DEFAULT_PATH }
}

function buildTimelineShare(custom?: ShareContent): ShareTimelineReturnObject {
  // Timeline shares cannot deep-link into a family join (invite codes are
  // one-time and private), so they always point at the app entry.
  return {
    title: custom?.title || DEFAULT_TITLE,
    query: '',
    imageUrl: custom?.imageUrl
  }
}

/**
 * Enables both "转发给朋友" and "分享到朋友圈" for the calling page.
 *
 * WeChat only lights up the share buttons for pages that register these
 * callbacks, so every page that should be shareable must call this hook once.
 * Pass `content` to override the default title/path (e.g. share the meals tab
 * directly); omit it to fall back to the invite-aware default.
 */
export function useAppShare(content?: ShareContent | (() => ShareContent | undefined)): void {
  const resolve = (): ShareContent | undefined =>
    typeof content === 'function' ? content() : content

  useShareAppMessage(() => buildShareMessage(resolve()))
  useShareTimeline(() => buildTimelineShare(resolve()))
}
