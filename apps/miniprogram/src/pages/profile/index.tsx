import { Button, Switch, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Bell, ChevronRight, Home, ShieldCheck, UserRound } from 'lucide'

import { AppIcon } from '../../components/app-icon'
import { PageShell } from '../../components/page-shell'
import { useDispatch, useStore } from '../../store'
import { palette } from '../../theme/palette'

import './index.scss'

export default function ProfilePage() {
  const { familyName, members, settings, currentMemberId } = useStore()
  const dispatch = useDispatch()
  const currentMember = members.find((member) => member.id === currentMemberId) ?? members[0]
  const isAdmin = currentMember?.roleLabel === '家庭管理员'

  return (
    <PageShell>
      <View className='page-title'>
        <View>
          <Text className='page-title__text'>我的</Text>
          <Text className='profile-page-subtitle'>个人偏好与家庭入口</Text>
        </View>
      </View>

      <View className='profile-identity surface-card'>
        <View className='profile-identity__avatar'>{currentMember?.avatarText || '我'}</View>
        <View className='profile-identity__body'>
          <Text className='profile-identity__name'>{currentMember?.displayName || '当前用户'}</Text>
          <View className='profile-identity__role'>
            {isAdmin && <AppIcon icon={ShieldCheck} size={14} color={palette.primary} />}
            <Text>{currentMember?.roleLabel || '家庭成员'}</Text>
          </View>
        </View>
        <AppIcon icon={UserRound} size={22} color={palette.subtleForeground} />
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>家庭</Text>
        </View>
        <Button className='profile-family-card surface-card tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/family-manage/index' })}>
          <View className='profile-family-card__icon'>
            <AppIcon icon={Home} size={21} color={palette.primary} />
          </View>
          <View className='profile-family-card__body'>
            <Text className='profile-family-card__name'>{familyName}</Text>
            <Text className='profile-family-card__meta'>{members.length} 位成员 · {isAdmin ? '可管理家庭' : '查看家庭信息'}</Text>
          </View>
          <AppIcon icon={ChevronRight} size={18} color={palette.subtleForeground} />
        </Button>
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>提醒</Text>
        </View>
        <View className='profile-settings surface-card'>
          <View className='profile-setting-row'>
            <View className='profile-setting-row__icon'><AppIcon icon={Bell} size={18} color={palette.primary} /></View>
            <View className='profile-setting-row__body'>
              <Text className='profile-setting-row__title'>物品到期提醒</Text>
              <Text className='profile-setting-row__meta'>临近和已过期物品会进入首页待办</Text>
            </View>
            <Switch checked={settings.expiryReminder} color={palette.primary} aria-label='物品到期提醒' onChange={() => dispatch({ type: 'settings/toggleExpiryReminder' })} />
          </View>
          <View className='profile-setting-row'>
            <View className='profile-setting-row__icon'><AppIcon icon={Bell} size={18} color={palette.primary} /></View>
            <View className='profile-setting-row__body'>
              <Text className='profile-setting-row__title'>点餐状态提醒</Text>
              <Text className='profile-setting-row__meta'>点餐单状态变化时接收提醒</Text>
            </View>
            <Switch checked={settings.mealReminder} color={palette.primary} aria-label='点餐状态提醒' onChange={() => dispatch({ type: 'settings/toggleMealReminder' })} />
          </View>
        </View>
      </View>

      <View className='profile-account'>
        <Text className='profile-account__title'>账户</Text>
        <Button className='profile-account__item' disabled aria-disabled='true'>退出当前家庭</Button>
        <Button className='profile-account__item profile-account__item--danger' disabled aria-disabled='true'>注销个人账户</Button>
        <Text className='profile-account__hint'>接入账户服务并完成身份校验后开放</Text>
      </View>
    </PageShell>
  )
}
