import { Button, Image, Text, View } from '@tarojs/components'
import { navigate } from '../../utils/navigation'
import home from '../../assets/images/home-final/tab-home.png'
import ledger from '../../assets/images/home-final/tab-ledger.png'
import meals from '../../assets/images/home-final/tab-meals.png'
import inventory from '../../assets/images/home-final/tab-inventory.png'
import profile from '../../assets/images/home-final/tab-profile.png'

export const tabRoutes = ['pages/home/index', 'pages/ledger/index', 'pages/meals/index', 'pages/inventory/index', 'pages/profile/index']
const tabs = [{ label: '首页', icon: home }, { label: '账本', icon: ledger }, { label: '吃饭', icon: meals }, { label: '找物品', icon: inventory }, { label: '我的', icon: profile }]

export function BottomNavigation({ selected = 0 }: { selected?: number }) {
  return <View className='ybp-navigation'>{tabs.map((tab, index) => <Button key={tab.label} className={`ybp-navigation-item ${index === selected ? 'ybp-navigation-item--selected' : ''}`} aria-label={`${tab.label}${index === selected ? '，当前页面' : ''}`} onClick={() => navigate(`/${tabRoutes[index]}`)}>
    <View className='ybp-navigation-disc'><Image className='ybp-navigation-icon' src={tab.icon} mode='aspectFit' /></View><Text>{tab.label}</Text>
  </Button>)}</View>
}
