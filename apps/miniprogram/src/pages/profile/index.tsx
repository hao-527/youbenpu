import { Button, Switch, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Bell, ChevronRight, LogOut, MapPin, Tags, Users, Utensils } from 'lucide'
import { useState } from 'react'

import { createInvitation, leaveFamily } from '../../api'
import { clearToken, clearUserInfo } from '../../api/token'
import { ActionSheet } from '../../components/action-sheet'
import { AppIcon } from '../../components/app-icon'
import { PageShell } from '../../components/page-shell'
import { useDispatch, useStore } from '../../store'
import { palette } from '../../theme/palette'

import './index.scss'

export default function ProfilePage() {
  const { familyName, members, settings, currentMemberId } = useStore()
  const dispatch = useDispatch()
  const currentMember = members.find((m) => m.id === currentMemberId) ?? members[0]
  const isAdmin = currentMember?.roleLabel === '家庭管理员'

  const [showInvite, setShowInvite] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteExpires, setInviteExpires] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  const generateInvite = async () => {
    setInviteLoading(true)
    try {
      const result = await createInvitation()
      setInviteCode(result.code)
      setInviteExpires(result.expires_at)
      setShowInvite(true)
    } catch (error: any) {
      Taro.showToast({ title: error.message || '生成邀请码失败', icon: 'none' })
    } finally {
      setInviteLoading(false)
    }
  }

  const copyCode = () => {
    Taro.setClipboardData({ data: inviteCode })
    Taro.showToast({ title: '已复制', icon: 'success' })
  }

  const handleLeaveFamily = () => {
    const memberCount = members.length
    const isLastOwner = isAdmin && members.filter((m) => m.roleLabel === '家庭管理员').length <= 1

    if (isLastOwner && memberCount > 1) {
      Taro.showToast({ title: '你是唯一管理员，请先转交管理员', icon: 'none', duration: 3000 })
      return
    }

    let content = '退出后将无法查看当前家庭的数据。'
    if (isLastOwner && memberCount === 1) {
      content = '你是最后一位成员，退出后家庭将被解散，所有数据将被删除。'
    }

    Taro.showModal({
      title: '退出家庭',
      content,
      confirmText: '退出',
      confirmColor: palette.destructive
    }).then(async (result) => {
      if (!result.confirm) return
      try {
        await leaveFamily()
        clearToken()
        clearUserInfo()
        Taro.showToast({ title: '已退出', icon: 'success' })
        setTimeout(() => Taro.redirectTo({ url: '/pages/auth/index' }), 500)
      } catch (error: any) {
        Taro.showToast({ title: error.message || '退出失败', icon: 'none' })
      }
    })
  }

  return (
    <PageShell>
      {/* ---------- 顶部身份区：紧凑，可点击 ---------- */}
      <Button
        className='profile-header tap tap-row'
        hoverClass='tap--pressed'
        onClick={() => Taro.navigateTo({ url: '/pages/family-manage/index' })}
      >
        <View className='profile-header__avatar'>
          {currentMember?.avatarText || '我'}
        </View>
        <View className='profile-header__body'>
          <Text className='profile-header__name'>
            {currentMember?.displayName || '用户'}
          </Text>
          <Text className='profile-header__meta'>
            {familyName} · {currentMember?.roleLabel || '成员'}
          </Text>
        </View>
        <AppIcon icon={ChevronRight} size={18} color={palette.disabledForeground} />
      </Button>

      {/* ---------- 功能入口 ---------- */}
      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>管理</Text>
        </View>
        <View className='profile-menu surface-card'>
          <Button
            className='profile-menu__item tap tap-row'
            hoverClass='tap--pressed'
            onClick={() => Taro.navigateTo({ url: '/pages/family-manage/index' })}
          >
            <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
              <AppIcon icon={Users} size={15} color={palette.primary} />
            </View>
            <Text className='profile-menu__label'>家庭成员</Text>
            <Text className='profile-menu__value'>{members.length} 人</Text>
            <AppIcon icon={ChevronRight} size={16} color={palette.disabledForeground} />
          </Button>

          {isAdmin && (
            <Button
              className='profile-menu__item tap tap-row'
              hoverClass='tap--pressed'
              disabled={inviteLoading}
              onClick={generateInvite}
            >
              <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
                <AppIcon icon={Users} size={15} color={palette.primary} />
              </View>
              <Text className='profile-menu__label'>
                {inviteLoading ? '生成中...' : '邀请新成员'}
              </Text>
              <AppIcon icon={ChevronRight} size={16} color={palette.disabledForeground} />
            </Button>
          )}

          <Button
            className='profile-menu__item tap tap-row'
            hoverClass='tap--pressed'
            onClick={() => Taro.navigateTo({ url: '/pages/family-manage/index?section=locations' })}
          >
            <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
              <AppIcon icon={MapPin} size={15} color={palette.primary} />
            </View>
            <Text className='profile-menu__label'>家中常用存放位置</Text>
            <AppIcon icon={ChevronRight} size={16} color={palette.disabledForeground} />
          </Button>

          <Button
            className='profile-menu__item tap tap-row'
            hoverClass='tap--pressed'
            onClick={() => Taro.navigateTo({ url: '/pages/dish-manage/index' })}
          >
            <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
              <AppIcon icon={Tags} size={15} color={palette.primary} />
            </View>
            <Text className='profile-menu__label'>菜品管理</Text>
            <AppIcon icon={ChevronRight} size={16} color={palette.disabledForeground} />
          </Button>
        </View>
      </View>

      {/* ---------- 提醒设置 ---------- */}
      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>提醒</Text>
        </View>
        <View className='profile-menu surface-card'>
          <View className='profile-menu__item'>
            <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
              <AppIcon icon={Bell} size={15} color={palette.primary} />
            </View>
            <Text className='profile-menu__label'>物品到期提醒</Text>
            <Switch
              checked={settings.expiryReminder}
              color={palette.primary}
              aria-label='物品到期提醒'
              onChange={() => dispatch({ type: 'settings/toggleExpiryReminder' })}
            />
          </View>
          <View className='profile-menu__item'>
            <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
              <AppIcon icon={Utensils} size={15} color={palette.primary} />
            </View>
            <Text className='profile-menu__label'>点餐状态提醒</Text>
            <Switch
              checked={settings.mealReminder}
              color={palette.primary}
              aria-label='点餐状态提醒'
              onChange={() => dispatch({ type: 'settings/toggleMealReminder' })}
            />
          </View>
        </View>
      </View>

      {/* ---------- 底部操作 ---------- */}
      <View className='section'>
        <Button
          className='profile-leave-btn tap'
          hoverClass='tap--pressed'
          onClick={handleLeaveFamily}
        >
          <AppIcon icon={LogOut} size={15} color={palette.destructive} />
          <Text>退出家庭</Text>
        </Button>
      </View>

      <Text className='profile-footer'>生活有本谱 v1.0.0</Text>

      {/* ---------- 邀请码弹窗 ---------- */}
      <ActionSheet open={showInvite} title='邀请成员' onClose={() => setShowInvite(false)}>
        <View className='profile-invite-sheet'>
          <Text className='profile-invite-sheet__hint'>
            将邀请码发给家人，对方在小程序中输入即可加入：
          </Text>
          <View className='profile-invite-sheet__code-box'>
            <Text className='profile-invite-sheet__code'>{inviteCode}</Text>
          </View>
          <Text className='profile-invite-sheet__expires'>24 小时有效，仅可使用一次</Text>
          <View className='profile-invite-sheet__actions'>
            <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={copyCode}>
              <Text>复制邀请码</Text>
            </Button>
          </View>
        </View>
      </ActionSheet>
    </PageShell>
  )
}
