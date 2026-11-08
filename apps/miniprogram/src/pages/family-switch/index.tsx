import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ChevronRight, Plus } from 'lucide'
import { useCallback, useEffect, useRef, useState } from 'react'
import { listMyFamilies, switchActiveFamily, type MyFamily } from '../../api'
import { hasFamily, onIdentityChanged } from '../../api/token'
import { family as familyArtwork } from '../../assets/images/final'
import { AppIcon } from '../../components/app-icon'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { useFamilyGate } from '../../hooks/use-family-gate'
import { useRefreshStore } from '../../store'
import { palette } from '../../theme/palette'
import './index.scss'

export default function FamilySwitchPage() {
  const refresh = useRefreshStore()
  const { openFamilySetup, familyGate } = useFamilyGate()
  const [families, setFamilies] = useState<MyFamily[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [switching, setSwitching] = useState(false)
  const switchLock = useRef(false)
  const loadVersion = useRef(0)

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    if (!hasFamily()) {
      setFamilies([])
      setLoading(false)
      setLoadError('')
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const result = await listMyFamilies()
      if (version === loadVersion.current) setFamilies(result ?? [])
    } catch (error) {
      if (version === loadVersion.current) setLoadError(error instanceof Error ? error.message : '家庭列表加载失败')
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }, [])
  useDidShow(() => { void load() })
  useEffect(() => onIdentityChanged(() => { setFamilies([]); void load() }), [load])
  useEffect(() => () => { loadVersion.current += 1 }, [])

  const handleSwitch = async (family: MyFamily) => {
    if (family.is_active || switchLock.current) return
    switchLock.current = true
    setSwitching(true)
    try {
      await switchActiveFamily(family.id)
      setFamilies((prev) => prev.map((item) => ({ ...item, is_active: item.id === family.id })))
      await refresh()
      Taro.showToast({ title: `已切换到「${family.name}」`, icon: 'none' })
    } catch (error: any) {
      Taro.showToast({ title: error?.message || '切换失败', icon: 'none' })
    } finally {
      await load()
      switchLock.current = false
      setSwitching(false)
    }
  }

  return (
    <PageShell className='family-switch-page' tabPage={false} allowNoFamily>
      <PageHeader title='我的家庭' subtitle='切换当前使用的家庭' />
      {(loading || loadError) && <View className='page-remote-status'><Text>{loading ? '正在加载家庭列表…' : loadError}</Text>{!loading && <Button className='page-remote-retry tap' onClick={() => { void load() }}>重试</Button>}</View>}
      {!loading && !loadError && families.length === 0 && <View className='empty-state surface-card'><Text className='empty-state__title'>还没有可切换的家庭</Text><Text className='empty-state__copy'>创建家庭，或使用家人的邀请码加入。</Text></View>}
      {families.length > 0 && <View className='family-switch-list surface-card'>
        {families.map((family) => (
          <Button key={family.id} className='family-switch-row tap tap-row' hoverClass='tap--pressed' disabled={switching} onClick={() => handleSwitch(family)}>
            <Image className='family-switch-row__art' src={familyArtwork} mode='aspectFit' />
            <Text className='family-switch-row__name'>{family.name}</Text>
            {family.is_active
              ? <Text className='family-switch-row__current'>当前使用</Text>
              : <Text className='family-switch-row__action'>切换</Text>}
          </Button>
        ))}
      </View>}
      <Button className='family-switch-add tap tap-row' hoverClass='tap--pressed' onClick={() => openFamilySetup('创建一个家庭，或输入邀请码加入家人的家庭。')}>
        <View className='family-switch-add__icon'><AppIcon icon={Plus} size={16} color={palette.primary} /></View>
        <View className='family-switch-add__body'>
          <Text className='family-switch-add__title'>添加家庭</Text>
          <Text className='family-switch-add__hint'>创建家庭，或用邀请码加入</Text>
        </View>
        <AppIcon icon={ChevronRight} size={16} color={palette.disabledForeground} />
      </Button>
      {familyGate}
    </PageShell>
  )
}
