import { Button, Image, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ChevronDown, MapPin, Plus, Search, Settings2, Timer, Trash2 } from 'lucide'
import { useCallback, useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { StateText, type StateTone } from '../../components/state-text'
import { useDispatch, useStore } from '../../store'
import { uid } from '../../store/uid'
import { palette } from '../../theme/palette'
import type { InventoryItem, InventoryStatus } from '../../types/domain'

import './index.scss'

const statusTone: Record<InventoryStatus, StateTone> = {
  normal: 'ok', expiring: 'warn', expired: 'danger', finished: 'muted', discarded: 'muted'
}

type TimeFilter = 'all' | '3days' | '7days' | '1month' | '3months' | 'expired'
const timeOptions: Array<{ key: TimeFilter; label: string }> = [
  { key: 'all', label: '全部时间' },
  { key: '3days', label: '临近 3 天' },
  { key: '7days', label: '临近 7 天' },
  { key: '1month', label: '临近 1 个月' },
  { key: '3months', label: '临近 3 个月' },
  { key: 'expired', label: '已过期' }
]

export default function InventoryPage() {
  const { inventory, locations, settings, familyId } = useStore()
  const dispatch = useDispatch()

  const [keyword, setKeyword] = useState('')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [locationFilter, setLocationFilter] = useState('全部地点')
  const [showTimeDropdown, setShowTimeDropdown] = useState(false)
  const [showLocationDropdown, setShowLocationDropdown] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showLocationManager, setShowLocationManager] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formLocation, setFormLocation] = useState('')
  const [formQuantity, setFormQuantity] = useState('')
  const [formExpiry, setFormExpiry] = useState('')
  const [formPhoto, setFormPhoto] = useState('')
  const [newLocationName, setNewLocationName] = useState('')

  const availableLocations = useMemo(() => {
    const locs = new Set(inventory.map((i) => i.location))
    return ['全部地点', ...Array.from(locs).sort()]
  }, [inventory])

  const visibleItems = useMemo(() => inventory.filter((item) => {
    if (item.status === 'finished' || item.status === 'discarded') return false
    const matchesKeyword = keyword === '' || item.name.includes(keyword) || item.location.includes(keyword) || item.expiryLabel.includes(keyword)
    let matchesTime = true
    if (timeFilter === 'expired') matchesTime = item.status === 'expired'
    else if (timeFilter === '3days' || timeFilter === '7days') matchesTime = item.status === 'expiring' || item.status === 'expired'
    // 1month and 3months: show all active items (already filtered out finished/discarded above)
    const matchesLocation = locationFilter === '全部地点' || item.location === locationFilter
    return matchesKeyword && matchesTime && matchesLocation
  }), [inventory, keyword, timeFilter, locationFilter])

  const openAdd = () => {
    setEditingItem(null)
    setFormName(''); setFormLocation(locations[0] ?? ''); setFormQuantity(''); setFormExpiry(''); setFormPhoto('')
    setShowForm(true)
  }

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item)
    setFormName(item.name); setFormLocation(item.location); setFormQuantity(item.quantityLabel); setFormExpiry(''); setFormPhoto(item.photo)
    setShowForm(true)
  }

  const choosePhoto = () => {
    Taro.chooseImage({ count: 1, sizeType: ['compressed'] }).then((res) => {
      if (res.tempFilePaths.length > 0) setFormPhoto(res.tempFilePaths[0])
    }).catch(() => {})
  }

  const submitItem = useCallback(() => {
    if (!formName.trim() || !formLocation.trim()) {
      Taro.showToast({ title: '请填写名称和位置', icon: 'none' }); return
    }
    const item: InventoryItem = {
      id: editingItem?.id ?? uid('i-'),
      familyId,
      name: formName.trim(),
      location: formLocation.trim(),
      quantityLabel: formQuantity.trim() || '1',
      expiryLabel: formExpiry ? `${formExpiry} 到期` : '无需提醒',
      status: editingItem?.status ?? 'normal',
      photo: formPhoto
    }
    dispatch(editingItem ? { type: 'inventory/update', item } : { type: 'inventory/add', item })
    setShowForm(false)
    Taro.showToast({ title: editingItem ? '已更新' : '已添加', icon: 'success' })
  }, [formName, formLocation, formQuantity, formExpiry, formPhoto, editingItem, familyId, dispatch])

  const deleteItem = (id: string) => {
    Taro.showModal({ title: '删除这个物品？', confirmText: '删除', confirmColor: palette.destructive }).then((res) => {
      if (res.confirm) dispatch({ type: 'inventory/delete', id })
    })
  }

  const markStatus = (id: string, status: InventoryStatus) => {
    const labels: Record<string, string> = { finished: '已用完', discarded: '已丢弃' }
    dispatch({ type: 'inventory/markStatus', id, status })
    Taro.showToast({ title: `已标记为${labels[status] ?? status}`, icon: 'success' })
  }

  const addLocation = () => {
    if (!newLocationName.trim()) return
    dispatch({ type: 'location/add', name: newLocationName.trim() })
    setNewLocationName('')
  }

  const deleteLocation = (name: string) => {
    dispatch({ type: 'location/delete', name })
  }

  const toggleReminder = () => dispatch({ type: 'settings/toggleExpiryReminder' })
  const currentTimeLabel = timeOptions.find((o) => o.key === timeFilter)?.label ?? '全部时间'

  return (
    <View className='page-shell'>
      <View className='page-title'>
        <Text className='page-title__text'>物品</Text>
        <Button className='page-title__link tap' hoverClass='tap--pressed' onClick={() => setShowLocationManager(true)}>
          <AppIcon icon={Settings2} size={16} color={palette.primary} />
        </Button>
      </View>

      <View className='search'>
        <AppIcon icon={Search} size={19} color={palette.subtleForeground} />
        <Input className='search__input' value={keyword} type='text' confirmType='search' placeholder='搜索名称或位置' onInput={(e) => setKeyword(e.detail.value)} />
      </View>

      {/* Filters */}
      <View className='filter-bar'>
        <View className='filter-drop'>
          <Button className='filter-drop__trigger tap' hoverClass='tap--pressed' onClick={() => { setShowTimeDropdown(!showTimeDropdown); setShowLocationDropdown(false) }}>
            <AppIcon icon={Timer} size={15} color={timeFilter !== 'all' ? palette.primary : palette.subtleForeground} />
            <Text className={timeFilter !== 'all' ? 'filter-drop__text--active' : ''}>{currentTimeLabel}</Text>
            <AppIcon icon={ChevronDown} size={14} color={palette.subtleForeground} />
          </Button>
          {showTimeDropdown && (
            <View className='filter-drop__menu'>
              {timeOptions.map((opt) => (
                <Button key={opt.key} className={`filter-drop__option tap ${timeFilter === opt.key ? 'filter-drop__option--active' : ''}`} hoverClass='tap--pressed' onClick={() => { setTimeFilter(opt.key); setShowTimeDropdown(false) }}>
                  {opt.label}
                </Button>
              ))}
            </View>
          )}
        </View>
        <View className='filter-drop'>
          <Button className='filter-drop__trigger tap' hoverClass='tap--pressed' onClick={() => { setShowLocationDropdown(!showLocationDropdown); setShowTimeDropdown(false) }}>
            <AppIcon icon={MapPin} size={15} color={locationFilter !== '全部地点' ? palette.primary : palette.subtleForeground} />
            <Text className={locationFilter !== '全部地点' ? 'filter-drop__text--active' : ''}>{locationFilter}</Text>
            <AppIcon icon={ChevronDown} size={14} color={palette.subtleForeground} />
          </Button>
          {showLocationDropdown && (
            <View className='filter-drop__menu'>
              {availableLocations.map((loc) => (
                <Button key={loc} className={`filter-drop__option tap ${locationFilter === loc ? 'filter-drop__option--active' : ''}`} hoverClass='tap--pressed' onClick={() => { setLocationFilter(loc); setShowLocationDropdown(false) }}>
                  {loc}
                </Button>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Grid */}
      {visibleItems.length === 0 ? (
        <View className='inventory-empty'>没有找到相关物品</View>
      ) : (
        <View className='goods-grid'>
          {visibleItems.map((item) => (
            <View key={item.id} className='goods'>
              <View className='goods__photo-wrap' onClick={() => openEdit(item)}>
                {item.photo ? (
                  <Image className='goods__photo' src={item.photo} mode='aspectFill' lazyLoad />
                ) : (
                  <View className='goods__photo goods__photo--placeholder'>
                    <AppIcon icon={MapPin} size={28} color={palette.subtleForeground} />
                  </View>
                )}
                <View className='goods__location'>
                  <AppIcon icon={MapPin} size={12} color={palette.foreground} />
                  <Text>{item.location}</Text>
                </View>
              </View>
              <Text className='goods__name'>{item.name}</Text>
              <Text className='goods__meta'>{item.quantityLabel}</Text>
              <View className='goods__footer'>
                <StateText label={item.expiryLabel} tone={statusTone[item.status]} />
                <View className='goods__item-actions'>
                  <Button className='tap' hoverClass='tap--pressed' onClick={() => markStatus(item.id, 'finished')}>
                    <Text className='goods__action-text'>用完</Text>
                  </Button>
                  <Button className='tap' hoverClass='tap--pressed' onClick={() => deleteItem(item.id)}>
                    <AppIcon icon={Trash2} size={14} color={palette.subtleForeground} />
                  </Button>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Item form */}
      {showForm && (
        <View className='form-overlay' onClick={() => setShowForm(false)}>
          <View className='form-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='form-sheet__title'>{editingItem ? '编辑物品' : '新增物品'}</Text>
            <Button className='form-photo-btn tap' hoverClass='tap--pressed' onClick={choosePhoto}>
              {formPhoto ? <Image className='form-photo-preview' src={formPhoto} mode='aspectFill' /> : <Text>选择图片</Text>}
            </Button>
            <Input className='form-input' type='text' placeholder='物品名称' value={formName} onInput={(e) => setFormName(e.detail.value)} />
            <Picker mode='selector' range={locations} value={Math.max(0, locations.indexOf(formLocation))} onChange={(e) => setFormLocation(locations[Number(e.detail.value)])}>
              <View className='form-input form-input--picker'><Text>位置：{formLocation || '请选择'}</Text></View>
            </Picker>
            <Input className='form-input' type='text' placeholder='数量（如"2 盒"）' value={formQuantity} onInput={(e) => setFormQuantity(e.detail.value)} />
            <Picker mode='date' value={formExpiry} onChange={(e) => setFormExpiry(e.detail.value)}>
              <View className='form-input form-input--picker'><Text>{formExpiry ? `到期日：${formExpiry}` : '选择到期日期（可选）'}</Text></View>
            </Picker>
            <Button className='button button--primary tap form-submit' hoverClass='tap--pressed' onClick={submitItem}>确认</Button>
          </View>
        </View>
      )}

      {/* Location manager */}
      {showLocationManager && (
        <View className='form-overlay' onClick={() => setShowLocationManager(false)}>
          <View className='form-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='form-sheet__title'>管理存放位置</Text>
            <View className='loc-list'>
              {locations.map((loc) => (
                <View key={loc} className='loc-row'>
                  <Text className='loc-row__name'>{loc}</Text>
                  <Button className='tap' hoverClass='tap--pressed' onClick={() => deleteLocation(loc)}>
                    <AppIcon icon={Trash2} size={15} color={palette.destructive} />
                  </Button>
                </View>
              ))}
            </View>
            <View className='loc-add'>
              <Input className='form-input loc-add__input' type='text' placeholder='新位置名称' value={newLocationName} onInput={(e) => setNewLocationName(e.detail.value)} />
              <Button className='button button--primary tap loc-add__btn' hoverClass='tap--pressed' onClick={addLocation}>
                <AppIcon icon={Plus} size={18} color='#FFFFFF' />
              </Button>
            </View>
            <View className='loc-reminder'>
              <Text>到期提醒</Text>
              <Button className='tap' hoverClass='tap--pressed' onClick={toggleReminder}>
                <Text className={settings.expiryReminder ? 'loc-reminder--on' : 'loc-reminder--off'}>
                  {settings.expiryReminder ? '已开启' : '已关闭'}
                </Text>
              </Button>
            </View>
          </View>
        </View>
      )}

      <View className='button-bar'>
        <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={openAdd}>
          <AppIcon icon={Plus} size={20} color='#FFFFFF' />
          加入物品
        </Button>
      </View>
    </View>
  )
}
