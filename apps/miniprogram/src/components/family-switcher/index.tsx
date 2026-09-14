import { Button, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Check, ChevronRight, Home, Plus } from 'lucide'
import { useCallback, useState } from 'react'

import { listMyFamilies, switchActiveFamily, type MyFamily } from '../../api'
import { hasFamily } from '../../api/token'
import { useRefreshStore } from '../../store'
import { palette } from '../../theme/palette'
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

  const load = useCallback(async () => {
    if (!hasFamily()) {
      setFamilies([])
      return
    }
    try {
      setFamilies(await listMyFamilies())
    } catch {
      // Keep whatever was shown; the next open retries.
    }
  }, [])

  useDidShow(() => { void load() })

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

  if (families.length === 0) return null

  return (
    <View className='section'>
      <View className='section__head'>
        <Text className='section__title'>我的家庭</Text>
        <Text className='section__meta'>{families.length} 个</Text>
      </View>
      <View className='profile-menu surface-card'>
        {families.map((family) => (
          <Button
            key={family.id}
            className='profile-menu__item tap tap-row'
            hoverClass='tap--pressed'
            disabled={switching}
            onClick={() => handleSwitch(family)}
          >
            <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
              <AppIcon icon={Home} size={15} color={palette.primary} />
            </View>
            <Text className='profile-menu__label'>{family.name}</Text>
            {family.is_active
              ? <AppIcon icon={Check} size={16} color={palette.primary} />
              : <Text className='profile-menu__value'>切换</Text>}
          </Button>
        ))}
        <Button
          className='profile-menu__item tap tap-row'
          hoverClass='tap--pressed'
          onClick={onCreateNew}
        >
          <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
            <AppIcon icon={Plus} size={15} color={palette.primary} />
          </View>
          <Text className='profile-menu__label'>创建新家庭</Text>
          <AppIcon icon={ChevronRight} size={16} color={palette.disabledForeground} />
        </Button>
      </View>
    </View>
  )
}
