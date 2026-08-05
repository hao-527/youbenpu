import { Button, Image, Input, Picker, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ChevronDown, ChevronRight, MapPin, Package, Plus, Search, Settings2, Timer } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageShell } from '../../components/page-shell'
import { StateText, type StateTone } from '../../components/state-text'
import { useStore } from '../../store'
import { palette } from '../../theme/palette'
import { inventoryCategories, type InventoryCategory, type InventoryItem, type InventoryStatus } from '../../types/domain'
import { getInventoryExpiry } from '../../utils/date'

import './index.scss'

type TimeFilter = 'all' | '3days' | '7days' | '1month' | '3months' | 'expired'

const timeOptions: Array<{ key: TimeFilter; label: string }> = [
  { key: 'all', label: '全部时间' },
  { key: '3days', label: '临近 3 天' },
  { key: '7days', label: '临近 7 天' },
  { key: '1month', label: '临近 1 个月' },
  { key: '3months', label: '临近 3 个月' },
  { key: 'expired', label: '已过期' }
]

const filterDays: Partial<Record<TimeFilter, number>> = {
  '3days': 3,
  '7days': 7,
  '1month': 30,
  '3months': 90
}

const statusTone: Record<InventoryStatus, StateTone> = {
  normal: 'ok',
  expiring: 'warn',
  expired: 'danger',
  finished: 'muted',
  discarded: 'muted',
  deleted: 'muted'
}

function getStatusLabel(item: InventoryItem) {
  if (item.status === 'finished') return '已用完'
  if (item.status === 'discarded') return '已丢弃'
  return item.expiryLabel
}

