import { Button, Switch, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Bell, Copy, Home, LogOut, QrCode, ShieldCheck, Utensils } from 'lucide'
import { useState } from 'react'

import { createInvitation, leaveFamily } from '../../api'
import { clearToken, clearUserInfo } from '../../api/token'
import { AppIcon } from '../../components/app-icon'
import { ActionSheet } from '../../components/action-sheet'
import { PageShell } from '../../components/page-shell'
import { useDispatch, useStore } from '../../store'
import { palette } from '../../theme/palette'

import './index.scss'

export default function ProfilePage() {
  const { familyName, members, settings, currentMemberId } = useStore()
  const dispatch = useDispatch()
  const currentMember = members.find((member) => member.id === currentMemberId) ?? members[0]
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
    Taro.showToast({ title: '已复制邀请码', icon: 'success' })
  }

  const shareQRCode = () => {
    // Generate miniprogram QR code for invitation
    // The scene will be parsed by auth page: invite=XXXXXX
    Taro.showToast({ title: '请将邀请码发给家人，或截图分享', icon: 'none', duration: 2500 })
  }

  const handleLeaveFamily = () => {
    const memberCount = members.length
    const isLastOwner = isAdmin && members.filter((m) => m.roleLabel === '家庭管理员').length <= 1

    let content = '退出后将无法查看当前家庭的数据。'
    if (isLastOwner && memberCount > 1) {
      Taro.showToast({ title: '你是唯一管理员，请先将管理员转交给其他成员', icon: 'none', duration: 3000 })
      return
    }
    if (isLastOwner && memberCount === 1) {
      content = '你是最后一位成员，退出后家庭将被解散，所有数据删除。'
    }

    Taro.showModal({
      title: '退出家庭？',
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
      <View className='page-title'>
        <View>
          <Text className='page-title__text'>我的</Text>
          <Text className='page-title__subtitle'>个人偏好与家庭管理</Text>
        </View>
      </View>

      <View className='profile-identity surface-card'>
        <View className='profile-identity__avatar'>{currentMember?.avatarText || '我'}</View>
        <View className='profile-identity__body'>
          <Text className='profile-identity__name'>{currentMember?.displayName || '当前用户'}</Text>
          <View className='profile-identity__role'>
            {isAdmin && <AppIcon icon={ShieldCheck} size={13} color={palette.primary} />}
            <Text>{currentMember?.roleLabel || '家庭成员'}</Text>
          </View>
        </View>
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>家庭</Text>
        </View>
        <Button className='profile-family-card surface-card tap tap-row' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/family-manage/index' })}>
          <View className='icon-bubble icon-bubble--primary'>
            <AppIcon icon={Home} size={20} color={palette.primary} />
          </View>
          <View className='profile-family-card__body'>
            <Text className='profile-family-card__name'>{familyName}</Text>
            <Text className='profile-family-card__meta'>{members.length} 位成员 · {isAdmin ? '可管理家庭' : '查看家庭信息'}</Text>
          </View>
        </Button>

        {isAdmin && (
          <View className='profile-invite-actions'>
            <Button className='content-action tap' hoverClass='tap--pressed' disabled={inviteLoading} onClick={generateInvite}>
              <AppIcon icon={QrCode} size={16} color={palette.primary} />
              <Text>{inviteLoading ? '生成中...' : '邀请成员'}</Text>
            </Button>
          </View>
        )}
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>提醒</Text>
        </View>
        <View className='profile-settings surface-card'>
          <View className='profile-setting-row'>
            <View className='icon-bubble icon-bubble--sm icon-bubble--primary'>
              <AppIcon icon={Bell} size={16} color={palette.primary} />
            </View>
            <View className='profile-setting-row__body'>
              <Text className='profile-setting-row__title'>物品到期提醒</Text>
              <Text className='profile-setting-row__meta'>临近和已过期物品会进入首页待办</Text>
            </View>
            <Switch checked={settings.expiryReminder} color={palette.primary} aria-label='物品到期提醒' onChange={() => dispatch({ type: 'settings/toggleExpiryReminder' })} />
          </View>
          <View className='profile-setting-row'>
            <View className='icon-bubble icon-bubble--sm icon-bubble--primary'>
              <AppIcon icon={Utensils} size={16} color={palette.primary} />
            </View>
            <View className='profile-setting-row__body'>
              <Text className='profile-setting-row__title'>点餐状态提醒</Text>
              <Text className='profile-setting-row__meta'>点餐单状态变化时接收提醒</Text>
            </View>
            <Switch checked={settings.mealReminder} color={palette.primary} aria-label='点餐状态提醒' onChange={() => dispatch({ type: 'settings/toggleMealReminder' })} />
          </View>
        </View>
      </View>

      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>账户</Text>
        </View>
        <View className='profile-account-actions'>
          <Button className='profile-danger-btn tap' hoverClass='tap--pressed' onClick={handleLeaveFamily}>
            <AppIcon icon={LogOut} size={16} color={palette.destructive} />
            <Text>退出当前家庭</Text>
          </Button>
        </View>
        <Text className='profile-version'>生活有本谱 v1.0.0</Text>
      </View>

      {/* Invite code sheet */}
      <ActionSheet open={showInvite} title='邀请成员' onClose={() => setShowInvite(false)}>
        <View className='profile-invite-sheet'>
          <Text className='profile-invite-sheet__hint'>将以下邀请码发给家人，对方在小程序中输入即可加入：</Text>
          <View className='profile-invite-sheet__code-box'>
            <Text className='profile-invite-sheet__code'>{inviteCode}</Text>
          </View>
          <Text className='profile-invite-sheet__expires'>有效期 24 小时，仅可使用一次</Text>
          <View className='profile-invite-sheet__actions'>
            <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={copyCode}>
              <AppIcon icon={Copy} size={16} color={palette.onPrimary} />
              <Text>复制邀请码</Text>
            </Button>
          </View>
        </View>
      </ActionSheet>
    </PageShell>
  )
}
