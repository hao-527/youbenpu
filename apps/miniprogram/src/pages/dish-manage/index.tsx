import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Pencil, Plus, Trash2, Utensils } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { StateText } from '../../components/state-text'
import { useDispatch, useStore } from '../../store'
import { palette } from '../../theme/palette'
import type { DishCategory } from '../../types/domain'
import { dishCategories } from '../../types/domain'

import './index.scss'

export default function DishManagePage() {
  const { dishes, orders, customDishCategories } = useStore()
  const dispatch = useDispatch()
  const categories: Array<'全部' | DishCategory> = ['全部', ...dishCategories, ...customDishCategories]
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>('全部')

  const visibleDishes = useMemo(
    () => activeCategory === '全部' ? dishes : dishes.filter((dish) => dish.category === activeCategory),
    [activeCategory, dishes]
  )
  const pendingDishIds = useMemo(() => new Set(
    orders.filter((order) => order.status === 'pending').flatMap((order) => order.items.map((item) => item.dishId))
  ), [orders])

  const deleteDish = (id: string, name: string) => {
    if (pendingDishIds.has(id)) {
      Taro.showToast({ title: '当前点餐单正在使用这道菜', icon: 'none' })
      return
    }
    Taro.showModal({
      title: `删除“${name}”？`,
      content: '历史点餐记录仍会保留菜名和图片快照。',
      confirmText: '删除',
      confirmColor: palette.destructive
    }).then((result) => {
      if (result.confirm) dispatch({ type: 'dish/delete', id })
    })
  }

  return (
    <PageShell tabPage={false}>
      <PageHeader title='菜品管理' subtitle={`${dishes.filter((dish) => dish.available).length} 道可点`} />

      <View className='content-toolbar content-toolbar--spread'>
        <Text className='dish-manage-hint'>暂停后不会出现在点餐选择页</Text>
        <Button className='content-action content-action--primary tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/dish-form/index' })}>
          <AppIcon icon={Plus} size={16} color={palette.onPrimary} />
          <Text>添加菜品</Text>
        </Button>
      </View>

      <View className='tabs dish-manage-tabs'>
        {categories.map((category) => (
          <Button
            key={category}
            className={`tabs__item tap ${activeCategory === category ? 'tabs__item--active' : ''}`}
            hoverClass='tap--pressed'
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </Button>
        ))}
      </View>

      {visibleDishes.length === 0 ? (
        <View className='empty-state surface-card'>
          <Text className='empty-state__title'>这个分类还没有菜品</Text>
          <Text className='empty-state__copy'>添加一道家常菜，点餐时就能直接选择。</Text>
          <Button className='button button--primary empty-state__action tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/dish-form/index' })}>
            添加菜品
          </Button>
        </View>
      ) : (
        <View className='dish-manage-list surface-card'>
          {visibleDishes.map((dish) => (
            <View key={dish.id} className='dish-manage-row'>
              {dish.photo ? (
                <Image className='dish-manage-row__photo' src={dish.photo} mode='aspectFill' lazyLoad />
              ) : (
                <View className='dish-manage-row__photo dish-manage-row__placeholder'>
                  <AppIcon icon={Utensils} size={22} color={palette.subtleForeground} />
                </View>
              )}
              <Button className='dish-manage-row__body tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: `/pages/dish-form/index?id=${dish.id}` })}>
                <Text className='dish-manage-row__name'>{dish.name}</Text>
                <Text className='dish-manage-row__meta'>{dish.category} · {dish.ingredients.slice(0, 3).join('、') || '未填写食材'}</Text>
                <StateText label={dish.available ? '点餐可见' : '已暂停'} tone={dish.available ? 'ok' : 'muted'} />
              </Button>
              <View className='dish-manage-row__actions'>
                <Button
                  className='icon-action tap'
                  hoverClass='tap--pressed'
                  aria-label={dish.available ? `暂停${dish.name}` : `上架${dish.name}`}
                  onClick={() => dispatch({ type: 'dish/toggleAvailable', id: dish.id })}
                >
                  <Text className={dish.available ? 'dish-manage-row__toggle' : 'dish-manage-row__toggle dish-manage-row__toggle--resume'}>
                    {dish.available ? '暂停' : '上架'}
                  </Text>
                </Button>
                <Button className='icon-action tap' hoverClass='tap--pressed' aria-label={`编辑${dish.name}`} onClick={() => Taro.navigateTo({ url: `/pages/dish-form/index?id=${dish.id}` })}>
                  <AppIcon icon={Pencil} size={17} color={palette.subtleForeground} />
                </Button>
                <Button className='icon-action tap' hoverClass='tap--pressed' aria-label={`删除${dish.name}`} onClick={() => deleteDish(dish.id, dish.name)}>
                  <AppIcon icon={Trash2} size={17} color={pendingDishIds.has(dish.id) ? palette.border : palette.destructive} />
                </Button>
              </View>
            </View>
          ))}
        </View>
      )}
    </PageShell>
  )
}
