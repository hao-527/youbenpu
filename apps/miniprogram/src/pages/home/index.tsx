import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { ChevronRight, Package, PackagePlus, ReceiptText, Utensils } from 'lucide'
import { useMemo } from 'react'

import { AppIcon } from '../../components/app-icon'
import { Onboarding } from '../../components/onboarding'
import { PageShell } from '../../components/page-shell'
import { StateText } from '../../components/state-text'
import { useAppShare } from '../../hooks/use-app-share'
import { useFamilyGate } from '../../hooks/use-family-gate'
import { navigate } from '../../utils/navigation'
import { useMaybeRefreshStore, useStore } from '../../store'
import { palette } from '../../theme/palette'
import { formatLocalDate, getInventoryExpiry, getNaturalMonthStart } from '../../utils/date'
import { formatYuan } from '../../utils/money'

import illustLedger from '../../assets/images/illustrations/ledger.svg'
import illustNote from '../../assets/images/illustrations/note.svg'
import illustMeal from '../../assets/images/illustrations/meal.svg'
import illustStorage from '../../assets/images/illustrations/storage.svg'
import illustAllDone from '../../assets/images/illustrations/all-done.svg'
import illustExpiry from '../../assets/images/illustrations/expiry.svg'

import './index.scss'

export default function HomePage() {
  const { familyName, ledger, inventory, orders, onboardingCompleted, settings } = useStore()
  const { requireFamily, familyGate } = useFamilyGate()
  useAppShare()
  const maybeRefresh = useMaybeRefreshStore()
  useDidShow(() => { void maybeRefresh() })

  const pendingOrder = useMemo(() => settings.mealReminder ? orders.find((order) => order.status === 'pending') ?? null : null, [orders, settings.mealReminder])
  const attentionItems = useMemo(() => {
    if (!settings.expiryReminder) return []
    return inventory.flatMap((item) => {
      if (item.status === 'finished' || item.status === 'discarded' || item.status === 'deleted') return []
      const expiry = getInventoryExpiry(item.expiryDate)
      return expiry.status === 'expiring' || expiry.status === 'expired'
        ? [{ ...item, status: expiry.status, expiryLabel: expiry.label }]
        : []
    })
  }, [inventory, settings.expiryReminder])

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

  const featureActions = [
    { key: 'ledger', label: '记一笔', copy: '记录家庭收支', icon: ReceiptText, illust: illustNote, url: '/pages/ledger-entry/index', reason: '记账需要先有一个家庭，账目会和家人共享。' },
    { key: 'meals', label: pendingOrder ? '看点餐' : '今天吃什么', copy: pendingOrder ? '处理当前点餐单' : '不知道吃什么？来选一选', icon: Utensils, illust: illustMeal, url: pendingOrder ? '/pages/meal-orders/index' : '/pages/meal-create/index', reason: '点餐需要先有一个家庭，才能把菜单发给家人。' },
    { key: 'inventory', label: '家里有什么', copy: '管理物品与到期提醒', icon: PackagePlus, illust: illustStorage, url: '/pages/inventory-form/index', reason: '物品管理需要先有一个家庭，家人才能一起查找。' }
  ] as const

  /** Feature entries first check family membership, then navigate. */
  const openFeature = (url: string, reason: string) => {
    if (!requireFamily(reason)) return
    navigate(url)
  }

  const pendingCount = pendingOrder ? pendingOrder.items.length : 0
  const taskCount = (pendingOrder ? 1 : 0) + attentionItems.length

  return (
    <PageShell>
      {!onboardingCompleted && <Onboarding />}

      <View className='page-title'>
        <View>
          <Text className='page-title__text'>{familyName || '生活有本谱'}</Text>
          <Text className='page-title__subtitle'>
            {familyName ? `${dateLabel} · 家庭生活概览` : `${dateLabel} · 创建家庭后即可与家人共享`}
          </Text>
        </View>
      </View>

      <View className='home-overview surface-card'>
        <View className='home-overview__info'>
          <Text className='home-overview__label'>本月家庭结余</Text>
          <Text className={`home-overview__balance num ${summary.balanceCents < 0 ? 'home-overview__balance--negative' : ''}`}>{formatYuan(summary.balanceCents)}</Text>
          <View className='home-overview__metrics'>
            <View className='home-overview__metric'>
              <Text className='home-overview__metric-label'>收入</Text>
              <Text className='home-overview__metric-value num home-overview__metric-value--income'>{formatYuan(summary.incomeCents)}</Text>
            </View>
            <View className='home-overview__metric'>
              <Text className='home-overview__metric-label'>支出</Text>
              <Text className='home-overview__metric-value num'>{formatYuan(summary.expenseCents)}</Text>
            </View>
          </View>
        </View>
        <Image className='home-overview__illust' src={illustLedger} mode='aspectFit' />
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>快捷操作</Text>
        </View>
        <View className='home-feature-grid'>
          {featureActions.map((action) => (
            <Button
              key={action.key}
              className='home-feature-card surface-card tap'
              hoverClass='tap--pressed'
              aria-label={`${action.label}，${action.copy}`}
              onClick={() => openFeature(action.url, action.reason)}
            >
              <Image className='home-feature-card__illust' src={action.illust} mode='aspectFit' />
              <Text className='home-feature-card__title'>{action.label}</Text>
              <Text className='home-feature-card__copy'>{action.copy}</Text>
            </Button>
          ))}
        </View>
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>今日待办</Text>
          <Text className='section__meta'>{taskCount} 项</Text>
        </View>

        {taskCount === 0 ? (
          <View className='home-all-clear surface-card'>
            <Image className='home-all-clear__illust' src={illustAllDone} mode='aspectFit' />
            <View className='home-all-clear__body'>
              <Text className='home-all-clear__title'>今天没有待处理事项</Text>
              <Text className='home-all-clear__copy'>点餐和物品到期提醒会显示在这里</Text>
            </View>
          </View>
        ) : (
          <View className='home-task-list'>
            {pendingOrder && (
              <Button className='home-task-card surface-card tap tap-row' hoverClass='tap--pressed' onClick={() => navigate('/pages/meal-orders/index')}>
                <View className='home-task-card__head'>
                  <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
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
                    <AppIcon icon={ChevronRight} size={16} color={palette.subtleForeground} />
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
              <Button key={item.id} className='home-item-row surface-card tap tap-row' hoverClass='tap--pressed' onClick={() => navigate(`/pages/inventory-detail/index?id=${item.id}`)}>
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
                  <AppIcon icon={ChevronRight} size={16} color={palette.subtleForeground} />
                </View>
              </Button>
            ))}

            {attentionItems.length > 3 && (
              <Button className='home-more-link tap' hoverClass='tap--pressed' onClick={() => navigate('/pages/inventory/index')}>
                <Text>查看其余 {attentionItems.length - 3} 个待处理物品</Text>
                <AppIcon icon={ChevronRight} size={15} color={palette.primary} />
              </Button>
            )}
          </View>
        )}
      </View>

      {familyGate}
    </PageShell>
  )
}
