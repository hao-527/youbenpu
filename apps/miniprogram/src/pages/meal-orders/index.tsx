import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ReceiptText, Trash2, Utensils } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { StateText, type StateTone } from '../../components/state-text'
import { useDispatch, useStore } from '../../store'
import { palette } from '../../theme/palette'
import type { MealOrder, MealOrderStatus } from '../../types/domain'

import './index.scss'

type HistoryFilter = 'all' | Extract<MealOrderStatus, 'completed' | 'cancelled'>
const historyFilters: Array<{ key: HistoryFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' }
]

const statusMeta: Record<MealOrderStatus, { label: string; tone: StateTone }> = {
  pending: { label: '待完成', tone: 'warn' },
  completed: { label: '已完成', tone: 'ok' },
  cancelled: { label: '已取消', tone: 'muted' }
}

function DishList({ order, compact = false }: { order: MealOrder; compact?: boolean }) {
  return (
    <View className={compact ? 'order-dish-list order-dish-list--compact' : 'order-dish-list'}>
      {order.items.map((item) => (
        <View key={item.id} className='order-dish-row'>
          {item.photo ? (
            <Image className='order-dish-row__photo' src={item.photo} mode='aspectFill' lazyLoad />
          ) : (
            <View className='order-dish-row__photo order-dish-row__placeholder'>
              <AppIcon icon={Utensils} size={18} color={palette.subtleForeground} />
            </View>
          )}
          <Text className='order-dish-row__name'>{item.name}</Text>
          <Text className='order-dish-row__quantity num'>× {item.quantity}</Text>
        </View>
      ))}
    </View>
  )
}

export default function MealOrdersPage() {
  const { orders } = useStore()
  const dispatch = useDispatch()
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')

  const pendingOrder = useMemo(() => orders.find((order) => order.status === 'pending') ?? null, [orders])
  const historyOrders = useMemo(() => orders.filter((order) => order.status !== 'pending' && (historyFilter === 'all' || order.status === historyFilter)), [historyFilter, orders])

  const completeOrder = (id: string) => {
    Taro.showModal({
      title: '确认这餐已完成？',
      content: '完成后会移入历史记录。',
      confirmText: '确认完成',
      confirmColor: palette.primary
    }).then((result) => {
      if (result.confirm) dispatch({ type: 'order/complete', id })
    })
  }

  const cancelOrder = (id: string) => {
    Taro.showModal({
      title: '取消当前点餐单？',
      content: '取消后会移入历史记录，之后可以重新发起点餐。',
      confirmText: '确认取消',
      confirmColor: palette.destructive
    }).then((result) => {
      if (result.confirm) dispatch({ type: 'order/cancel', id })
    })
  }

  const deleteOrder = (id: string) => {
    Taro.showModal({
      title: '删除这条历史记录？',
      content: '删除后无法恢复，菜品库不会受影响。',
      confirmText: '删除',
      confirmColor: palette.destructive
    }).then((result) => {
      if (result.confirm) dispatch({ type: 'order/delete', id })
    })
  }

  return (
    <PageShell tabPage={false}>
      <PageHeader title='点餐记录' subtitle={pendingOrder ? '有 1 张待完成点餐单' : '当前没有待办'} />

      <View className='section orders-current-section'>
        <View className='section__head'>
          <Text className='section__title'>当前点餐单</Text>
        </View>
        {pendingOrder ? (
          <View className='current-order-card surface-card'>
            <View className='current-order-card__head'>
              <View className='current-order-card__copy'>
                <Text className='current-order-card__title'>{pendingOrder.items.length} 道菜 · {pendingOrder.items.reduce((sum, item) => sum + item.quantity, 0)} 份</Text>
                <Text className='current-order-card__meta'>{pendingOrder.requesterName} · {pendingOrder.submittedAt}</Text>
              </View>
              <StateText label='待完成' tone='warn' />
            </View>
            <DishList order={pendingOrder} />
            <View className='current-order-card__actions'>
              <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={() => completeOrder(pendingOrder.id)}>完成这餐</Button>
              <Button className='button button--outline tap' hoverClass='tap--pressed' onClick={() => cancelOrder(pendingOrder.id)}>取消点餐单</Button>
            </View>
          </View>
        ) : (
          <View className='orders-no-current surface-card'>
            <View className='icon-bubble icon-bubble--md icon-bubble--primary'>
              <AppIcon icon={Utensils} size={25} color={palette.primary} />
            </View>
            <View className='orders-no-current__copy'>
              <Text className='orders-no-current__title'>没有待完成的点餐单</Text>
              <Text className='orders-no-current__meta'>选几道菜，告诉家里今天吃什么</Text>
            </View>
            <Button className='content-action content-action--primary tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/meal-create/index' })}>开始点餐</Button>
          </View>
        )}
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>历史记录</Text>
          <Text className='section__meta'>{orders.filter((order) => order.status !== 'pending').length} 条</Text>
        </View>
        <ScrollView className='tabs' scrollX enableFlex>
          <View className='tabs__track'>
            {historyFilters.map((item) => (
              <Button
                key={item.key}
                className={`tabs__item tap ${historyFilter === item.key ? 'tabs__item--active' : ''}`}
                hoverClass='tap--pressed'
                onClick={() => setHistoryFilter(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </View>
        </ScrollView>

        {historyOrders.length === 0 ? (
          <View className='empty-state surface-card'>
            <View className='empty-state__icon'>
              <AppIcon icon={ReceiptText} size={30} color={palette.subtleForeground} />
            </View>
            <Text className='empty-state__title'>暂无历史记录</Text>
            <Text className='empty-state__copy'>完成或取消的点餐单会保留在这里。</Text>
          </View>
        ) : (
          <View className='orders-history-list'>
            {historyOrders.map((order) => {
              const meta = statusMeta[order.status]
              return (
                <View key={order.id} className='history-order-card surface-card'>
                  <View className='history-order-card__head'>
                    <View className='history-order-card__copy'>
                      <Text className='history-order-card__title'>{order.requesterName} 的点餐单</Text>
                      <Text className='history-order-card__meta'>{order.submittedAt} · {order.items.length} 道菜</Text>
                    </View>
                    <StateText label={meta.label} tone={meta.tone} />
                  </View>
                  <DishList order={order} compact />
                  <Button className='danger-action history-order-card__delete tap' hoverClass='tap--pressed' onClick={() => deleteOrder(order.id)}>
                    <AppIcon icon={Trash2} size={15} color={palette.destructive} />
                    <Text>删除记录</Text>
                  </Button>
                </View>
              )
            })}
          </View>
        )}
      </View>
    </PageShell>
  )
}
