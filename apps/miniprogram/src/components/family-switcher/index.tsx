import { family as familyArtwork } from '../../assets/images/final'
import { Button, Image, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Plus } from 'lucide'
import { useCallback, useEffect, useState } from 'react'

import { listMyFamilies, switchActiveFamily, type MyFamily } from '../../api'
import { hasFamily } from '../../api/token'
import { useRefreshStore } from '../../store'
import { AppIcon } from '../app-icon'

interface FamilySwitcherProps {
  /** Opens the create-family flow (family-setup sheet in create mode). */
  onCreateNew: () => void
}

/**
 * Lists the families the user belongs to and lets them switch the active one.
 * A user can be in multiple families now; each family's data stays isolated,
 * so switching just changes which family's data the app shows.
 */
export function FamilySwitcher({ onCreateNew }: FamilySwitcherProps) {
  const refresh = useRefreshStore()
  const [families, setFamilies] = useState<MyFamily[]>([])
  const [switching, setSwitching] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(async () => {
    if (!hasFamily()) {
      setFamilies([])
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      setFamilies(await listMyFamilies())
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '家庭列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(() => { void load() })
  // The home switcher mounts inside a sheet after the page's didShow event.
  useEffect(() => { void load() }, [load])

  const handleSwitch = async (family: MyFamily) => {
    if (family.is_active || switching) return
    setSwitching(true)
    try {
      await switchActiveFamily(family.id)
      await refresh()
      setFamilies((prev) => prev.map((f) => ({ ...f, is_active: f.id === family.id })))
      Taro.showToast({ title: `已切换到「${family.name}」`, icon: 'none' })
    } catch (error: any) {
      Taro.showToast({ title: error.message || '切换失败', icon: 'none' })
    } finally {
      setSwitching(false)
    }
  }

  if (!hasFamily()) return null

  return (
    <View className='section'>
      <View className='section__head'>
        <Text className='section__title'>我的家庭</Text>
        <Text className='section__meta'>{families.length} 个</Text>
      </View>
      {(loading || loadError) && <View className='page-remote-status'><Text>{loading ? '正在加载家庭列表…' : loadError}</Text>{!loading && <Button className='page-remote-retry tap' onClick={() => { void load() }}>重试</Button>}</View>}
      <ScrollView className='profile-menu family-tiles surface-card' scrollX enableFlex><View className='family-tiles__track'>
        {families.map((family) => (
          <Button
            key={family.id}
            className={`family-tile tap ${family.is_active ? 'family-tile--active' : ''}`}
            hoverClass='tap--pressed'
            disabled={switching}
            onClick={() => handleSwitch(family)}
          >
            <Image className='family-tile__art' src={familyArtwork} mode='aspectFit' />
            <Text className='profile-menu__label'>{family.name}</Text>
            {family.is_active
              ? <Text className='family-tile__current'>当前家庭 ✓</Text>
              : <Text className='profile-menu__value'>切换</Text>}
          </Button>
        ))}
        <Button
          className='family-tile family-tile--new tap'
          hoverClass='tap--pressed'
          onClick={onCreateNew}
        >
          <View className='family-tile__plus'>
            <AppIcon icon={Plus} size={18} color='#ffffff' />
          </View>
          <Text className='family-tile__new-label'>添加家庭</Text>
        </Button>
      </View></ScrollView>
    </View>
  )
}
