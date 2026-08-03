import { Button, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { CalendarClock, ChevronDown, PackagePlus, ReceiptText, Utensils } from 'lucide'
import { useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { inventoryItems, overview, pendingMealOrder } from '../../mocks/household'
import { palette } from '../../theme/palette'
import { formatYuan } from '../../utils/money'

import './index.scss'

const attentionItems = inventoryItems.filter(
  (item) => item.status === 'expiring' || item.status === 'expired'
)

const quickActions = [
  { key: 'ledger', label: '记一笔', icon: ReceiptText, url: '/pages/ledger/index' },
  { key: 'meals', label: '点菜', icon: Utensils, url: '/pages/meals/index' },
  { key: 'inventory', label: '加物品', icon: PackagePlus, url: '/pages/inventory/index' }
] as const

type Period = 'month' | '3months' | '6months' | '1year' | 'custom'
const periodOptions: Array<{ key: Period; label: string }> = [
  { key: 'month', label: '本月' },
  { key: '3months', label: '近 3 月' },
  { key: '6months', label: '近半年' },
  { key: '1year', label: '近一年' },
  { key: 'custom', label: '自定义' }
]

function getSummary(period: Period) {
  const multiplier = period === 'month' ? 1 : period === '3months' ? 3 : period === '6months' ? 6 : 12
  return {
    incomeCents: overview.monthIncomeCents * multiplier,
    expenseCents: overview.monthExpenseCents * multiplier,
    balanceCents: overview.monthBalanceCents * multiplier
  }
}

export default function HomePage() {
  const switchTab = (url: string) => Taro.switchTab({ url })
  const [period, setPeriod] = useState<Period>('month')
  const [showPeriodMenu, setShowPeriodMenu] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [showCustomPicker, setShowCustomPicker] = useState(false)

  const summary = getSummary(period)
  const currentLabel = period === 'custom' && customStart && customEnd
    ? `${customStart.slice(5)} ~ ${customEnd.slice(5)}`
    : periodOptions.find((o) => o.key === period)?.label ?? '本月'
  const hasPendingOrder = pendingMealOrder.status === 'pending'

  return (
    <View className='page-shell'>
      {/* 标题 */}
      <View className='page-title'>
        <Text className='page-title__text'>我们家</Text>
      </View>

      {/* 收支概览 — 时间段下拉在框内右上角 */}
      <View className='home-summary'>
        <View className='home-summary__period'>
          <Button
            className='period-trigger tap'
            hoverClass='tap--pressed'
            onClick={() => setShowPeriodMenu(!showPeriodMenu)}
          >
            <Text>{currentLabel}</Text>
            <AppIcon icon={ChevronDown} size={14} color={palette.foreground} />
          </Button>
          {showPeriodMenu && (
            <View className='period-menu'>
              {periodOptions.map((option) => (
                <Button
                  key={option.key}
                  className={`period-option tap ${period === option.key ? 'period-option--active' : ''}`}
                  hoverClass='tap--pressed'
                  onClick={() => {
                    if (option.key === 'custom') {
                      setShowPeriodMenu(false)
                      setShowCustomPicker(true)
                    } else {
                      setPeriod(option.key)
                      setShowPeriodMenu(false)
                    }
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </View>
          )}
        </View>
        <View className='home-summary__row'>
          <View className='home-summary__item'>
            <Text className='home-summary__label'>收入</Text>
            <Text className='home-summary__value home-summary__value--income'>{formatYuan(summary.incomeCents)}</Text>
          </View>
          <View className='home-summary__item'>
            <Text className='home-summary__label'>支出</Text>
            <Text className='home-summary__value'>{formatYuan(summary.expenseCents)}</Text>
          </View>
          <View className='home-summary__item'>
            <Text className='home-summary__label'>结余</Text>
            <Text className='home-summary__value home-summary__value--balance'>{formatYuan(summary.balanceCents)}</Text>
          </View>
        </View>
      </View>

      {/* 快捷入口 */}
      <View className='quick-actions'>
        {quickActions.map((action) => (
          <Button
            key={action.key}
            className='quick-actions__item tap'
            hoverClass='tap--pressed'
            aria-label={action.label}
            onClick={() => switchTab(action.url)}
          >
            <View className='quick-actions__icon'>
              <AppIcon icon={action.icon} size={20} color={palette.primary} />
            </View>
            <Text>{action.label}</Text>
          </Button>
        ))}
      </View>

      {/* 点餐待处理 */}
      {hasPendingOrder && (
        <View className='section'>
          <View className='section__head'>
            <Text className='section__title'>点餐待处理</Text>
          </View>
          <View className='pending-grid'>
            <View
              className='pending-item tap'
              hoverClass='tap--pressed'
              onClick={() => switchTab('/pages/meals/index')}
            >
              <View className='pending-item__icon pending-item__icon--primary'>
                <AppIcon icon={Utensils} size={22} color={palette.primary} />
              </View>
              <Text className='pending-item__title'>点餐单</Text>
              <Text className='pending-item__meta'>{pendingMealOrder.items.length} 道菜待完成</Text>
            </View>
          </View>
        </View>
      )}

      {/* 物品待处理 */}
      {attentionItems.length > 0 && (
        <View className='section'>
          <View className='section__head'>
            <Text className='section__title'>物品待处理</Text>
            <Text className='section__meta'>{attentionItems.length} 项</Text>
          </View>
          <View className='pending-grid'>
            {attentionItems.map((item) => (
              <View
                key={item.id}
                className='pending-item tap'
                hoverClass='tap--pressed'
                aria-label={`${item.name}，${item.expiryLabel}`}
                onClick={() => switchTab('/pages/inventory/index')}
              >
                <View className={`pending-item__icon ${item.status === 'expired' ? 'pending-item__icon--red' : 'pending-item__icon--amber'}`}>
                  <AppIcon
                    icon={CalendarClock}
                    size={22}
                    color={item.status === 'expired' ? palette.destructive : palette.warning}
                  />
                </View>
                <Text className='pending-item__title'>{item.name}</Text>
                <Text className='pending-item__meta'>{item.expiryLabel}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 自定义时间段选择 */}
      {showCustomPicker && (
        <View className='form-overlay' onClick={() => setShowCustomPicker(false)}>
          <View className='form-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='form-sheet__title'>自定义时间段</Text>
            <Picker mode='date' value={customStart} onChange={(e) => setCustomStart(e.detail.value)}>
              <View className='form-input form-input--picker'>
                <Text>{customStart ? `开始：${customStart}` : '选择开始日期'}</Text>
              </View>
            </Picker>
            <Picker mode='date' value={customEnd} onChange={(e) => setCustomEnd(e.detail.value)}>
              <View className='form-input form-input--picker'>
                <Text>{customEnd ? `结束：${customEnd}` : '选择结束日期'}</Text>
              </View>
            </Picker>
            <Button
              className='button button--primary tap form-submit'
              hoverClass='tap--pressed'
              onClick={() => {
                if (customStart && customEnd) {
                  setPeriod('custom')
                  setShowCustomPicker(false)
                } else {
                  Taro.showToast({ title: '请选择开始和结束日期', icon: 'none' })
                }
              }}
            >
              确认
            </Button>
          </View>
        </View>
      )}
    </View>
  )
}
