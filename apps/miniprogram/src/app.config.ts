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
    'pages/inventory-form/index',
    'pages/inventory-detail/index',
    'pages/inventory-manage/index',
    'pages/family-manage/index'
  ],
  window: {
    navigationStyle: 'custom',
    // Matches --color-background (warm neutral-50); a cool gray flashed
    // against the warm page background during navigation.
    backgroundColor: '#FAF7F5',
    backgroundTextStyle: 'dark',
    pageOrientation: 'portrait'
  },
  tabBar: {
    // Warm neutral-500, mirroring --color-subtle-foreground.
    color: '#776E67',
    selectedColor: '#E8530E',
    backgroundColor: '#FFFFFF',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/home/index', text: '首页', iconPath: 'assets/tabbar/home.png', selectedIconPath: 'assets/tabbar/home-active.png' },
      { pagePath: 'pages/ledger/index', text: '账本', iconPath: 'assets/tabbar/ledger.png', selectedIconPath: 'assets/tabbar/ledger-active.png' },
      { pagePath: 'pages/meals/index', text: '吃饭', iconPath: 'assets/tabbar/meals.png', selectedIconPath: 'assets/tabbar/meals-active.png' },
      { pagePath: 'pages/inventory/index', text: '找物品', iconPath: 'assets/tabbar/inventory.png', selectedIconPath: 'assets/tabbar/inventory-active.png' },
      { pagePath: 'pages/profile/index', text: '我的', iconPath: 'assets/tabbar/profile.png', selectedIconPath: 'assets/tabbar/profile-active.png' }
    ]
  },
  lazyCodeLoading: 'requiredComponents'
})
