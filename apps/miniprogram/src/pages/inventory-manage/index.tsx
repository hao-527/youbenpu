import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Package, Pencil, Plus, RotateCcw, Trash2 } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { StateText, type StateTone } from '../../components/state-text'
import { useDispatch, useStore } from '../../store'
import { palette } from '../../theme/palette'
import { inventoryCategories, type InventoryCategory, type InventoryItem, type InventoryStatus } from '../../types/domain'
import { getInventoryExpiry } from '../../utils/date'

import './index.scss'

type ManageTab = 'all' | 'trash'

const statusTone: Record<InventoryStatus, StateTone> = {
  normal: 'ok', expiring: 'warn', expired: 'danger', finished: 'muted', discarded: 'muted', deleted: 'muted'
}

function getStatusLabel(item: InventoryItem) {
  if (item.status === 'deleted') return '已删除'
  if (item.status === 'finished') return '已用完'
  if (item.status === 'discarded') return '已丢弃'
  return item.expiryLabel
}

export default function InventoryManagePage() {
  const { inventory, customInventoryCategories } = useStore()
  const dispatch = useDispatch()
  const [tab, setTab] = useState<ManageTab>('all')
  const [activeCategory, setActiveCategory] = useState<'全部' | InventoryCategory>('全部')

  const allCategories = useMemo(
    () => ['全部', ...inventoryCategories, ...customInventoryCategories] as Array<'全部' | InventoryCategory>,
    [customInventoryCategories]
  )

  // 展示物品（带实时过期计算）
  const enrichedInventory = useMemo(() => inventory.map((item) => {
    if (item.status === 'finished' || item.status === 'discarded' || item.status === 'deleted') return item
    const expiry = getInventoryExpiry(item.expiryDate)
    return { ...item, expiryLabel: expiry.label, status: expiry.status }
  }), [inventory])

  // all tab: 全部物品（含已用完/已丢弃, 不含已删除）
  const allItems = useMemo(() => enrichedInventory.filter((item) => item.status !== 'deleted'), [enrichedInventory])
  // trash tab: 已删除 + 已用完 + 已丢弃
  const trashItems = useMemo(() => enrichedInventory.filter((item) => item.status === 'deleted' || item.status === 'finished' || item.status === 'discarded'), [enrichedInventory])

  const visibleItems = useMemo(() => {
    const source = tab === 'trash' ? trashItems : allItems
    if (activeCategory === '全部') return source
    return source.filter((item) => item.category === activeCategory)
  }, [tab, allItems, trashItems, activeCategory])

  const isCustomCategory = (category: string) => customInventoryCategories.some((c) => c === category)
  const canDeleteCategory = (category: string) => !inventory.some((item) => item.category === category && item.status !== 'deleted')

  const deleteCustomCategory = (category: string) => {
    if (!canDeleteCategory(category)) {
      Taro.showToast({ title: '还有物品在使用这个分类', icon: 'none' })
      return
    }
    Taro.showModal({
      title: `删除自定义分类"${category}"？`,
      content: '删除后，新增或编辑物品时不再出现这个分类。',
      confirmText: '删除',
      confirmColor: palette.destructive
    }).then((result) => {
      if (!result.confirm) return
      dispatch({ type: 'category/removeInventory', name: category })
      if (activeCategory === category) setActiveCategory('全部')
      Taro.showToast({ title: '分类已删除', icon: 'success' })
    })
  }

  const restore = (id: string) => {
    const item = inventory.find((i) => i.id === id)
    if (!item) return
    const expiry = getInventoryExpiry(item.expiryDate)
    dispatch({ type: 'inventory/markStatus', id, status: expiry.status })
    Taro.showToast({ title: '已恢复', icon: 'success' })
  }

  const permanentDelete = (id: string, name: string) => {
    Taro.showModal({
      title: `永久删除"${name}"？`,
      content: '删除后无法恢复。',
      confirmText: '永久删除',
      confirmColor: palette.destructive
    }).then((result) => {
      if (result.confirm) dispatch({ type: 'inventory/permanentDelete', id })
    })
  }

  const permanentDeleteAll = () => {
    if (trashItems.length === 0) return
    Taro.showModal({
      title: '清空全部？',
      content: `将永久删除 ${trashItems.length} 个物品，无法恢复。`,
      confirmText: '全部删除',
      confirmColor: palette.destructive
    }).then((result) => {
      if (result.confirm) {
        dispatch({ type: 'inventory/permanentDeleteAll' })
        Taro.showToast({ title: '已全部清除', icon: 'success' })
      }
    })
  }

  const softDelete = (id: string, name: string) => {
    Taro.showModal({
      title: `删除"${name}"？`,
      content: '物品会移入垃圾桶，可稍后恢复或永久删除。',
      confirmText: '删除',
      confirmColor: palette.destructive
    }).then((result) => {
      if (result.confirm) dispatch({ type: 'inventory/delete', id })
    })
  }

  return (
    <PageShell tabPage={false}>
      <PageHeader title='物品管理' subtitle={`${allItems.length} 件物品`} />

      {/* Tab bar */}
      <View className='im-tabs'>
        <Button className={`im-tab tap ${tab === 'all' ? 'im-tab--active' : ''}`} hoverClass='tap--pressed' onClick={() => setTab('all')}>
          <AppIcon icon={Package} size={16} color={tab === 'all' ? palette.primary : palette.subtleForeground} />
          <Text>全部物品</Text>
        </Button>
        <Button className={`im-tab tap ${tab === 'trash' ? 'im-tab--active' : ''}`} hoverClass='tap--pressed' onClick={() => setTab('trash')}>
          <AppIcon icon={Trash2} size={16} color={tab === 'trash' ? palette.destructive : palette.subtleForeground} />
          <Text>垃圾桶 {trashItems.length > 0 ? trashItems.length : ''}</Text>
        </Button>
      </View>

      {/* Split layout: left categories + right items */}
      <View className='im-split'>
        {/* Left: category sidebar */}
        <ScrollView className='im-sidebar' scrollY>
          {allCategories.map((category) => (
            <Button
              key={category}
              className={`im-sidebar__item tap ${activeCategory === category ? 'im-sidebar__item--active' : ''}`}
              hoverClass='tap--pressed'
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </Button>
          ))}
          {activeCategory !== '全部' && isCustomCategory(activeCategory) && (
            <Button className='im-sidebar__delete tap' hoverClass='tap--pressed' onClick={() => deleteCustomCategory(activeCategory)}>
              <AppIcon icon={Trash2} size={14} color={palette.destructive} />
              <Text>删除分类</Text>
            </Button>
          )}
        </ScrollView>

        {/* Right: item list */}
        <ScrollView className='im-list' scrollY>
          {/* Trash header with clear-all */}
          {tab === 'trash' && trashItems.length > 0 && (
            <Button className='im-clear-all danger-action tap' hoverClass='tap--pressed' onClick={permanentDeleteAll}>
              <AppIcon icon={Trash2} size={15} color={palette.destructive} />
              <Text>全部永久删除</Text>
            </Button>
          )}

          {visibleItems.length === 0 ? (
            <View className='im-empty'>
              <AppIcon icon={tab === 'trash' ? Trash2 : Package} size={28} color={palette.subtleForeground} />
              <Text className='im-empty__title'>{tab === 'trash' ? '垃圾桶是空的' : '暂无物品'}</Text>
              <Text className='im-empty__copy'>{tab === 'trash' ? '删除的物品会出现在这里' : '点右下角新增按钮添加物品'}</Text>
            </View>
          ) : (
            visibleItems.map((item) => (
              <View key={item.id} className='im-row'>
                {item.photo ? (
                  <Image className='im-row__photo' src={item.photo} mode='aspectFill' lazyLoad />
                ) : (
                  <View className='im-row__photo im-row__placeholder'>
                    <AppIcon icon={Package} size={20} color={palette.subtleForeground} />
                  </View>
                )}
                <View className='im-row__body'>
                  <Text className='im-row__name'>{item.name}</Text>
                  <Text className='im-row__meta'>{item.location} · {item.quantityLabel}</Text>
                  <StateText label={getStatusLabel(item)} tone={statusTone[item.status]} />
                </View>
                <View className='im-row__actions'>
                  {(item.status === 'deleted' || item.status === 'finished' || item.status === 'discarded') ? (
                    <>
                      <Button className='icon-action tap' hoverClass='tap--pressed' aria-label='恢复' onClick={() => restore(item.id)}>
                        <AppIcon icon={RotateCcw} size={17} color={palette.success} />
                      </Button>
                      <Button className='icon-action tap' hoverClass='tap--pressed' aria-label='永久删除' onClick={() => permanentDelete(item.id, item.name)}>
                        <AppIcon icon={Trash2} size={17} color={palette.destructive} />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button className='icon-action tap' hoverClass='tap--pressed' aria-label='编辑' onClick={() => Taro.navigateTo({ url: `/pages/inventory-form/index?id=${item.id}` })}>
                        <AppIcon icon={Pencil} size={17} color={palette.subtleForeground} />
                      </Button>
                      <Button className='icon-action tap' hoverClass='tap--pressed' aria-label='删除' onClick={() => softDelete(item.id, item.name)}>
                        <AppIcon icon={Trash2} size={17} color={palette.destructive} />
                      </Button>
                    </>
                  )}
                </View>
              </View>
            ))
          )}

          {/* Add button at bottom of all-tab */}
          {tab === 'all' && (
            <Button className='im-add tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/inventory-form/index' })}>
              <AppIcon icon={Plus} size={18} color={palette.primary} />
              <Text>新增物品</Text>
            </Button>
          )}
        </ScrollView>
      </View>
    </PageShell>
  )
}
