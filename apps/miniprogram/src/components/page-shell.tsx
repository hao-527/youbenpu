import { View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState } from 'react'
import type { PropsWithChildren } from 'react'

const DEFAULT_STATUS_BAR_HEIGHT = 20
const DEFAULT_NAVIGATION_BAR_HEIGHT = 44
const MIN_MENU_BUTTON_GAP = 4

let cachedNavigationSafeTop: number | null = null

function getNavigationSafeTop(): number {
  if (cachedNavigationSafeTop !== null) return cachedNavigationSafeTop

  let statusBarHeight = DEFAULT_STATUS_BAR_HEIGHT

  try {
    const windowInfo = Taro.getWindowInfo()
    statusBarHeight = windowInfo.statusBarHeight || DEFAULT_STATUS_BAR_HEIGHT
  } catch {
    // Older base libraries fall back to the standard custom-navigation height.
  }

  try {
    const menuButton = Taro.getMenuButtonBoundingClientRect()
    if (menuButton.bottom > statusBarHeight) {
      const verticalGap = Math.max(menuButton.top - statusBarHeight, MIN_MENU_BUTTON_GAP)
      cachedNavigationSafeTop = Math.ceil(menuButton.bottom + verticalGap)
      return cachedNavigationSafeTop
    }
  } catch {
    // DevTools or unsupported environments may not expose the menu button rect.
  }

  cachedNavigationSafeTop = statusBarHeight + DEFAULT_NAVIGATION_BAR_HEIGHT
  return cachedNavigationSafeTop
}

type PageShellProps = PropsWithChildren<{
  className?: string
  /** Tab pages reserve native TabBar space; subpages only reserve the safe area. */
  tabPage?: boolean
  /** Adds scroll clearance for a fixed bottom action bar. */
  withFixedBar?: boolean
}>

export function PageShell({ children, className = '', tabPage = true, withFixedBar = false }: PageShellProps) {
  const [safeTop] = useState(getNavigationSafeTop)
  const classes = [
    'page-shell',
    tabPage ? 'page-shell--tab' : 'page-shell--subpage',
    withFixedBar ? 'page-shell--with-fixed-bar' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <View className={classes} style={{ paddingTop: `${safeTop}px` }}>
      {children}
    </View>
  )
}
