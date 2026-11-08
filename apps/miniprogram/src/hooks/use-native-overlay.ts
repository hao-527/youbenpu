import Taro from '@tarojs/taro'
import { useEffect } from 'react'

// Native custom-tab-bar lives above the page webview: CSS z-index cannot
// place a page modal above it. Hide its contents while any blocking UI exists.
let overlays = 0
export const nativeOverlayEvent = 'ybp:native-overlay'
export const hasNativeOverlay = () => overlays > 0

export function useNativeOverlay(open: boolean) {
  useEffect(() => {
    if (process.env.TARO_ENV !== 'weapp' || !open) return
    overlays += 1
    Taro.eventCenter.trigger(nativeOverlayEvent, true)
    return () => {
      overlays = Math.max(0, overlays - 1)
      Taro.eventCenter.trigger(nativeOverlayEvent, hasNativeOverlay())
    }
  }, [open])
}
