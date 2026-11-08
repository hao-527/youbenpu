import { BrandTitle } from './brand-title'
import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { BottomNavigation, tabRoutes } from './bottom-navigation'
import { useState } from 'react'
import type { CSSProperties, PropsWithChildren } from 'react'
import { useRemoteStatus, useRefreshStore } from '../store'
import { ensureLoggedIn } from '../api'
import { hasFamily } from '../api/token'
import { navigate } from '../utils/navigation'
import { PageHeader } from './page-header'
import { FeedbackLayer } from './feedback'

const statePageTitles: Record<string, string> = {
  'ledger-page': '账本', 'meals-page': '吃饭', 'inventory-page': '找物品',
  'family-manage-page': '家庭管理', 'meal-orders-page': '点餐记录',
  'meal-create-page': '开始点餐', 'dish-manage-page': '菜品管理',
  'dish-form-page': '菜品编辑', 'ledger-entry-page': '记一笔',
  'ledger-import-page': '导入账单', 'inventory-form-page': '物品编辑',
  'inventory-detail-page': '物品详情', 'inventory-manage-page': '物品管理'
}

const DEFAULT_STATUS_BAR_HEIGHT = 20
const DEFAULT_NAVIGATION_BAR_HEIGHT = 44
const MIN_MENU_BUTTON_GAP = 4

let cachedNavigationSafeTop: number | null = null

function getNavigationSafeTop(): number {
  // H5 has no WeChat capsule; retain the design's 24 CSS-px top inset.
  // Weapp continues to measure the native system bar and capsule below.
  if (process.env.TARO_ENV === 'h5') return 24
  if (cachedNavigationSafeTop !== null) return cachedNavigationSafeTop

  let statusBarHeight = DEFAULT_STATUS_BAR_HEIGHT

  try {
    const windowInfo = Taro.getWindowInfo()
    statusBarHeight = windowInfo.statusBarHeight || DEFAULT_STATUS_BAR_HEIGHT
  } catch {
    // Older base libraries fall back to the standard custom-navigation height.
  }

  // `getMenuButtonBoundingClientRect` reads the WeChat capsule button and only
  // makes sense on the weapp platform. On H5 it has no native implementation:
  // Taro's H5 shim resolves it through an async `fail` callback rather than
  // throwing synchronously, so the try/catch below can never catch it — the
  // rejection escapes as an unhandled page error. Skip the call entirely on
  // H5 (checked at compile time, so this branch is dead-code-eliminated from
  // the weapp bundle) and fall through to the statusBarHeight-only default.
  if (process.env.TARO_ENV !== 'h5') {
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
  /** Adds scroll clearance for a floating action button. */
  withFab?: boolean
  /** Existing invite acceptance flow can render its sheet before joining. */
  allowNoFamily?: boolean
}>

export function PageShell({
  children,
  className = '',
  tabPage = true,
  withFixedBar = false,
  withFab = false,
  allowNoFamily = false
}: PageShellProps) {
  const remote = useRemoteStatus()
  const refresh = useRefreshStore()
  const [selectedTab, setSelectedTab] = useState(0)
  useDidShow(() => {
    if (!tabPage) return
    // Read after the page is shown: during render H5 can still expose the
    // previous route while its cached Tab page is mounting.
    const pages = Taro.getCurrentPages()
    const route = (pages[pages.length - 1]?.route ?? Taro.getCurrentInstance().router?.path ?? '')
      .replace(/^\//, '').split('?')[0]
    setSelectedTab(Math.max(0, tabRoutes.indexOf(route)))
    Taro.eventCenter.trigger('ybp:tab-show', route)
  })
  const [safeTop] = useState(getNavigationSafeTop)
  const unavailable = !allowNoFamily && !className.includes('home-page') && !remote.ready && (remote.loading || Boolean(remote.error))
  const familyGate = !allowNoFamily && !className.includes('home-page') && !className.includes('profile-page') && !remote.loading && !remote.error && !hasFamily()
  const classes = [
    'page-shell',
    process.env.TARO_ENV === 'h5' ? 'page-shell--h5' : '',
    tabPage ? 'page-shell--tab' : 'page-shell--subpage',
    withFixedBar ? 'page-shell--with-fixed-bar' : '',
    withFab ? 'page-shell--with-fab' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <View className={classes} style={{ paddingTop: `${safeTop}px`, '--navigation-safe-top': `${safeTop}px` } as CSSProperties}>
      {tabPage && (unavailable || familyGate) && <View className='page-title'><BrandTitle className='page-title__text'>{statePageTitles[className.split(' ').find(value => value.endsWith('-page')) ?? ''] ?? '生活有本谱'}</BrandTitle></View>}
      {!tabPage && (unavailable || familyGate) && <PageHeader title={statePageTitles[className.split(' ').find(value => value.endsWith('-page')) ?? ''] ?? '生活有本谱'} />}
      {!allowNoFamily && !className.includes('home-page') && (remote.loading || remote.error) && <View className='page-remote-status' role='status'>
        <Text>{remote.loading ? '正在加载家庭数据…' : remote.error}</Text>
        {!remote.loading && <Button className='page-remote-retry tap' onClick={() => { void ensureLoggedIn().then(() => refresh()).catch(() => {}) }}>重试</Button>}
      </View>}
      {unavailable ? <View className='empty-state surface-card page-family-gate'>
        <Text className='empty-state__title'>{remote.loading ? '正在准备家庭数据' : '暂时无法加载'}</Text>
        <Text className='empty-state__copy'>{remote.loading ? '加载完成后，就能继续查看和操作。' : '数据没有加载成功，请重试后继续。'}</Text>
      </View> : familyGate ? <View className='empty-state surface-card'><Text className='empty-state__title'>还没有加入家庭</Text><Text className='empty-state__copy'>创建或加入一个家庭，和家人共享账本、物品和点餐。</Text><Button className='button button--primary tap' onClick={() => navigate('/pages/profile/index')}>创建或加入家庭</Button></View> : children}
      {tabPage && process.env.TARO_ENV === 'h5' && <BottomNavigation selected={selectedTab} />}
      {process.env.TARO_ENV === 'weapp' && <FeedbackLayer />}
    </View>
  )
}
