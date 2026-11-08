import Taro from '@tarojs/taro'

const TAB_PAGES = new Set([
  '/pages/home/index',
  '/pages/ledger/index',
  '/pages/meals/index',
  '/pages/inventory/index',
  '/pages/profile/index'
])

const HOME_URL = '/pages/home/index'

function isAtDestination(url: string): boolean {
  const page = Taro.getCurrentPages?.().slice(-1)[0]
  if (!page || page.route?.replace(/^\//, '') !== url.split('?')[0].replace(/^\//, '')) return false
  const query = url.split('?')[1]
  if (!query) return true
  return query.split('&').every(pair => {
    const [key, value = ''] = pair.split('=')
    return String(page.options?.[decodeURIComponent(key)] ?? '') === decodeURIComponent(value)
  })
}

function reportNavigationFailure(url: string): void {
  if (isAtDestination(url)) return
  void Taro.showToast({ title: '页面暂未打开，请重试', icon: 'none' }).catch(() => {})
}

function relaunch(url: string): void {
  if (isAtDestination(url)) return
  void Taro.reLaunch({ url }).catch(() => reportNavigationFailure(url))
}

function replace(url: string): void {
  if (isAtDestination(url)) return
  void Taro.redirectTo({ url }).catch(() => relaunch(url))
}

/** Whether the given absolute page path is one of the native TabBar pages. */
function isTabPage(url: string): boolean {
  const path = url.split('?')[0]
  return TAB_PAGES.has(path)
}

/**
 * Navigates to a page, transparently choosing the correct WeChat API.
 *
 * TabBar destinations must use switchTab (navigateTo throws for them), while
 * regular subpages push onto the stack. Guards against exceeding the 10-page
 * navigation limit by falling back to redirectTo when the stack is full.
 */
export function navigate(url: string): void {
  if (isTabPage(url)) {
    void Taro.switchTab({ url: url.split('?')[0] }).catch(() => relaunch(url.split('?')[0]))
    return
  }
  const pages = Taro.getCurrentPages?.() ?? []
  if (pages.length >= 10) {
    replace(url)
    return
  }
  Taro.navigateTo({ url }).catch(() => replace(url))
}

/**
 * Safe back. When there is a previous page in the stack it behaves like
 * navigateBack; otherwise — e.g. the user arrived from a share card or a cold
 * launch straight into a subpage — it falls back to the home tab so the user
 * is never trapped on a page with a dead back button.
 */
export function goBack(fallbackUrl: string = HOME_URL): void {
  const pages = Taro.getCurrentPages?.() ?? []
  if (pages.length > 1) {
    const previous = pages[pages.length - 2]
    const query = Object.entries(previous.options ?? {})
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&')
    const previousUrl = previous.route ? `/${previous.route.replace(/^\//, '')}${query ? `?${query}` : ''}` : ''
    void Taro.navigateBack().catch(() => {
      if (previousUrl && isAtDestination(previousUrl)) return
      goHome(fallbackUrl)
    })
    return
  }
  goHome(fallbackUrl)
}

/** Resets the stack to a top-level destination (tab-aware). */
export function goHome(url: string = HOME_URL): void {
  if (isTabPage(url)) {
    void Taro.switchTab({ url: url.split('?')[0] }).catch(() => relaunch(url.split('?')[0]))
    return
  }
  relaunch(url)
}
