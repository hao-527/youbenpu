import { Button, Image, Input, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { ChevronRight, MapPin, Package, Plus, Search, Settings2, Timer, X } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { ListSelect } from '../../components/list-select'
import { PageShell } from '../../components/page-shell'
import { StateText, type StateTone } from '../../components/state-text'
import { useAppShare } from '../../hooks/use-app-share'
import { navigate } from '../../utils/navigation'
import { useMaybeRefreshStore, useStore } from '../../store'
import { palette } from '../../theme/palette'
import { inventoryCategories, type InventoryCategory, type InventoryItem, type InventoryStatus } from '../../types/domain'
import { getInventoryExpiry } from '../../utils/date'

import illustExpiry from '../../assets/images/illustrations/expiry.svg'
import illustStorage from '../../assets/images/illustrations/storage.svg'

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
  useAppShare()
  const maybeRefresh = useMaybeRefreshStore()
  useDidShow(() => { void maybeRefresh() })
  const [keyword, setKeyword] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [locationFilter, setLocationFilter] = useState('全部地点')
  const [categoryFilter, setCategoryFilter] = useState<'全部' | InventoryCategory>('全部')
  const [openFilter, setOpenFilter] = useState<'category' | 'time' | 'location' | null>(null)

  const displayInventory = useMemo(() => inventory
    .filter((item) => item.status !== 'finished' && item.status !== 'discarded' && item.status !== 'deleted')
    .map((item) => {
      const expiry = getInventoryExpiry(item.expiryDate)
      return { ...item, expiryLabel: expiry.label, status: expiry.status }
    }), [inventory])

  const locationOptions = useMemo(() => Array.from(new Set(['全部地点', ...locations])), [locations])
  const categoryOptions = useMemo(
    () => Array.from(new Set(['全部', ...inventoryCategories, ...customInventoryCategories])) as string[],
    [customInventoryCategories]
  )
  const activeCount = displayInventory.length
  const hasActiveFilters = Boolean(keyword.trim()) || timeFilter !== 'all' || locationFilter !== '全部地点' || categoryFilter !== '全部'

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

  const timeListOptions = useMemo(() => timeOptions.map((o) => ({ label: o.label, value: o.key })), [])
  const categoryListOptions = useMemo(() => categoryOptions.map((c) => ({ label: c, value: c })), [categoryOptions])
  const locationListOptions = useMemo(() => locationOptions.map((l) => ({ label: l, value: l })), [locationOptions])

  return (
    <PageShell withFab>
      <View className='page-title inventory-title'>
        <View>
          <Text className='page-title__text'>找物品</Text>
          <Text className='page-title__subtitle'>{activeCount} 件正在使用</Text>
        </View>
        <Button className='content-action tap' hoverClass='tap--pressed' onClick={() => navigate('/pages/inventory-manage/index')}>
          <AppIcon icon={Settings2} size={16} color={palette.foreground} />
          <Text>管理</Text>
        </Button>
      </View>

      <View className='search inventory-search'>
        <AppIcon icon={Search} size={18} color={palette.subtleForeground} />
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
        <Button
          className={`inventory-filter tap ${categoryFilter !== '全部' ? 'inventory-filter--active' : ''}`}
          hoverClass='tap--pressed'
          onClick={() => setOpenFilter('category')}
        >
          <AppIcon icon={Package} size={14} color={categoryFilter !== '全部' ? palette.primary : palette.subtleForeground} />
          <Text className='inventory-filter__label'>{categoryFilter}</Text>
        </Button>
        <Button
          className={`inventory-filter tap ${timeFilter !== 'all' ? 'inventory-filter--active' : ''}`}
          hoverClass='tap--pressed'
          onClick={() => setOpenFilter('time')}
        >
          <AppIcon icon={Timer} size={14} color={timeFilter !== 'all' ? palette.primary : palette.subtleForeground} />
          <Text className='inventory-filter__label'>{timeOptions.find((o) => o.key === timeFilter)?.label ?? '全部时间'}</Text>
        </Button>
        <Button
          className={`inventory-filter tap ${locationFilter !== '全部地点' ? 'inventory-filter--active' : ''}`}
          hoverClass='tap--pressed'
          onClick={() => setOpenFilter('location')}
        >
          <AppIcon icon={MapPin} size={14} color={locationFilter !== '全部地点' ? palette.primary : palette.subtleForeground} />
          <Text className='inventory-filter__label'>{locationFilter}</Text>
        </Button>
      </View>

      <View className='inventory-results-bar'>
        <Text className='inventory-results-bar__count'>{visibleItems.length} 件结果</Text>
        {hasActiveFilters && (
          <Button
            className='inventory-results-bar__clear tap'
            hoverClass='tap--pressed'
            aria-label='清除筛选'
            onClick={() => {
              setKeyword('')
              setCategoryFilter('全部')
              setTimeFilter('all')
              setLocationFilter('全部地点')
            }}
          >
            <AppIcon icon={X} size={13} color={palette.primary} />
            <Text>清除筛选</Text>
          </Button>
        )}
      </View>

      {visibleItems.length === 0 ? (
        <View className='empty-state surface-card inventory-empty'>
          <Image
            className='inventory-empty__illust'
            src={timeFilter === 'all' ? illustStorage : illustExpiry}
            mode='aspectFit'
          />
          <Text className='empty-state__title'>没有找到相关物品</Text>
          <Text className='empty-state__copy'>{hasActiveFilters ? '没有符合条件的物品，试试清除筛选或调整关键词。' : '还没有记录物品，点击下方“新增”开始建立家庭物品清单。'}</Text>
        </View>
      ) : (
        <View className='inventory-list surface-card'>
          {visibleItems.map((item) => (
            <Button key={item.id} className='inventory-row tap tap-row' hoverClass='tap--pressed' onClick={() => navigate(`/pages/inventory-detail/index?id=${item.id}`)}>
              {item.photo ? (
                <Image className='inventory-row__photo' src={item.photo} mode='aspectFill' lazyLoad />
              ) : (
                <View className='inventory-row__photo inventory-row__placeholder'>
                  <AppIcon icon={Package} size={22} color={palette.subtleForeground} />
                </View>
              )}
              <View className='inventory-row__body'>
                <Text className='inventory-row__name'>{item.name}</Text>
                <View className='inventory-row__location'>
                  <AppIcon icon={MapPin} size={11} color={palette.subtleForeground} />
                  <Text>{item.location} · {item.quantityLabel}</Text>
                </View>
                <Text className='inventory-row__category'>{item.category}</Text>
              </View>
              <View className='inventory-row__end'>
                <StateText label={getStatusLabel(item)} tone={statusTone[item.status]} />
                <AppIcon icon={ChevronRight} size={14} color={palette.subtleForeground} />
              </View>
            </Button>
          ))}
        </View>
      )}

      <Button
        className='fab tap'
        hoverClass='tap--pressed'
        aria-label='新增物品'
        onClick={() => navigate('/pages/inventory-form/index')}
      >
        <AppIcon icon={Plus} size={16} color={palette.onPrimary} />
        <Text>新增</Text>
      </Button>

      <ListSelect
        open={openFilter === 'category'}
        title='选择分类'
        options={categoryListOptions}
        value={categoryFilter}
        onSelect={(v) => setCategoryFilter(v as InventoryCategory)}
        onClose={() => setOpenFilter(null)}
      />

      <ListSelect
        open={openFilter === 'time'}
        title='到期时间筛选'
        options={timeListOptions}
        value={timeFilter}
        onSelect={(v) => setTimeFilter(v as TimeFilter)}
        onClose={() => setOpenFilter(null)}
      />

      <ListSelect
        open={openFilter === 'location'}
        title='选择地点'
        options={locationListOptions}
        value={locationFilter}
        onSelect={setLocationFilter}
        onClose={() => setOpenFilter(null)}
      />
    </PageShell>
  )
}
