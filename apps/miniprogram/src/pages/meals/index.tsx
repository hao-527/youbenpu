import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ChevronRight, History, Settings2, Utensils } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageShell } from '../../components/page-shell'
import { StateText } from '../../components/state-text'
import { useStore } from '../../store'
import { palette } from '../../theme/palette'
import type { DishCategory } from '../../types/domain'
import { dishCategories } from '../../types/domain'

import './index.scss'

export default function MealsPage() {
  const { dishes, orders, customDishCategories } = useStore()
  const categories: Array<'全部' | DishCategory> = ['全部', ...dishCategories, ...customDishCategories]
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>('全部')

  const pendingOrder = useMemo(() => orders.find((order) => order.status === 'pending') ?? null, [orders])
  const availableDishes = useMemo(() => dishes.filter((dish) => dish.available), [dishes])
  const visibleDishes = useMemo(
    () => activeCategory === '全部' ? availableDishes : availableDishes.filter((dish) => dish.category === activeCategory),
    [activeCategory, availableDishes]
  )

  const openCreateOrder = () => {
    if (pendingOrder) {
      Taro.navigateTo({ url: '/pages/meal-orders/index' })
      return
    }
    Taro.navigateTo({ url: '/pages/meal-create/index' })
  }

  return (
    <PageShell>
      <View className='page-title'>
        <View>
          <Text className='page-title__text'>吃饭</Text>
          <Text className='meals-page-subtitle'>选好今天吃什么，家里人都能看到</Text>
        </View>
      </View>

      <View className='content-toolbar content-toolbar--spread'>
        <Button className='content-action tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/meal-orders/index' })}>
          <AppIcon icon={History} size={16} color={palette.foreground} />
          <Text>点餐记录</Text>
        </Button>
        <Button className='content-action tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/dish-manage/index' })}>
          <AppIcon icon={Settings2} size={16} color={palette.foreground} />
          <Text>菜品管理</Text>
        </Button>
      </View>

      {pendingOrder ? (
        <Button className='meal-focus-card meal-focus-card--pending tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/meal-orders/index' })}>
          <View className='meal-focus-card__head'>
            <View className='meal-focus-card__copy'>
              <Text className='meal-focus-card__eyebrow'>当前点餐单</Text>
              <Text className='meal-focus-card__title'>{pendingOrder.items.length} 道菜，共 {pendingOrder.items.reduce((sum, item) => sum + item.quantity, 0)} 份</Text>
              <Text className='meal-focus-card__meta'>{pendingOrder.requesterName} · {pendingOrder.submittedAt}</Text>
            </View>
            <StateText label='待完成' tone='warn' />
          </View>
          <View className='meal-focus-card__dishes'>
            {pendingOrder.items.slice(0, 4).map((item) => (
              <View key={item.id} className='meal-focus-dish'>
                {item.photo ? (
                  <Image className='meal-focus-dish__photo' src={item.photo} mode='aspectFill' lazyLoad />
                ) : (
                  <View className='meal-focus-dish__photo meal-focus-dish__placeholder'>
                    <AppIcon icon={Utensils} size={18} color={palette.subtleForeground} />
                  </View>
                )}
                <Text className='meal-focus-dish__name'>{item.name}</Text>
              </View>
            ))}
          </View>
          <View className='meal-focus-card__link'>
            <Text>查看并处理点餐单</Text>
            <AppIcon icon={ChevronRight} size={17} color={palette.primary} />
          </View>
        </Button>
      ) : (
        <View className='meal-focus-card meal-focus-card--empty'>
          <View className='meal-focus-card__icon'>
            <AppIcon icon={Utensils} size={28} color={palette.primary} />
          </View>
          <Text className='meal-focus-card__title'>今天想吃什么？</Text>
          <Text className='meal-focus-card__meta'>从家里的菜谱里挑几道，一次提交给全家</Text>
          <Button className='button button--primary tap meal-focus-card__button' hoverClass='tap--pressed' onClick={openCreateOrder}>
            开始点餐
          </Button>
        </View>
      )}

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>可点菜品</Text>
          <Text className='section__meta'>{availableDishes.length} 道</Text>
        </View>

        <View className='tabs meals-tabs'>
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
            <Text className='empty-state__title'>这个分类还没有可点的菜</Text>
            <Text className='empty-state__copy'>可以到菜品管理中新增菜品，或将暂停菜品重新上架。</Text>
            <Button className='button button--outline empty-state__action tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/dish-manage/index' })}>
              去管理菜品
            </Button>
          </View>
        ) : (
          <View className='meal-preview-grid'>
            {visibleDishes.map((dish) => (
              <Button key={dish.id} className='meal-preview-card tap' hoverClass='tap--pressed' onClick={openCreateOrder}>
                {dish.photo ? (
                  <Image className='meal-preview-card__photo' src={dish.photo} mode='aspectFill' lazyLoad />
                ) : (
                  <View className='meal-preview-card__photo meal-preview-card__placeholder'>
                    <AppIcon icon={Utensils} size={26} color={palette.subtleForeground} />
                  </View>
                )}
                <Text className='meal-preview-card__category'>{dish.category}</Text>
                <Text className='meal-preview-card__name'>{dish.name}</Text>
                <Text className='meal-preview-card__meta'>{dish.ingredients.slice(0, 3).join(' · ') || '暂未填写食材'}</Text>
              </Button>
            ))}
          </View>
        )}
      </View>
    </PageShell>
  )
}
