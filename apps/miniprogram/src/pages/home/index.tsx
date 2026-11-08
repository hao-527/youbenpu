import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { useMemo, useState } from 'react'
import { Bell } from 'lucide'
import { AppIcon } from '../../components/app-icon'

import { ensureLoggedIn } from '../../api'
import { getUserInfo } from '../../api/token'
import { ActionSheet } from '../../components/action-sheet'
import { FamilySwitcher } from '../../components/family-switcher'
import { Onboarding } from '../../components/onboarding'
import { PageShell } from '../../components/page-shell'
import { useAppShare } from '../../hooks/use-app-share'
import { useFamilyGate } from '../../hooks/use-family-gate'
import { useMaybeRefreshStore, useRefreshStore, useRemoteStatus, useStore } from '../../store'
import { formatLocalDate, getInventoryExpiry } from '../../utils/date'
import { summarizeLedger } from '../../utils/ledger-summary'
import { formatYuan } from '../../utils/money'
import { navigate } from '../../utils/navigation'

import family from '../../assets/images/home-final/family-slot.png'
import hero from '../../assets/images/home-final/hero-scene.png'
import balance from '../../assets/images/home-final/balance-slot.png'
import quickEntry from '../../assets/images/home-final/quick-entry-slot.png'
import quickImport from '../../assets/images/home-final/quick-import-slot.png'
import quickOrders from '../../assets/images/home-final/quick-orders-slot.png'
import quickInventory from '../../assets/images/home-final/quick-inventory-slot.png'
import meal from '../../assets/images/home-final/meal-slot.png'
import inventoryArt from '../../assets/images/home-final/inventory-slot.png'
import leaves from '../../assets/images/home-final/leaves.png'
import loop from '../../assets/images/home-final/loop.png'
import speech from '../../assets/images/home-final/speech.png'
import speechHeart from '../../assets/images/home-final/speech-heart.png'
import heart from '../../assets/images/home-final/heart.png'
import house from '../../assets/images/home-final/house.png'
import incomeDisc from '../../assets/images/home-final/income-disc.png'
import incomeArrow from '../../assets/images/home-final/income-arrow.png'
import expenseDisc from '../../assets/images/home-final/expense-disc.png'
import expenseArrow from '../../assets/images/home-final/expense-arrow.png'
import plus from '../../assets/images/home-final/plus.png'
import chevron from '../../assets/images/home-final/chevron.png'
import attention from '../../assets/images/home-final/attention.png'
import mealReminder from '../../assets/images/home-final/meal-reminder.png'
import inventoryReminder from '../../assets/images/home-final/inventory-reminder.png'
import { family_garden } from '../../assets/images/final'
import './index.scss'

/** Static decoration only; a failed image retains its slot without fake business content. */
function Artwork({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false)
  return failed
    ? <View className={`${className} home-art-failed`} aria-label='装饰图片加载失败' />
    : <Image className={className} src={src} mode='aspectFit' onError={() => setFailed(true)} />
}

const quickActions = [
  { key: 'entry', label: '记一笔', image: quickEntry, route: '/pages/ledger-entry/index' },
  { key: 'import', label: '导入账单', image: quickImport, route: '/pages/ledger-import/index' },
  { key: 'orders', label: '点餐记录', image: quickOrders, route: '/pages/meal-orders/index' },
  { key: 'inventory', label: '物品管理', image: quickInventory, route: '/pages/inventory-manage/index' },
  { key: 'family', label: '家庭管理', image: family, route: '/pages/family-manage/index' }
]