export default function InventoryPage() {
  const { inventory, locations, customInventoryCategories } = useStore()
  const [keyword, setKeyword] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [locationFilter, setLocationFilter] = useState('全部地点')
  const [categoryFilter, setCategoryFilter] = useState<'全部' | InventoryCategory>('全部')

  const displayInventory = useMemo(() => inventory
    .filter((item) => item.status !== 'finished' && item.status !== 'discarded' && item.status !== 'deleted')
    .map((item) => {
      const expiry = getInventoryExpiry(item.expiryDate)
      return { ...item, expiryLabel: expiry.label, status: expiry.status }
    }), [inventory])

  const locationOptions = useMemo(() => ['全部地点', ...locations], [locations])
  const categoryOptions = useMemo(() => ['全部', ...inventoryCategories, ...customInventoryCategories] as string[], [customInventoryCategories])
  const activeCount = displayInventory.length

  const visibleItems = useMemo(() => displayInventory.filter((item) => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const matchesKeyword = !normalizedKeyword
      || item.name.toLowerCase().includes(normalizedKeyword)
      || item.location.toLowerCase().includes(normalizedKeyword)
      || getStatusLabel(item).toLowerCase().includes(normalizedKeyword)
    const matchesLocation = locationFilter === '全部地点' || item.location === locationFilter
    const matchesCategory = categoryFilter === '全部' || item.category === categoryFilter
    if (!matchesKeyword || !matchesLocation || !matchesCategory) return false

    const expiry = getInventoryExpiry(item.expiryDate)
    if (timeFilter === 'expired') return expiry.days !== null && expiry.days < 0
    if (timeFilter === 'all') return true
    const limit = filterDays[timeFilter]
    return expiry.days !== null && expiry.days >= 0 && limit !== undefined && expiry.days <= limit
  }), [categoryFilter, displayInventory, keyword, locationFilter, timeFilter])

  return (
    <PageShell withFab>
      <View className='page-title inventory-title'>
        <View>
          <Text className='page-title__text'>找物品</Text>
          <Text className='page-title__subtitle'>{activeCount} 件正在使用</Text>
        </View>
        <Button className='content-action tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/inventory-manage/index' })}>
          <AppIcon icon={Settings2} size={16} color={palette.foreground} />
          <Text>管理</Text>
        </Button>
      </View>

      <View className='search inventory-search'>
        <AppIcon icon={Search} size={19} color={palette.subtleForeground} />
        <Input
          className='search__input'
          value={keyword}
          type='text'
          confirmType='search'
          maxlength={40}
          placeholder='搜索名称、位置或状态'
          placeholderClass='input-placeholder'
          onInput={(event) => setKeyword(event.detail.value)}
        />
      </View>

      <View className='inventory-filters'>
        <Picker mode='selector' range={timeOptions.map((option) => option.label)} value={Math.max(0, timeOptions.findIndex((option) => option.key === timeFilter))} onChange={(event) => setTimeFilter(timeOptions[Number(event.detail.value)]?.key ?? 'all')}>
          <View className={`inventory-filter tap ${timeFilter !== 'all' ? 'inventory-filter--active' : ''}`} hoverClass='tap--pressed' hoverStayTime={100}>
            <AppIcon icon={Timer} size={15} color={timeFilter !== 'all' ? palette.primary : palette.subtleForeground} />
            <Text className='inventory-filter__label'>{timeOptions.find((option) => option.key === timeFilter)?.label ?? '全部时间'}</Text>
            <AppIcon icon={ChevronDown} size={14} color={palette.subtleForeground} />
          </View>
        </Picker>
        <Picker mode='selector' range={locationOptions} value={Math.max(0, locationOptions.indexOf(locationFilter))} onChange={(event) => setLocationFilter(locationOptions[Number(event.detail.value)] ?? '全部地点')}>
          <View className={`inventory-filter tap ${locationFilter !== '全部地点' ? 'inventory-filter--active' : ''}`} hoverClass='tap--pressed' hoverStayTime={100}>
            <AppIcon icon={MapPin} size={15} color={locationFilter !== '全部地点' ? palette.primary : palette.subtleForeground} />
            <Text className='inventory-filter__label'>{locationFilter}</Text>
            <AppIcon icon={ChevronDown} size={14} color={palette.subtleForeground} />
          </View>
        </Picker>
      </View>

      <ScrollView className='category-chips' scrollX enableFlex>
        <View className='category-chips__track'>
          {categoryOptions.map((option) => (
            <Button
              key={option}
              className={`category-chip tap ${categoryFilter === option ? 'category-chip--active' : ''}`}
              hoverClass='tap--pressed'
              onClick={() => setCategoryFilter(option)}
            >
              {option}
            </Button>
          ))}
        </View>
      </ScrollView>

      {visibleItems.length === 0 ? (
        <View className='empty-state surface-card inventory-empty'>
          <View className='empty-state__icon'>
            <AppIcon icon={Package} size={32} color={palette.subtleForeground} />
          </View>
          <Text className='empty-state__title'>没有找到相关物品</Text>
          <Text className='empty-state__copy'>调整搜索或筛选条件，也可以新增一个物品。</Text>
          <Button className='button button--outline empty-state__action tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/inventory-form/index' })}>新增物品</Button>
        </View>
      ) : (
        <View className='inventory-list surface-card'>
          {visibleItems.map((item) => (
            <Button key={item.id} className='inventory-row tap tap-row' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: `/pages/inventory-detail/index?id=${item.id}` })}>
              {item.photo ? (
                <Image className='inventory-row__photo' src={item.photo} mode='aspectFill' lazyLoad />
              ) : (
                <View className='inventory-row__photo inventory-row__placeholder'>
                  <AppIcon icon={Package} size={24} color={palette.subtleForeground} />
                </View>
              )}
              <View className='inventory-row__body'>
                <Text className='inventory-row__name'>{item.name}</Text>
                <View className='inventory-row__location'>
                  <AppIcon icon={MapPin} size={12} color={palette.subtleForeground} />
                  <Text>{item.location} · {item.quantityLabel}</Text>
                </View>
                <Text className='inventory-row__category'>{item.category}</Text>
              </View>
              <View className='inventory-row__end'>
                <StateText label={getStatusLabel(item)} tone={statusTone[item.status]} />
                <AppIcon icon={ChevronRight} size={16} color={palette.subtleForeground} />
              </View>
            </Button>
          ))}
        </View>
      )}

      <Button
        className='fab tap'
        hoverClass='tap--pressed'
        aria-label='新增物品'
        onClick={() => Taro.navigateTo({ url: '/pages/inventory-form/index' })}
      >
        <AppIcon icon={Plus} size={17} color={palette.onPrimary} />
        <Text>新增</Text>
      </Button>
    </PageShell>
  )
}
