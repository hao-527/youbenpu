import { useConfirm } from '../../components/feedback'
import { goBack } from '../../utils/navigation'
import { SafeImage as Image } from '../../components/safe-image'
import { chef_status } from '../../assets/images/final'
import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { CalendarClock, MapPin, Package, Pencil, RotateCcw, Tags, Trash2 } from 'lucide'

import { AppIcon } from '../../components/app-icon'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { StateText, type StateTone } from '../../components/state-text'
import { useAppShare } from '../../hooks/use-app-share'
import { useDispatch, useStore, useRemoteStatus } from '../../store'
import { palette } from '../../theme/palette'
import type { InventoryStatus } from '../../types/domain'
import { getInventoryExpiry } from '../../utils/date'

import './index.scss'

const statusTone: Record<InventoryStatus, StateTone> = {
  normal: 'ok', expiring: 'warn', expired: 'danger', finished: 'muted', discarded: 'muted', deleted: 'muted'
}

export default function InventoryDetailPage() {
  const { inventory } = useStore()
  const dispatch = useDispatch()
  const confirm = useConfirm()
  const remote = useRemoteStatus()
  // Registered before the early return so the hook order stays stable.
  useAppShare()
  const itemId = Taro.getCurrentInstance().router?.params?.id
  const storedItem = inventory.find((item) => item.id === itemId && item.status !== 'deleted')

  if (!storedItem) {
    return (
      <PageShell className='inventory-detail-page' tabPage={false}>
        <PageHeader title='物品详情' />
        <View className='empty-state surface-card'>
          <View className='empty-state__icon'>
            <AppIcon icon={Package} size={32} color={palette.subtleForeground} />
          </View>
          <Text className='empty-state__title'>{remote.loading ? '正在加载' : !remote.ready ? '请重试加载' : '物品不存在'}</Text>
          <Text className='empty-state__copy'>{remote.ready ? '这个物品可能已经被删除。' : '加载完成后即可查看物品详情。'}</Text>
        </View>
      </PageShell>
    )
  }

  const terminal = storedItem.status === 'finished' || storedItem.status === 'discarded'
  const expiry = getInventoryExpiry(storedItem.expiryDate)
  const item = terminal ? storedItem : { ...storedItem, status: expiry.status, expiryLabel: expiry.label }
  const statusLabel = item.status === 'finished' ? '已用完' : item.status === 'discarded' ? '已丢弃' : item.expiryLabel

  const markStatus = (status: Extract<InventoryStatus, 'finished' | 'discarded'>) => {
    const label = status === 'finished' ? '用完' : '丢弃'
    confirm({
      title: `确认标记为${label}？`,
      content: '物品会从找物品中移除，可在物品管理中恢复。',
      confirmText: label,
      danger: status === 'discarded'
    }).then(async (result) => {
      if (!result.confirmed) return
      const succeeded = await dispatch({ type: 'inventory/markStatus', id: item.id, status })
      if (!succeeded) return
      Taro.showToast({ title: `已标记为${label}`, icon: 'success' })
      setTimeout(() => goBack('/pages/inventory/index'), 350)
    })
  }

  const restore = async () => {
    const succeeded = await dispatch({ type: 'inventory/markStatus', id: item.id, status: expiry.status })
    if (!succeeded) return
    Taro.showToast({ title: '物品已恢复', icon: 'success' })
    setTimeout(() => goBack('/pages/inventory/index'), 350)
  }

  const deleteItem = () => {
    if (!terminal) return
    confirm({
      title: `永久删除“${item.name}”？`,
      content: '删除后无法恢复。若只是暂时不用，建议标记为用完或丢弃。',
      confirmText: '永久删除',
      danger: true
    }).then(async (result) => {
      if (!result.confirmed) return
      const succeeded = await dispatch({ type: 'inventory/permanentDelete', id: item.id })
      if (!succeeded) return
      Taro.showToast({ title: '物品已删除', icon: 'success' })
      setTimeout(() => goBack('/pages/inventory/index'), 350)
    })
  }

  return (
    <PageShell className='inventory-detail-page' tabPage={false}>
      <PageHeader title='物品详情' subtitle={item.name} />

      <View className='inventory-detail-hero surface-card'>
        {item.photo ? (
          <Image className='inventory-detail-hero__photo' src={item.photo} mode='aspectFit' />
        ) : (
          <View className='inventory-detail-hero__photo inventory-detail-hero__placeholder'>
            <AppIcon icon={Package} size={32} color={palette.subtleForeground} />
            <Text className='inventory-detail-hero__photo-hint'>未添加照片</Text>
          </View>
        )}
        <View className='inventory-detail-hero__copy'>
          <Text className='inventory-detail-hero__name'>{item.name}</Text>
          <StateText label={statusLabel} tone={statusTone[item.status]} />
        </View>
      </View>

      <View className='inventory-detail-info surface-card'>
        <View className='inventory-detail-info__row'>
          <View className='icon-bubble icon-bubble--sm icon-bubble--primary'>
            <AppIcon icon={Tags} size={18} color={palette.primary} />
          </View>
          <Text className='inventory-detail-info__label'>分类</Text>
          <Text className='inventory-detail-info__value'>{item.category}</Text>
        </View>
        <View className='inventory-detail-info__row'>
          <View className='icon-bubble icon-bubble--sm icon-bubble--primary'>
            <AppIcon icon={MapPin} size={18} color={palette.primary} />
          </View>
          <Text className='inventory-detail-info__label'>存放位置</Text>
          <Text className='inventory-detail-info__value'>{item.location}</Text>
        </View>
        <View className='inventory-detail-info__row'>
          <View className='icon-bubble icon-bubble--sm icon-bubble--primary'>
            <AppIcon icon={Package} size={18} color={palette.primary} />
          </View>
          <Text className='inventory-detail-info__label'>当前数量</Text>
          <Text className='inventory-detail-info__value'>{item.quantityLabel}</Text>
        </View>
        <View className='inventory-detail-info__row'>
          <View className='icon-bubble icon-bubble--sm icon-bubble--primary'>
            <AppIcon icon={CalendarClock} size={18} color={palette.primary} />
          </View>
          <Text className='inventory-detail-info__label'>到期日期</Text>
          <Text className={`inventory-detail-info__value ${item.expiryDate ? 'num' : 'inventory-detail-info__value--empty'}`}>{item.expiryDate || '无需提醒'}</Text>
        </View>
      </View>

      <View className='inventory-status-banner'><View><Text>{terminal ? statusLabel : '正在使用'}</Text><Text>{terminal ? '可在物品管理中恢复。' : item.expiryDate ? '记得尽快用，避免过期浪费。' : '妥善存放，按需使用。'}</Text></View><Image src={chef_status} mode='aspectFit' /></View>
      <View className='inventory-detail-actions'>
        {terminal ? (
          <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={restore}>
            <AppIcon icon={RotateCcw} size={18} color={palette.onPrimary} />
            <Text>恢复到当前物品</Text>
          </Button>
        ) : (
          <>
            <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: `/pages/inventory-form/index?id=${item.id}` })}>
              <AppIcon icon={Pencil} size={18} color={palette.onPrimary} />
              <Text>编辑物品</Text>
            </Button>
            <View className='inventory-detail-actions__secondary'>
              <Button className='button button--outline tap' hoverClass='tap--pressed' onClick={() => markStatus('finished')}>标记用完</Button>
              <Button className='button button--outline tap' hoverClass='tap--pressed' onClick={() => markStatus('discarded')}>标记丢弃</Button>
            </View>
          </>
        )}
      </View>

      {terminal ? (      <Button className='danger-action inventory-detail-delete tap' hoverClass='tap--pressed' onClick={deleteItem}>
        <AppIcon icon={Trash2} size={17} color={palette.destructive} />
        <Text>永久删除物品</Text>
      </Button>) : <Button className='danger-action inventory-detail-delete tap' onClick={() => { confirm({ title: '移入垃圾桶？', content: '可在物品管理中恢复，或永久删除。', danger: true }).then(async result => { if (result.confirmed && await dispatch({ type: 'inventory/delete', id: item.id })) goBack('/pages/inventory/index') }) }}>移入垃圾桶</Button>}
      <Text className='field__hint'>移入垃圾桶可恢复；永久删除仅适用于已结束的物品。</Text>
    </PageShell>
  )
}
