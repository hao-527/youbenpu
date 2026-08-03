export default defineAppConfig({
  pages: [
    'pages/home/index',
    'pages/ledger/index',
    'pages/meals/index',
    'pages/inventory/index',
    'pages/profile/index'
  ],
  window: {
    navigationStyle: 'custom',
    backgroundColor: '#F8FAFC',
    backgroundTextStyle: 'dark',
    pageOrientation: 'portrait'
  },
  tabBar: {
    color: '#64748B',
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
