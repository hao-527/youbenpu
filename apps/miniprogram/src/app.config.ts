// Dev-only component gallery. Registered only when PREVIEW=1 is set (used by the
// Figma design-capture flow), so it never ships in the normal production build.
// Uses its own flag rather than NODE_ENV so we can build it in production mode
// (no Fast Refresh runtime) while still excluding it from real releases.
const devPages = process.env.PREVIEW === '1' ? ['pages/_preview/index'] : []

// Keep the shared recursive Taro `comp` available for every page. Enabling
// requiredComponents reproduced wx://not-found and blank pages in our IDE.
export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/ledger/index',
    'pages/meals/index',
    'pages/inventory/index',
    'pages/profile/index',
    'pages/meal-orders/index',
    'pages/meal-create/index',
    'pages/dish-manage/index',
    'pages/dish-form/index',
    'pages/ledger-entry/index',
    'pages/ledger-import/index',
    'pages/inventory-form/index',
    'pages/inventory-detail/index',
    'pages/inventory-manage/index',
    'pages/family-manage/index',
    'pages/family-switch/index',
    ...devPages
  ],
  window: {
    navigationStyle: 'custom',
    navigationBarTextStyle: 'black',
    navigationBarBackgroundColor: '#FFFDF3',
    // Matches the paper-like application background during navigation.
    backgroundColor: '#FFFDF3',
    backgroundTextStyle: 'dark',
    pageOrientation: 'portrait'
  },
  tabBar: {
    custom: true,
    // Custom navigation renders the final Figma green selection on all five tabs.
    color: '#64748D',
    selectedColor: '#11110F',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/index', text: '首页', iconPath: 'assets/tabbar/home.png', selectedIconPath: 'assets/tabbar/home-active.png' },
      { pagePath: 'pages/ledger/index', text: '账本', iconPath: 'assets/tabbar/ledger.png', selectedIconPath: 'assets/tabbar/ledger-active.png' },
      { pagePath: 'pages/meals/index', text: '吃饭', iconPath: 'assets/tabbar/meals.png', selectedIconPath: 'assets/tabbar/meals-active.png' },
      { pagePath: 'pages/inventory/index', text: '找物品', iconPath: 'assets/tabbar/inventory.png', selectedIconPath: 'assets/tabbar/inventory-active.png' },
      { pagePath: 'pages/profile/index', text: '我的', iconPath: 'assets/tabbar/profile.png', selectedIconPath: 'assets/tabbar/profile-active.png' }
    ]
  }
})
