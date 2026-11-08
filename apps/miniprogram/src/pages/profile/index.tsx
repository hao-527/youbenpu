import { useConfirm } from '../../components/feedback'
import { SafeImage as Image } from '../../components/safe-image'
import { profile_garden, family_garden } from '../../assets/images/final'
import { BrandTitle } from '../../components/brand-title'
import { Button, Switch, Text, View } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { Bell, ChevronRight, Home, LogOut, MapPin, Share2, Tags, User, UserPlus, Users, Utensils } from 'lucide'
import { useRef, useState } from 'react'

import { createInvitation, ensureLoggedIn, leaveFamily } from '../../api'
import { clearSession, hasFamily } from '../../api/token'
import { AppIcon } from '../../components/app-icon'
import { PageShell } from '../../components/page-shell'
import { useAppShare } from '../../hooks/use-app-share'
import { useFamilyGate } from '../../hooks/use-family-gate'
import { useDispatch, useMaybeRefreshStore, useRefreshStore, useStore } from '../../store'
import { palette } from '../../theme/palette'
import { setCurrentInviteCode } from '../../utils/invite-state'
import { navigate } from '../../utils/navigation'

import './index.scss'

export default function ProfilePage() {
  const { familyName, members, settings, currentMemberId } = useStore()
  const dispatch = useDispatch()
  const refresh = useRefreshStore()
  const confirm = useConfirm()
  const currentMember = members.find((m) => m.id === currentMemberId)
  const isAdmin = currentMember?.roleLabel === '家庭管理员'
  const { joined, openFamilySetup, familyGate } = useFamilyGate()
  const maybeRefresh = useMaybeRefreshStore()

  // Browsing and replaying the example never forces family creation.
  useDidShow(() => { void maybeRefresh() })

  const [showInvite, setShowInvite] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const inviteLock = useRef(false)

  const generateInvite = async () => {
    if (inviteLock.current) return
    inviteLock.current = true
    setInviteLoading(true)
    try {
      const result = await createInvitation()
      setInviteCode(result.code)
      setCurrentInviteCode(result.code) // Set for share handler
      setShowInvite(true)
    } catch (error: any) {
      Taro.showToast({ title: error.message || '生成邀请码失败', icon: 'none' })
    } finally {
      inviteLock.current = false
      setInviteLoading(false)
    }
  }

  const copyCode = async () => {
    try { await Taro.setClipboardData({ data: inviteCode }); Taro.showToast({ title: '已复制', icon: 'success' }) }
    catch { Taro.showToast({ title: '复制失败，请手动复制上方邀请码', icon: 'none' }) }
  }

  // Page-level share — invite-aware. When an invite code has been generated
  // (setCurrentInviteCode below) the share forwards a join link; otherwise it
  // shares the app entry. Same handler powers both the WeChat menu and the
  // <Button openType="share"> inside the invite modal.
  useAppShare()

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

    confirm({
      title: '退出家庭',
      content,
      confirmText: '退出',
      danger: true
    }).then(async (result) => {
      if (!result.confirmed) return
      try {
        await leaveFamily()
        clearSession()
        await ensureLoggedIn()
        await refresh()
        Taro.showToast({ title: '已退出', icon: 'success' })
        // Stay on 我的 and offer the create/join sheet again.
        if (!hasFamily()) setTimeout(() => openFamilySetup('你已退出家庭，创建或加入一个新的家庭继续使用。'), 600)
      } catch (error: any) {
        Taro.showToast({ title: error.message || '退出失败', icon: 'none' })
      }
    })
  }

  // ---------- 未加入家庭：只展示引导，不展示家庭相关设置 ----------
  if (!joined) {
    return (
      <PageShell className='profile-page'>
        <View className='page-title'>
          <View>
            <BrandTitle className='page-title__text'>我的</BrandTitle>
            <Text className='page-title__subtitle'>管理家庭，让生活更有谱。</Text>
          </View>
        </View>

        <View className='profile-empty surface-card'>
          <Image className='profile-empty__art' src={family_garden} mode='aspectFit' />
          <Text className='profile-empty__title'>给一家人一个共享空间</Text>
          <Text className='profile-empty__copy'>
            创建一个家庭，或用邀请码加入家人的家庭，就能一起记账、管理物品和点餐。
          </Text>
          <View className='profile-empty__actions'>
            <Button
              className='button button--primary tap'
              hoverClass='tap--pressed'
              onClick={() => openFamilySetup()}
            >
              <AppIcon icon={Home} size={16} color='#FFFFFF' />
              <Text>创建家庭</Text>
            </Button>
            <Button
              className='button button--outline tap'
              hoverClass='tap--pressed'
              onClick={() => openFamilySetup('输入邀请码，加入家人的家庭。')}
            >
              <AppIcon icon={UserPlus} size={16} color={palette.primary} />
              <Text>加入家庭</Text>
            </Button>
          </View>
        </View>

      <Text className='profile-footer'>生活有本谱 v1.0.0</Text>

        {familyGate}
      </PageShell>
    )
  }

  return (
    <PageShell className='profile-page'>
      <View className='page-title'><View><BrandTitle className='page-title__text'>我的</BrandTitle><Text className='page-title__subtitle'>管理家庭，让生活更有谱。</Text></View></View>
      {/* ---------- 顶部身份区：紧凑，可点击 ---------- */}
      <Button
        className='profile-header tap tap-row'
        hoverClass='tap--pressed'
        onClick={() => navigate('/pages/family-manage/index')}
      >
        <Image className='profile-garden' src={profile_garden} mode='aspectFit' />
        <View className='profile-header__avatar'>
          <AppIcon icon={User} size={30} color='#7aa82f' />
        </View>
        <View className='profile-header__body'>
          <Text className='profile-header__name'>
            {currentMember?.displayName || '用户'}
          </Text>
          <View className='profile-header__tags'>
            <Text className='profile-header__tag'>{familyName}</Text>
          </View>
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
            onClick={() => navigate('/pages/family-switch/index')}
          >
            <View className='icon-bubble icon-bubble--xs icon-bubble--primary'>
              <AppIcon icon={Home} size={15} color={palette.primary} />
            </View>
            <Text className='profile-menu__label'>我的家庭</Text>
            <Text className='profile-menu__value'>{familyName}</Text>
            <AppIcon icon={ChevronRight} size={16} color={palette.disabledForeground} />
          </Button>
          <Button
            className='profile-menu__item tap tap-row'
            hoverClass='tap--pressed'
            onClick={() => navigate('/pages/family-manage/index')}
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
            onClick={() => navigate('/pages/family-manage/index?section=locations')}
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
            onClick={() => navigate('/pages/dish-manage/index')}
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
      {showInvite && (
        <View className='invite-modal-overlay'>
          <View className='invite-modal-overlay__bg' onClick={() => setShowInvite(false)} />
          <View className='invite-modal'>
            <View className='invite-modal__header'>
              <Text className='invite-modal__title'>邀请成员</Text>
              <Button className='invite-modal__close-btn' onClick={() => setShowInvite(false)}>
                <Text className='invite-modal__close'>×</Text>
              </Button>
            </View>
            
            <View className='invite-modal__content'>
              <Text className='profile-invite-sheet__hint'>
                将邀请码发给家人，对方在小程序中输入即可加入：
              </Text>
              <View className='profile-invite-sheet__code-box'>
                <Text className='profile-invite-sheet__code'>{inviteCode}</Text>
              </View>
              <Text className='profile-invite-sheet__expires'>24 小时有效，仅可使用一次</Text>
              
              <View className='profile-invite-sheet__actions'>
                <Button className='button button--secondary tap' hoverClass='tap--pressed' openType='share'>
                  <AppIcon icon={Share2} size={15} color={palette.primary} />
                  <Text>分享邀请码</Text>
                </Button>
                <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={copyCode}>
                  <Text>复制邀请码</Text>
                </Button>
              </View>
            </View>
          </View>
        </View>
      )}

      {familyGate}
    </PageShell>
  )
}
