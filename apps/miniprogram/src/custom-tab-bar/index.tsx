import Taro from '@tarojs/taro'
import { useEffect, useState } from 'react'
import { BottomNavigation, tabRoutes } from '../components/bottom-navigation'
import { hasNativeOverlay, nativeOverlayEvent } from '../hooks/use-native-overlay'
import './index.scss'

export default function CustomTabBar() {
  const [hidden, setHidden] = useState(hasNativeOverlay)
  const [selected, setSelected] = useState(() => {
    const pages = Taro.getCurrentPages()
    return Math.max(0, tabRoutes.indexOf(pages[pages.length - 1]?.route ?? ''))
  })
  useEffect(() => {
    const select = (route: string) => setSelected(Math.max(0, tabRoutes.indexOf(route)))
    Taro.eventCenter.on('ybp:tab-show', select)
    Taro.eventCenter.on(nativeOverlayEvent, setHidden)
    setHidden(hasNativeOverlay())
    return () => { Taro.eventCenter.off('ybp:tab-show', select); Taro.eventCenter.off(nativeOverlayEvent, setHidden) }
  }, [])
  return hidden ? null : <BottomNavigation selected={selected} />
}
