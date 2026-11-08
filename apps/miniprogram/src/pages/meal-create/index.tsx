import { SafeImage as Image } from '../../components/safe-image'
import { DesignIntro } from '../../components/design-intro'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Minus, Plus, Utensils } from 'lucide'
import { useMemo, useRef, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { useAppShare } from '../../hooks/use-app-share'
import { useDispatch, useStore } from '../../store'
import { uid } from '../../store/uid'
import { navigate } from '../../utils/navigation'
import { palette } from '../../theme/palette'
import type { DishCategory, MealOrder } from '../../types/domain'
import { dishCategories } from '../../types/domain'
import { getPortableImageUrl } from '../../utils/image-source'

import './index.scss'

export default function MealCreatePage() {
  const { dishes, orders, familyId, currentMemberId, members, customDishCategories } = useStore()
  const dispatch = useDispatch()
  useAppShare({ title: '来看看我们家的菜单 | 生活有本谱', path: '/pages/meals/index' })
  const openOrders = () => {
    void Taro.redirectTo({ url: '/pages/meal-orders/index' }).catch(() => {
      // Some DevTools base libraries time out the callback after the page has
      // already opened. Do not turn a persisted order into an unhandled error.
      const current = Taro.getCurrentPages().slice(-1)[0]?.route
      if (current === 'pages/meal-orders/index') return
      void Taro.showToast({ title: '点餐已保存，请再次打开点餐记录', icon: 'none' })
    })
  }
  const submittingRef = useRef(false)
  const categories: Array<'全部' | DishCategory> = ['全部', ...dishCategories, ...customDishCategories]
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [activeCategory, setActiveCategory] = useState<(typeof categories)[number]>('全部')
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const pendingOrder = useMemo(() => orders.find((order) => order.status === 'pending') ?? null, [orders])
  const availableDishes = useMemo(() => dishes.filter((dish) => dish.available), [dishes])
  const visibleDishes = useMemo(
    () => activeCategory === '全部' ? availableDishes : availableDishes.filter((dish) => dish.category === activeCategory),
    [activeCategory, availableDishes]
  )
  const selectedQuantities = availableDishes.map((dish) => quantities[dish.id] ?? 0).filter((quantity) => quantity > 0)
  const selectedDishCount = selectedQuantities.length
  const totalQuantity = selectedQuantities.reduce((sum, value) => sum + value, 0)

  const updateQuantity = (dishId: string, delta: number) => {
    if (submittingRef.current) return
    setQuantities((current) => {
      const nextValue = Math.min(99, Math.max(0, (current[dishId] ?? 0) + delta))
      if (nextValue === 0) {
        const next = { ...current }
        delete next[dishId]
        return next
      }
      return { ...current, [dishId]: nextValue }
    })
  }

  const submitOrder = async () => {
    if (submittingRef.current || pendingOrder || !familyId) return

    const items = availableDishes.flatMap((dish) => {
      const quantity = quantities[dish.id] ?? 0
      return quantity > 0
        ? [{ id: uid('oi-'), dishId: dish.id, name: dish.name, quantity, photo: getPortableImageUrl(dish.photo) }]
        : []
    })

    if (items.length === 0) {
      Taro.showToast({ title: '至少选择一道菜', icon: 'none' })
      return
    }

    const now = new Date()
    const requester = members.find((member) => member.id === currentMemberId)?.displayName ?? '我'
    const order: MealOrder = {
      id: uid('mo-'),
      familyId,
      status: 'pending',
      requesterName: requester,
      submittedAt: `今天 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      items
    }

    submittingRef.current = true
    setSubmitting(true)
    setSubmitError('')
    const succeeded = await dispatch({ type: 'order/create', order })
    if (!succeeded) {
      submittingRef.current = false
      setSubmitting(false)
      setSubmitError('提交失败，已保留选择，请检查当前菜品后重试')
      return
    }
    Taro.showToast({ title: '点餐单已提交', icon: 'success', duration: 900 })
    setTimeout(openOrders, 450)
  }

  if (pendingOrder) {
    return (
      <PageShell className='meal-create-page' tabPage={false}>
        <PageHeader title='开始点餐' />
        <View className='empty-state surface-card meal-create-conflict'>
          <View className='empty-state__icon empty-state__icon--primary'>
            <AppIcon icon={Utensils} size={28} color={palette.primary} />
          </View>
          <Text className='empty-state__title'>已有一张待完成点餐单</Text>
          <Text className='empty-state__copy'>先完成或取消当前点餐单，再发起新的点餐。</Text>
          <Button className='button button--primary empty-state__action tap' hoverClass='tap--pressed' onClick={openOrders}>
            查看当前点餐单
          </Button>
        </View>
      </PageShell>
    )
  }


  return (
    <PageShell className='meal-create-page' tabPage={false} withFixedBar>
      <PageHeader title='开始点餐' subtitle='按需要调整每道菜的份数' />
      <DesignIntro kind='order'>{'好好吃饭～\n就是幸福的日常！'}</DesignIntro>

      <View className='meal-create-summary surface-card'>
        <Text className='meal-create-summary__title'>今天吃什么</Text>
        <Text className='meal-create-summary__copy'>可以选择多道菜，同一道最多 99 份</Text>
      </View>

      <ScrollView className='tabs tabs--category' scrollX enableFlex>
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

      {availableDishes.length === 0 ? (
        <View className='empty-state surface-card'>
          <View className='empty-state__icon'>
            <AppIcon icon={Utensils} size={30} color={palette.subtleForeground} />
          </View>
          <Text className='empty-state__title'>还没有可点的菜</Text>
          <Text className='empty-state__copy'>先添加菜品或将暂停菜品重新上架。</Text>
          <Button className='button button--outline empty-state__action tap' hoverClass='tap--pressed' onClick={() => navigate('/pages/dish-manage/index')}>
            去管理菜品
          </Button>
        </View>
      ) : visibleDishes.length === 0 ? (
        <View className='empty-state surface-card'>
          <View className='empty-state__icon'>
            <AppIcon icon={Utensils} size={30} color={palette.subtleForeground} />
          </View>
          <Text className='empty-state__title'>这个分类暂无菜品</Text>
          <Text className='empty-state__copy'>切换其他分类继续选择。</Text>
        </View>
      ) : (
        <View className='meal-select-list surface-card'>
          {visibleDishes.map((dish) => {
            const quantity = quantities[dish.id] ?? 0
            return (
              <View key={dish.id} className={`meal-select-row ${quantity > 0 ? 'meal-select-row--selected' : ''}`}>
                {getPortableImageUrl(dish.photo) ? (
                  <Image className='meal-select-row__photo' src={getPortableImageUrl(dish.photo)} mode='aspectFill' lazyLoad />
                ) : (
                  <View className='meal-select-row__photo meal-select-row__placeholder'>
                    <AppIcon icon={Utensils} size={20} color={palette.subtleForeground} />
                  </View>
                )}
                <View className='meal-select-row__body'>
                  <Text className='meal-select-row__name'>{dish.name}</Text>
                  <Text className='meal-select-row__meta'>{dish.category} · {dish.ingredients.slice(0, 3).join('、') || '暂未填写食材'}</Text>
                </View>
                <View className='quantity-stepper' aria-label={`${dish.name}数量`}>
                  <Button
                    className='quantity-stepper__button tap'
                    hoverClass='tap--pressed'
                    disabled={quantity === 0 || submitting}
                    aria-label={`减少${dish.name}数量`}
                    onClick={() => updateQuantity(dish.id, -1)}
                  >
                    <AppIcon icon={Minus} size={18} color={quantity === 0 ? palette.disabledForeground : palette.foreground} />
                  </Button>
                  <Text className='quantity-stepper__value num'>{quantity}</Text>
                  <Button
                    className='quantity-stepper__button quantity-stepper__button--add tap'
                    hoverClass='tap--pressed'
                    disabled={quantity >= 99 || submitting}
                    aria-label={`增加${dish.name}数量`}
                    onClick={() => updateQuantity(dish.id, 1)}
                  >
                    <AppIcon icon={Plus} size={18} color={palette.onPrimary} />
                  </Button>
                </View>
              </View>
            )
          })}
        </View>
      )}

      {submitError && <View className='surface-card form-error'><Text>{submitError}</Text></View>}
      <View className='fixed-action-bar fixed-action-bar--split'>
        <View className='fixed-action-bar__meta' aria-live='polite'>
          <Text className='fixed-action-bar__title'>已选 {selectedDishCount} 道</Text>
          <Text className='fixed-action-bar__copy'>共 {totalQuantity} 份</Text>
        </View>
        <Button className='button button--primary tap' hoverClass='tap--pressed' disabled={selectedDishCount === 0 || submitting || !familyId} loading={submitting} onClick={submitOrder}>
          提交点餐单
        </Button>
      </View>
    </PageShell>
  )
}
