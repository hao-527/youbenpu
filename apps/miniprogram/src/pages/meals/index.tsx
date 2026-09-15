import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { ChevronRight, History, Settings2, Utensils } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageShell } from '../../components/page-shell'
import { useAppShare } from '../../hooks/use-app-share'
import { navigate } from '../../utils/navigation'
import { getPortableImageUrl } from '../../utils/image-source'
import illustMeal from '../../assets/images/illustrations/meal.svg'
import { StateText } from '../../components/state-text'
import { useMaybeRefreshStore, useStore } from '../../store'
import { palette } from '../../theme/palette'
import type { DishCategory } from '../../types/domain'
import { dishCategories } from '../../types/domain'

import './index.scss'

export default function MealsPage() {
  const { dishes, orders, customDishCategories } = useStore()
  useAppShare({ title: '来看看我们家今天吃什么 | 生活有本谱', path: '/pages/meals/index' })
  const maybeRefresh = useMaybeRefreshStore()
  useDidShow(() => { void maybeRefresh() })
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
      navigate('/pages/meal-orders/index')
      return
    }
    navigate('/pages/meal-create/index')
  }

  return (
    <PageShell className='meals-page'>
      <View className='page-title meals-page-title'>
        <View>
          <Text className='page-title__text'>吃饭</Text>
          <Text className='page-title__subtitle'>选好今天吃什么，家里人都能看到</Text>
        </View>
      </View>

      {pendingOrder ? (
        <Button className='meal-focus-card meal-focus-card--pending surface-card tap' hoverClass='tap--pressed' onClick={() => navigate('/pages/meal-orders/index')}>
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
                {getPortableImageUrl(item.photo) ? (
                  <Image className='meal-focus-dish__photo' src={getPortableImageUrl(item.photo)} mode='aspectFill' lazyLoad />
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
        <View className='meal-focus-card meal-focus-card--empty surface-card'>
          <Image className='meal-focus-card__illust' src={illustMeal} mode='aspectFit' />
          <Text className='meal-focus-card__title'>今天想吃什么？</Text>
          <Text className='meal-focus-card__meta'>从家里的菜谱里挑几道，一次提交给全家</Text>
          <Button className='button button--primary tap meal-focus-card__button' hoverClass='tap--pressed' onClick={openCreateOrder}>
            开始点餐
          </Button>
        </View>
      )}

      <View className='section meals-dish-section'>
        <View className='section__head meals-dish-section__head'>
          <View className='meals-dish-section__title-group'>
            <Text className='section__title'>可点菜品</Text>
            <Text className='section__meta'>{availableDishes.length} 道</Text>
          </View>
          <View className='meals-dish-section__actions'>
            <Button className='content-action meals-section-action tap' hoverClass='tap--pressed' onClick={() => navigate('/pages/meal-orders/index')}>
              <AppIcon icon={History} size={15} color={palette.foreground} />
              <Text>点餐记录</Text>
            </Button>
            <Button className='content-action meals-section-action tap' hoverClass='tap--pressed' onClick={() => navigate('/pages/dish-manage/index')}>
              <AppIcon icon={Settings2} size={15} color={palette.foreground} />
              <Text>菜品管理</Text>
            </Button>
          </View>
        </View>

        <ScrollView className='tabs meals-category-tabs' scrollX enableFlex>
          <View className='tabs__track'>
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
        </ScrollView>

        {visibleDishes.length === 0 ? (
          <View className='empty-state surface-card meals-empty-state'>
            <Image className='meals-empty-state__illust' src={illustMeal} mode='aspectFit' />
            <Text className='empty-state__title'>这个分类还没有可点的菜</Text>
            <Text className='empty-state__copy'>可以到菜品管理中新增菜品，或将暂停菜品重新上架。</Text>
            <Button className='button button--outline empty-state__action tap' hoverClass='tap--pressed' onClick={() => navigate('/pages/dish-manage/index')}>
              去管理菜品
            </Button>
          </View>
        ) : (
          <View className='meal-preview-grid'>
            {visibleDishes.map((dish) => (
              <Button key={dish.id} className='meal-preview-card tap' hoverClass='tap--pressed' onClick={openCreateOrder}>
                {getPortableImageUrl(dish.photo) ? (
                  <Image className='meal-preview-card__photo' src={getPortableImageUrl(dish.photo)} mode='aspectFill' lazyLoad />
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
