import { Button, Image, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Minus, Plus, Trash2, Utensils } from 'lucide'
import { useCallback, useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { StateText } from '../../components/state-text'
import { useDispatch, useStore } from '../../store'
import { uid } from '../../store/uid'
import { palette } from '../../theme/palette'
import type { Dish, DishCategory, MealOrder } from '../../types/domain'

import './index.scss'

const categoryOptions: DishCategory[] = ['炒菜', '汤', '凉菜', '主食', '甜品', '其他']
const categoryFilters: Array<'全部' | DishCategory> = ['全部', ...categoryOptions]

export default function MealsPage() {
  const { dishes, mealOrder, familyId } = useStore()
  const dispatch = useDispatch()

  const [activeCategory, setActiveCategory] = useState<(typeof categoryFilters)[number]>('全部')
  const [showDishForm, setShowDishForm] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [editingDish, setEditingDish] = useState<Dish | null>(null)

  // Dish form
  const [dishName, setDishName] = useState('')
  const [dishCategory, setDishCategory] = useState<DishCategory>('炒菜')
  const [dishMethod, setDishMethod] = useState('')
  const [dishIngredients, setDishIngredients] = useState('')
  const [dishPhoto, setDishPhoto] = useState('')

  // Order form
  const [orderItems, setOrderItems] = useState<Record<string, number>>({})

  const visibleDishes = activeCategory === '全部'
    ? dishes
    : dishes.filter((d) => d.category === activeCategory)

  const hasPendingOrder = mealOrder && mealOrder.status === 'pending'

  const openAddDish = () => {
    setEditingDish(null)
    setDishName('')
    setDishCategory('炒菜')
    setDishMethod('')
    setDishIngredients('')
    setDishPhoto('')
    setShowDishForm(true)
  }

  const openEditDish = (dish: Dish) => {
    setEditingDish(dish)
    setDishName(dish.name)
    setDishCategory(dish.category)
    setDishMethod(dish.method)
    setDishIngredients(dish.ingredients.join('、'))
    setDishPhoto(dish.photo)
    setShowDishForm(true)
  }

  const chooseDishPhoto = () => {
    Taro.chooseImage({ count: 1, sizeType: ['compressed'] }).then((res) => {
      if (res.tempFilePaths.length > 0) setDishPhoto(res.tempFilePaths[0])
    }).catch(() => {})
  }

  const submitDish = useCallback(() => {
    if (!dishName.trim()) {
      Taro.showToast({ title: '请填写菜品名称', icon: 'none' })
      return
    }
    const ingredientsList = dishIngredients.split(/[、,，]/).map((s) => s.trim()).filter(Boolean)
    const dish: Dish = {
      id: editingDish?.id ?? uid('d-'),
      familyId,
      name: dishName.trim(),
      category: dishCategory,
      method: dishMethod.trim(),
      ingredients: ingredientsList,
      photo: dishPhoto,
      available: editingDish?.available ?? true
    }
    dispatch(editingDish ? { type: 'dish/update', dish } : { type: 'dish/add', dish })
    setShowDishForm(false)
    Taro.showToast({ title: editingDish ? '已更新' : '已添加', icon: 'success' })
  }, [dishName, dishCategory, dishMethod, dishIngredients, dishPhoto, editingDish, familyId, dispatch])

  const deleteDish = (id: string) => {
    Taro.showModal({ title: '删除这道菜？', confirmText: '删除', confirmColor: palette.destructive }).then((res) => {
      if (res.confirm) dispatch({ type: 'dish/delete', id })
    })
  }

  const toggleAvailable = (id: string) => dispatch({ type: 'dish/toggleAvailable', id })

  // Order
  const openOrderForm = () => {
    setOrderItems({})
    setShowOrderForm(true)
  }

  const setOrderQuantity = (dishId: string, delta: number) => {
    setOrderItems((prev) => {
      const current = prev[dishId] ?? 0
      const next = Math.max(0, current + delta)
      if (next === 0) {
        const copy = { ...prev }
        delete copy[dishId]
        return copy
      }
      return { ...prev, [dishId]: next }
    })
  }

  const submitOrder = useCallback(() => {
    const items = Object.entries(orderItems)
      .filter(([, q]) => q > 0)
      .map(([dishId, quantity]) => {
        const dish = dishes.find((d) => d.id === dishId)
        return { id: uid('oi-'), name: dish?.name ?? '', quantity }
      })
    if (items.length === 0) {
      Taro.showToast({ title: '至少选一道菜', icon: 'none' })
      return
    }
    const order: MealOrder = {
      id: uid('mo-'),
      familyId,
      status: 'pending',
      requesterName: '我',
      submittedAt: '刚刚',
      items
    }
    dispatch({ type: 'order/create', order })
    setShowOrderForm(false)
    Taro.showToast({ title: '点餐单已提交', icon: 'success' })
  }, [orderItems, dishes, familyId, dispatch])

  const cancelOrder = () => {
    Taro.showModal({ title: '取消这张点餐单？', confirmText: '取消', confirmColor: palette.destructive }).then((res) => {
      if (res.confirm) dispatch({ type: 'order/cancel' })
    })
  }

  const completeOrder = () => {
    Taro.showModal({ title: '完成这张点餐单？', confirmText: '完成', confirmColor: palette.primary }).then((res) => {
      if (res.confirm) dispatch({ type: 'order/complete' })
    })
  }

  return (
    <View className='page-shell'>
      <View className='page-title'>
        <Text className='page-title__text'>吃饭</Text>
      </View>

      {/* Pending order */}
      {hasPendingOrder && mealOrder && (
        <View className='section'>
          <View className='section__head'>
            <Text className='section__title'>当前点餐单</Text>
            <StateText label='待完成' tone='warn' />
          </View>
          <View className='list'>
            {mealOrder.items.map((item) => (
              <View key={item.id} className='list__row'>
                <View className='icon-bubble icon-bubble--primary'>
                  <AppIcon icon={Utensils} size={16} color={palette.primary} />
                </View>
                <View className='list__body'>
                  <Text className='list__title'>{item.name}</Text>
                </View>
                <Text className='list__value'>× {item.quantity}</Text>
              </View>
            ))}
          </View>
          <View className='order-actions'>
            <Button className='button button--outline tap' hoverClass='tap--pressed' onClick={completeOrder}>完成</Button>
            <Button className='button button--danger tap' hoverClass='tap--pressed' onClick={cancelOrder}>取消</Button>
          </View>
          <Text className='hint'>由 {mealOrder.requesterName} 提交 · {mealOrder.submittedAt}</Text>
        </View>
      )}

      {/* Dish grid */}
      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>家里的菜</Text>
          <Text className='section__meta'>{visibleDishes.length} 道</Text>
        </View>

        <View className='tabs meals-tabs'>
          {categoryFilters.map((cat) => (
            <Button
              key={cat}
              className={`tabs__item tap ${activeCategory === cat ? 'tabs__item--active' : ''}`}
              hoverClass='tap--pressed'
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </View>

        <View className='dish-grid'>
          {visibleDishes.map((dish) => (
            <View key={dish.id} className={`dish ${dish.available ? '' : 'dish--disabled'}`}>
              <View className='dish__photo-wrap' onClick={() => openEditDish(dish)}>
                {dish.photo ? (
                  <Image className='dish__photo' src={dish.photo} mode='aspectFill' lazyLoad />
                ) : (
                  <View className='dish__photo dish__photo--placeholder'>
                    <AppIcon icon={Utensils} size={28} color={palette.subtleForeground} />
                  </View>
                )}
                <View className='dish__category'>{dish.category}</View>
              </View>
              <Text className='dish__name'>{dish.name}</Text>
              <Text className='dish__meta'>{dish.ingredients.slice(0, 3).join(' · ')}</Text>
              <View className='dish__actions'>
                <Button className='tap' hoverClass='tap--pressed' onClick={() => toggleAvailable(dish.id)}>
                  <StateText label={dish.available ? '可点' : '暂停'} tone={dish.available ? 'ok' : 'muted'} />
                </Button>
                <Button className='tap' hoverClass='tap--pressed' onClick={() => deleteDish(dish.id)}>
                  <AppIcon icon={Trash2} size={15} color={palette.subtleForeground} />
                </Button>
              </View>
            </View>
          ))}
        </View>

        {visibleDishes.length === 0 && <View className='list__empty'>该分类暂无菜品</View>}
      </View>

      {/* Dish form sheet */}
      {showDishForm && (
        <View className='form-overlay' onClick={() => setShowDishForm(false)}>
          <View className='form-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='form-sheet__title'>{editingDish ? '编辑菜品' : '上传新菜品'}</Text>

            <Button className='form-photo-btn tap' hoverClass='tap--pressed' onClick={chooseDishPhoto}>
              {dishPhoto ? <Image className='form-photo-preview' src={dishPhoto} mode='aspectFill' /> : <Text>选择图片</Text>}
            </Button>

            <Input className='form-input' type='text' placeholder='菜品名称' value={dishName} onInput={(e) => setDishName(e.detail.value)} />

            <Picker mode='selector' range={categoryOptions} value={categoryOptions.indexOf(dishCategory)} onChange={(e) => setDishCategory(categoryOptions[Number(e.detail.value)])}>
              <View className='form-input form-input--picker'><Text>类别：{dishCategory}</Text></View>
            </Picker>

            <Input className='form-input' type='text' placeholder='做法简述' value={dishMethod} onInput={(e) => setDishMethod(e.detail.value)} />
            <Input className='form-input' type='text' placeholder='食材（用顿号分隔）' value={dishIngredients} onInput={(e) => setDishIngredients(e.detail.value)} />

            <Button className='button button--primary tap form-submit' hoverClass='tap--pressed' onClick={submitDish}>
              确认
            </Button>
          </View>
        </View>
      )}

      {/* Order form sheet */}
      {showOrderForm && (
        <View className='form-overlay' onClick={() => setShowOrderForm(false)}>
          <View className='form-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='form-sheet__title'>提交点餐单</Text>
            <View className='order-picker'>
              {dishes.filter((d) => d.available).map((dish) => {
                const qty = orderItems[dish.id] ?? 0
                return (
                  <View key={dish.id} className='order-picker__row'>
                    <Text className='order-picker__name'>{dish.name}</Text>
                    <View className='order-picker__controls'>
                      <Button className='tap' hoverClass='tap--pressed' onClick={() => setOrderQuantity(dish.id, -1)}>
                        <AppIcon icon={Minus} size={18} color={palette.subtleForeground} />
                      </Button>
                      <Text className='order-picker__qty'>{qty}</Text>
                      <Button className='tap' hoverClass='tap--pressed' onClick={() => setOrderQuantity(dish.id, 1)}>
                        <AppIcon icon={Plus} size={18} color={palette.primary} />
                      </Button>
                    </View>
                  </View>
                )
              })}
            </View>
            <Button className='button button--primary tap form-submit' hoverClass='tap--pressed' onClick={submitOrder}>
              提交
            </Button>
          </View>
        </View>
      )}

      <View className='button-bar'>
        {hasPendingOrder ? (
          <Button className='button tap' hoverClass='tap--pressed' disabled>已有待完成点餐单</Button>
        ) : (
          <View className='button-bar__row'>
            <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={openOrderForm}>
              提交点餐单
            </Button>
            <Button className='button button--outline tap' hoverClass='tap--pressed' onClick={openAddDish}>
              <AppIcon icon={Plus} size={18} color={palette.foreground} />
              添加菜品
            </Button>
          </View>
        )}
      </View>
    </View>
  )
}