export default function HomePage() {
  const state = useStore()
  const { requireFamily, openFamilySetup, familyGate } = useFamilyGate()
  const remote = useRemoteStatus()
  const refresh = useRefreshStore()
  const maybeRefresh = useMaybeRefreshStore()
  const [familyOpen, setFamilyOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useAppShare()
  useDidShow(() => { setNow(new Date()); void maybeRefresh() })

  // Never display a previous family's cached arrays after switching identity.
  const activeFamily = getUserInfo()?.familyId
  const joined = Boolean(activeFamily && state.familyId === activeFamily)
  const ledger = joined ? state.ledger : []
  const pendingOrder = joined ? state.orders.find((order) => order.status === 'pending') : undefined
  const month = formatLocalDate(now).slice(0, 7)
  const previousMonth = formatLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7)
  const summary = summarizeLedger(ledger.filter((entry) => entry.date.startsWith(month)))
  const hasMonthRecords = ledger.some(entry => entry.date.startsWith(month))
  const previous = summarizeLedger(ledger.filter((entry) => entry.date.startsWith(previousMonth)))
  const difference = summary.balanceCents - previous.balanceCents
  const attentionItems = useMemo(() => joined && state.settings.expiryReminder ? state.inventory.flatMap((item) => {
    if (['finished', 'discarded', 'deleted'].includes(item.status)) return []
    const expiry = getInventoryExpiry(item.expiryDate, now)
    return expiry.status === 'normal' ? [] : [{ ...item, expiryLabel: expiry.label, days: expiry.days }]
  }).sort((a, b) => (a.days ?? 0) - (b.days ?? 0)) : [], [joined, state.inventory, state.settings.expiryReminder, now])
  const showMealReminder = Boolean(pendingOrder && state.settings.mealReminder)
  const hasReminders = showMealReminder || attentionItems.length > 0
  const usableData = joined && remote.ready
  const firstFamily = !activeFamily && !remote.loading && !remote.error
  const unavailable = !usableData && !firstFamily
  const openFeature = (url: string) => {
    if (requireFamily('先创建或加入家庭，才能和家人一起使用。')) navigate(url)
  }
  const retry = async () => {
    if (retrying || remote.loading) return
    setRetrying(true)
    try { await ensureLoggedIn(); await refresh() } catch { /* Store exposes the actual failure. */ }
    finally { setRetrying(false) }
  }
  const greeting = now.getHours() < 11 ? '早上好！' : now.getHours() < 18 ? '下午好！' : '晚上好！'
  const metrics = [
    { label: '收入', amount: summary.incomeCents, disc: expenseDisc, arrow: incomeArrow, key: 'income' },
    { label: '支出', amount: summary.expenseCents, disc: incomeDisc, arrow: expenseArrow, key: 'expense' }
  ]

  return (
    <PageShell className='home-page'>
      {!state.onboardingCompleted && <Onboarding />}
      <View className='home-brand-header'>
        <View className='home-brand-copy'>
          <View className='home-brand-line'><Text className='home-brand'>生活有本谱</Text><Artwork className='home-leaves' src={leaves} /></View>
          <Text className='home-tagline'>把日子，过成喜欢。</Text>
        </View>
        <Button className='home-family tap' onClick={() => activeFamily ? setFamilyOpen(true) : openFamilySetup()} aria-label='选择家庭'>
          <Artwork className='home-family-art' src={family} /><Text className='home-family-label'>{activeFamily ? joined ? state.familyName : '选择家庭' : '开启家庭'}</Text><Text className='home-family-chevron'>⌄</Text>
        </Button>
        <Button className='home-bell tap' aria-label='提醒设置' onClick={() => navigate('/pages/profile/index')}><AppIcon icon={Bell} size={22} color='#11110f' />{usableData && hasReminders && <View className='home-notification-dot' />}</Button>
      </View>
      <View className='home-hero'>
        <View className='home-hero-stage'><Artwork className='home-hero-scene' src={hero} /></View>
        <View className='home-greeting'><Text className='home-greeting-title'>{greeting}</Text><Text className='home-greeting-line'>和家人一起，把平凡的日子</Text><Text className='home-greeting-last'>过成喜欢的样子～</Text></View>
        <Artwork className='home-loop' src={loop} /><Artwork className='home-heart' src={heart} />
        <View className='home-speech'><Artwork className='home-speech-bg' src={speech} /><Text>谱仔{'\n'}和你一起{'\n'}打理家～</Text><Artwork className='home-speech-heart' src={speechHeart} /></View>
      </View>
      {usableData && (remote.loading || remote.error) && <View className='home-sync-note' role='status'>
        <Text>{remote.loading ? '正在刷新家庭数据…' : `${remote.error}，暂时显示上次加载的数据。`}</Text>
        {!remote.loading && <Button className='home-retry tap' disabled={retrying} onClick={retry}>重试</Button>}
      </View>}
      {!usableData && <View className={`home-start-card ${unavailable ? 'home-start-card--unavailable' : ''}`} role='status'>
        <View className='home-start-copy'>
          <Text className='home-start-kicker'>{remote.loading ? '正在连接你的家' : remote.error ? '连接暂时中断' : firstFamily ? '一家人的生活，从这里开始' : '正在切换家庭'}</Text>
          <Text className='home-start-title'>{remote.loading ? '稍等一下，马上就好' : remote.error ? '暂时没能加载你的家' : firstFamily ? '一起把日子过好' : '家庭数据还未就绪'}</Text>
          <Text className='home-start-description'>{remote.loading ? '正在获取家庭、账本和待办。' : remote.error ? remote.error : firstFamily ? '建一个家，和家人共享账本、菜单与物品。' : '刷新后查看当前家庭的记录。'}</Text>
        </View>
        <Artwork className='home-start-art' src={family_garden} />
        {firstFamily ? <>
          <View className='home-start-benefits'><Text>收支有数</Text><Text>吃饭有谱</Text><Text>物品有序</Text></View>
          <Button className='home-start-action tap' onClick={() => openFamilySetup()}>创建或加入家庭 <Text>→</Text></Button>
          <Text className='home-start-footnote'>已有家庭？用家人的邀请码加入</Text>
        </> : remote.loading ? <View className='home-start-skeleton'><View /><View /></View> : <Button className='home-start-action home-retry tap' loading={retrying} disabled={retrying} onClick={retry}>重新连接</Button>}
      </View>}
      {usableData && <View className={`home-ledger-card ${Math.max(formatYuan(summary.balanceCents).length, formatYuan(summary.incomeCents).length, formatYuan(summary.expenseCents).length) > 11 ? 'home-ledger-card--large' : ''}`}>
        <Artwork className='home-balance-art' src={balance} />
        <Button className='home-balance-link tap' onClick={() => openFeature('/pages/ledger/index')} aria-label='查看本月家庭账本'>
          <View className='home-balance-label'><Artwork className='home-house' src={house} /><Text>本月家庭结余</Text></View>
          <Text className={`home-balance num ${summary.balanceCents < 0 ? 'home-balance--negative' : ''}`}>{usableData ? formatYuan(summary.balanceCents) : '—'}</Text>
          <Text className='home-comparison'>{hasMonthRecords ? ledger.some(entry => entry.date.startsWith(previousMonth)) ? `比上月${difference >= 0 ? '多' : '少'}存了 ${formatYuan(Math.abs(difference))}` : `本月已记录 ${ledger.filter(entry => entry.date.startsWith(month)).length} 笔收支` : '本月还没有收支，记下生活的第一笔'}</Text>
        </Button>
        <View className='home-balance-actions'>
          {metrics.map((metric) => <Button key={metric.key} className={`home-metric home-metric--${metric.key} tap`} onClick={() => openFeature('/pages/ledger/index')}>
            <View className='home-metric-label'><View className='home-metric-icon'><Artwork className='home-metric-disc' src={metric.disc} /><Artwork className='home-metric-arrow' src={metric.arrow} /></View><Text>{metric.label}</Text></View>
            <Text className='home-metric-value num'>{usableData ? formatYuan(metric.amount) : '—'}</Text>
            <View className='home-progress'><View style={{ width: `${usableData && Math.max(summary.incomeCents, summary.expenseCents) > 0 ? metric.amount / Math.max(summary.incomeCents, summary.expenseCents) * 100 : 0}%` }} /></View>
          </Button>)}
          <Button className='home-record tap' onClick={() => openFeature('/pages/ledger-entry/index')}><Artwork className='home-plus' src={plus} /><Text>{hasMonthRecords ? '记一笔' : '开始记账'}</Text></Button>
        </View>
      </View>}
      {usableData && <View className='home-quick-actions'>{quickActions.map((action) => <Button key={action.key} className={`home-quick home-quick--${action.key} tap`} onClick={() => openFeature(action.route)}>
        <View className='home-quick-disc'><Artwork className='home-quick-art' src={action.image} /></View><Text>{action.label}</Text>
      </Button>)}</View>}
      <View className='home-feature-grid'>
        {[{ key: 'meal', title: '今天吃什么', copy: !usableData ? '和家人一起选菜单。' : state.dishes.length === 0 ? '先添几道拿手菜。' : '好好吃饭，就是幸福。', image: meal, route: pendingOrder ? '/pages/meal-orders/index' : '/pages/meal-create/index' }, { key: 'inventory', title: '家里有什么', copy: usableData && state.inventory.length === 0 ? '记下物品，少些浪费。' : '看得见，才不浪费。', image: inventoryArt, route: '/pages/inventory/index' }].map((feature) => <Button key={feature.key} className={`home-feature-card home-feature-card--${feature.key} tap`} onClick={() => openFeature(feature.route)}>
          <View className='home-feature-heading'><Text>{feature.title}</Text><Artwork className='home-chevron' src={chevron} /></View><Text className='home-feature-copy'>{feature.copy}</Text>
          <Artwork className='home-feature-art' src={feature.image} />
        </Button>)}
      </View>
      {usableData && <View className='home-attention-card'>
        <View className='home-attention-head'><Artwork className='home-attention-icon' src={attention} /><Text>今天要留意</Text><Button className='home-reminder-settings tap' onClick={() => navigate('/pages/profile/index')}>提醒设置</Button></View>
        {usableData && showMealReminder && pendingOrder && <Button className='home-reminder tap' onClick={() => openFeature('/pages/meal-orders/index')}>
          <View className='home-reminder-icon home-reminder-icon--meal'><Artwork className='home-reminder-art' src={mealReminder} /></View><View className='home-reminder-copy'><Text>家人点了 <Text className='home-highlight'>{pendingOrder.items.length}</Text> 道菜</Text><Text>{pendingOrder.requesterName} 发起，记得去看看～</Text></View><Text className='home-reminder-action home-reminder-action--meal'>去查看</Text>
        </Button>}
        {usableData && attentionItems.map((item) => <Button key={item.id} className='home-reminder tap' onClick={() => openFeature(`/pages/inventory-detail/index?id=${encodeURIComponent(item.id)}`)}>
          <View className='home-reminder-icon home-reminder-icon--inventory'><Artwork className='home-reminder-art' src={inventoryReminder} /></View><View className='home-reminder-copy'><Text>{item.name} <Text className='home-highlight'>{item.expiryLabel}</Text></Text><Text>{item.location} · {item.quantityLabel}</Text></View><Text className='home-reminder-action home-reminder-action--inventory'>去处理</Text>
        </Button>)}
        {!hasReminders && <View className='home-reminder-empty'>
          <View className='home-empty-check'>✓</View>
          <View><Text className='home-empty-title'>{!state.settings.mealReminder && !state.settings.expiryReminder ? '提醒已关闭' : '今天暂时没有待办'}</Text><Text className='home-empty-description'>{!state.settings.mealReminder && !state.settings.expiryReminder ? '可以在提醒设置里随时开启。' : state.inventory.length === 0 ? '记下物品的到期日，我们会在这里提醒你。' : '点餐与到期事项会显示在这里。'}</Text></View>
          {state.inventory.length === 0 && <Button className='home-empty-action tap' onClick={() => openFeature('/pages/inventory-form/index')}>去添加 →</Button>}
        </View>}
      </View>}
      <ActionSheet open={familyOpen} title='切换家庭' onClose={() => setFamilyOpen(false)}><FamilySwitcher onCreateNew={() => { setFamilyOpen(false); openFamilySetup() }} /></ActionSheet>
      {familyGate}
    </PageShell>
  )
}
