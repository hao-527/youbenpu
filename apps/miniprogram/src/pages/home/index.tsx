import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ChevronRight, Package, PackagePlus, ReceiptText, Utensils } from 'lucide'
import { useMemo } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageShell } from '../../components/page-shell'
import { StateText } from '../../components/state-text'
import { useStore } from '../../store'
import { palette } from '../../theme/palette'
import { formatLocalDate, getInventoryExpiry, getNaturalMonthStart } from '../../utils/date'
import { formatYuan } from '../../utils/money'

import './index.scss'

export default function HomePage() {
  const { familyName, ledger, inventory, orders } = useStore()

  const pendingOrder = useMemo(() => orders.find((order) => order.status === 'pending') ?? null, [orders])
  const attentionItems = useMemo(() => inventory.flatMap((item) => {
    if (item.status === 'finished' || item.status === 'discarded') return []
    const expiry = getInventoryExpiry(item.expiryDate)
    return expiry.status === 'expiring' || expiry.status === 'expired'
      ? [{ ...item, status: expiry.status, expiryLabel: expiry.label }]
      : []
  }), [inventory])

  const summary = useMemo(() => {
    const start = getNaturalMonthStart(1)
    const end = formatLocalDate()
    return ledger.reduce((result, entry) => {
      if (entry.date < start || entry.date > end) return result
      if (entry.type === 'income') result.incomeCents += entry.amountCents
      else result.expenseCents += entry.amountCents
      result.balanceCents = result.incomeCents - result.expenseCents
      return result
    }, { incomeCents: 0, expenseCents: 0, balanceCents: 0 })
  }, [ledger])

  const today = new Date()
  const dateLabel = `${today.getMonth() + 1}月${today.getDate()}日`

  const quickActions = [
    { key: 'ledger', label: '记一笔', copy: '记录家庭收支', icon: ReceiptText, url: '/pages/ledger-entry/index' },
    { key: 'meals', label: pendingOrder ? '看点餐' : '点餐', copy: pendingOrder ? '处理当前点餐单' : '选今天吃什么', icon: Utensils, url: pendingOrder ? '/pages/meal-orders/index' : '/pages/meal-create/index' },
    { key: 'inventory', label: '加物品', copy: '记录存放位置', icon: PackagePlus, url: '/pages/inventory-form/index' }
  ] as const

  const pendingCount = pendingOrder ? pendingOrder.items.length : 0

  return (
    <PageShell>
      <View className='home-heading'>
        <View className='home-heading__copy'>
          <Text className='page-title__text'>{familyName}</Text>
          <Text className='home-heading__date'>{dateLabel} · 家庭生活概览</Text>
        </View>
      </View>

      <View className='home-overview surface-card'>
        <View className='home-overview__head'>
          <Text className='home-overview__label'>本月家庭结余</Text>
        </View>
        <Text className={`home-overview__balance ${summary.balanceCents < 0 ? 'home-overview__balance--negative' : ''}`}>{formatYuan(summary.balanceCents)}</Text>
        <View className='home-overview__metrics'>
          <View className='home-overview__metric'>
            <Text className='home-overview__metric-label'>收入</Text>
            <Text className='home-overview__metric-value home-overview__metric-value--income'>{formatYuan(summary.incomeCents)}</Text>
          </View>
          <View className='home-overview__metric'>
            <Text className='home-overview__metric-label'>支出</Text>
            <Text className='home-overview__metric-value'>{formatYuan(summary.expenseCents)}</Text>
          </View>
        </View>
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>快捷操作</Text>
        </View>
        <View className='home-quick-grid'>
          {quickActions.map((action) => (
            <Button key={action.key} className='home-quick-card tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: action.url })}>
              <View className='home-quick-card__icon'>
                <AppIcon icon={action.icon} size={20} color={palette.primary} />
              </View>
              <Text className='home-quick-card__title'>{action.label}</Text>
              <Text className='home-quick-card__copy'>{action.copy}</Text>
            </Button>
          ))}
        </View>
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>今日待办</Text>
          <Text className='section__meta'>{(pendingOrder ? 1 : 0) + attentionItems.length} 项</Text>
        </View>

        {!pendingOrder && attentionItems.length === 0 ? (
          <View className='home-all-clear surface-card'>
            <View className='home-all-clear__icon'>
              <AppIcon icon={Package} size={23} color={palette.success} />
            </View>
            <View>
              <Text className='home-all-clear__title'>今天没有待处理事项</Text>
              <Text className='home-all-clear__copy'>点餐和物品到期提醒会显示在这里</Text>
            </View>
          </View>
        ) : (
          <View className='home-task-list'>
            {pendingOrder && (
              <Button className='home-task-card surface-card tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/meal-orders/index' })}>
                <View className='home-task-card__head'>
                  <View className='home-task-card__icon'>
                    <AppIcon icon={Utensils} size={20} color={palette.primary} />
                  </View>
                  <View className='home-task-card__body'>
                    <View className='home-task-card__title-line'>
                      <Text className='home-task-card__title'>{pendingCount} 道菜待完成</Text>
                      <StateText label='待完成' tone='warn' />
                    </View>
                    <Text className='home-task-card__meta'>{pendingOrder.requesterName} 发起 · 查看点餐详情</Text>
                  </View>
                  <View className='home-row-chevron'>
                    <AppIcon icon={ChevronRight} size={16} color={palette.border} />
                  </View>
                </View>
                <View className='home-task-card__photos'>
                  {pendingOrder.items.slice(0, 4).map((item) => item.photo ? (
                    <Image key={item.id} className='home-task-card__photo' src={item.photo} mode='aspectFill' lazyLoad />
                  ) : (
                    <View key={item.id} className='home-task-card__photo home-task-card__photo--placeholder'>
                      <AppIcon icon={Utensils} size={16} color={palette.subtleForeground} />
                    </View>
                  ))}
                </View>
              </Button>
            )}

            {attentionItems.slice(0, 3).map((item) => (
              <Button key={item.id} className='home-item-row surface-card tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: `/pages/inventory-detail/index?id=${item.id}` })}>
                {item.photo ? (
                  <Image className='home-item-row__photo' src={item.photo} mode='aspectFill' lazyLoad />
                ) : (
                  <View className='home-item-row__photo home-item-row__placeholder'>
                    <AppIcon icon={Package} size={22} color={palette.subtleForeground} />
                  </View>
                )}
                <View className='home-item-row__body'>
                  <View className='home-item-row__title-line'>
                    <Text className='home-item-row__title'>{item.name}</Text>
                    <StateText label={item.expiryLabel} tone={item.status === 'expired' ? 'danger' : 'warn'} />
                  </View>
                  <Text className='home-item-row__meta'>{item.location} · {item.quantityLabel}</Text>
                </View>
                <View className='home-row-chevron'>
                  <AppIcon icon={ChevronRight} size={16} color={palette.border} />
                </View>
              </Button>
            ))}

            {attentionItems.length > 3 && (
              <Button className='home-more-link tap' hoverClass='tap--pressed' onClick={() => Taro.switchTab({ url: '/pages/inventory/index' })}>
                查看其余 {attentionItems.length - 3} 个待处理物品
              </Button>
            )}
          </View>
        )}
      </View>
    </PageShell>
  )
}
