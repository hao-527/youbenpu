import { Button, Input, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { Home, MapPin, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide'
import { useEffect, useMemo, useState } from 'react'

import { createInvitation, joinFamily } from '../../api'
import { AppIcon } from '../../components/app-icon'
import { ChipSelect } from '../../components/chip-select'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { useDispatch, useStore } from '../../store'
import { palette } from '../../theme/palette'
import type { FamilyMember, FamilyRole } from '../../types/domain'

import './index.scss'

const roleOptions: FamilyRole[] = ['家庭管理员', '家庭成员']

export default function FamilyManagePage() {
  const router = useRouter()
  const { currentMemberId, familyName, inventory, locations, members } = useStore()
  const dispatch = useDispatch()
  const [showRename, setShowRename] = useState(false)
  const [showJoinWithInvite, setShowJoinWithInvite] = useState(false)
  const [inviteCodeInput, setInviteCodeInput] = useState('')
  const [familyNameDraft, setFamilyNameDraft] = useState(familyName)
  const [locationDraft, setLocationDraft] = useState('')

  const currentMember = members.find((member) => member.id === currentMemberId) ?? members[0]
  const isAdmin = currentMember?.roleLabel === '家庭管理员'
  const adminCount = members.filter((member) => member.roleLabel === '家庭管理员').length
  const locationUsage = useMemo(() => new Map(locations.map((location) => [
    location,
    inventory.filter((item) => item.location === location && item.status !== 'finished' && item.status !== 'discarded' && item.status !== 'deleted').length
  ])), [inventory, locations])

  useEffect(() => {
    // Invite codes from share links are regular Taro route params.
    const inviteCode = router?.params?.invite
    if (inviteCode) {
      setInviteCodeInput(inviteCode)
      setShowJoinWithInvite(true)
    }

    // Scroll to locations section if specified
    if (router?.params?.section !== 'locations') return
    const timer = setTimeout(() => {
      Taro.pageScrollTo({ selector: '#family-locations', duration: 0 })
    }, 80)
    return () => clearTimeout(timer)
  }, [router?.params?.invite, router?.params?.section])

  const openRename = () => {
    if (!isAdmin) return
    setFamilyNameDraft(familyName)
    setShowRename(true)
  }

  const renameFamily = async () => {
    const normalized = familyNameDraft.trim()
    if (!normalized) {
      Taro.showToast({ title: '请填写家庭名称', icon: 'none' })
      return
    }
    if (normalized.length > 20) {
      Taro.showToast({ title: '家庭名称最多 20 个字', icon: 'none' })
      return
    }
    const succeeded = await dispatch({ type: 'family/rename', name: normalized })
    if (!succeeded) return
    setShowRename(false)
    Taro.showToast({ title: '家庭名称已更新', icon: 'success' })
  }

  const inviteMember = async () => {
    try {
      const invitation = await createInvitation()
      await Taro.setClipboardData({ data: invitation.code })
      await Taro.showModal({
        title: '邀请码已复制',
        content: `邀请码 ${invitation.code}，24 小时内有效。请让家庭成员在微信中打开邀请并加入。`,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: palette.primary
      })
    } catch (error: any) {
      Taro.showToast({ title: error.message || '生成邀请码失败', icon: 'none' })
    }
  }

  const updateMemberRole = (member: FamilyMember, roleLabel: FamilyRole) => {
    if (!isAdmin || member.roleLabel === roleLabel) return
    if (member.roleLabel === '家庭管理员' && roleLabel === '家庭成员' && adminCount <= 1) {
      Taro.showToast({ title: '家庭至少需要一位管理员', icon: 'none' })
      return
    }
    Taro.showModal({
      title: '调整成员角色',
      content: `确认将"${member.displayName}"设为${roleLabel}？`,
      confirmText: '确认调整',
      confirmColor: palette.primary
    }).then(async (result) => {
      if (!result.confirm) return
      const succeeded = await dispatch({ type: 'member/updateRole', id: member.id, roleLabel })
      if (succeeded) Taro.showToast({ title: '成员角色已更新', icon: 'success' })
    })
  }

  const removeMember = (member: FamilyMember) => {
    if (!isAdmin || member.id === currentMemberId) return
    if (member.roleLabel === '家庭管理员' && adminCount <= 1) {
      Taro.showToast({ title: '家庭至少需要一位管理员', icon: 'none' })
      return
    }
    Taro.showModal({
      title: `移除"${member.displayName}"？`,
      content: '成员会从当前家庭移除，已有账本和点餐记录仍会保留。',
      confirmText: '移除成员',
      confirmColor: palette.destructive
    }).then(async (result) => {
      if (!result.confirm) return
      const succeeded = await dispatch({ type: 'member/remove', id: member.id })
      if (succeeded) Taro.showToast({ title: '成员已移除', icon: 'success' })
    })
  }

  const addLocation = async () => {
    const normalized = locationDraft.trim()
    if (!normalized) {
      Taro.showToast({ title: '请填写位置名称', icon: 'none' })
      return
    }
    if (normalized.length > 20) {
      Taro.showToast({ title: '位置名称最多 20 个字', icon: 'none' })
      return
    }
    if (locations.some((location) => location.toLowerCase() === normalized.toLowerCase())) {
      Taro.showToast({ title: '这个位置已经存在', icon: 'none' })
      return
    }
    const succeeded = await dispatch({ type: 'location/add', name: normalized })
    if (!succeeded) return
    setLocationDraft('')
    Taro.showToast({ title: '位置已添加', icon: 'success' })
  }

  const removeLocation = (location: string) => {
    const usageCount = locationUsage.get(location) ?? 0
    if (usageCount > 0) {
      Taro.showModal({
        title: '暂时不能删除',
        content: `还有 ${usageCount} 件物品存放在"${location}"。请先到物品详情中调整存放位置。`,
        showCancel: false,
        confirmText: '我知道了',
        confirmColor: palette.primary
      })
      return
    }
    Taro.showModal({
      title: `删除"${location}"？`,
      content: '删除后，新增物品时将不能再选择这个位置。',
      confirmText: '删除位置',
      confirmColor: palette.destructive
    }).then(async (result) => {
      if (!result.confirm) return
      const succeeded = await dispatch({ type: 'location/delete', name: location })
      if (succeeded) Taro.showToast({ title: '位置已删除', icon: 'success' })
    })
  }

  const joinWithInviteCode = async () => {
    const code = inviteCodeInput.trim()
    if (!code) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    if (code.length !== 6 && code.length !== 8) {
      Taro.showToast({ title: '邀请码格式不正确', icon: 'none' })
      return
    }

    try {
      await joinFamily(code, currentMember?.displayName || '用户')
      setShowJoinWithInvite(false)
      setInviteCodeInput('')
      Taro.showToast({ title: '加入家庭成功！', icon: 'success' })
      // Refresh family data
      Taro.reLaunch({ url: '/pages/family-manage/index' })
    } catch (error: any) {
      Taro.showToast({ title: error.message || '加入失败，请检查邀请码', icon: 'none' })
    }
  }

  return (
    <PageShell tabPage={false}>
      <PageHeader title='家庭管理' subtitle={isAdmin ? '管理成员、角色和常用位置' : '查看家庭信息与维护常用位置'} />

      <View className='family-overview surface-card'>
        <View className='icon-bubble icon-bubble--md icon-bubble--primary'>
          <AppIcon icon={Home} size={22} color={palette.primary} />
        </View>
        <View className='family-overview__body'>
          <Text className='family-overview__name'>{familyName}</Text>
          <Text className='family-overview__meta'>{members.length} 位成员 · {locations.length} 个常用位置</Text>
        </View>
        {isAdmin && (
          <Button className='icon-action tap' hoverClass='tap--pressed' aria-label='修改家庭名称' onClick={openRename}>
            <AppIcon icon={Pencil} size={17} color={palette.primary} />
          </Button>
        )}
      </View>

      {!isAdmin && (
        <View className='family-permission-note'>
          <AppIcon icon={ShieldCheck} size={16} color={palette.subtleForeground} />
          <Text>家庭名称、成员和角色仅管理员可以修改。</Text>
        </View>
      )}

      <View className='section'>
        <View className='section__head family-section-head'>
          <View className='family-section-head__copy'>
            <Text className='section__title'>家庭成员</Text>
            <Text className='family-section-head__meta'>{adminCount} 位管理员</Text>
          </View>
          {isAdmin && (
            <Button className='content-action tap' hoverClass='tap--pressed' onClick={inviteMember}>
              <AppIcon icon={UserPlus} size={16} color={palette.primary} />
              <Text>邀请成员</Text>
            </Button>
          )}
        </View>

        <View className='family-member-list surface-card'>
          {members.map((member) => (
            <View key={member.id} className='family-member-row'>
              <View className='family-member-row__avatar'>{member.avatarText || member.displayName.slice(0, 1)}</View>
              <View className='family-member-row__body'>
                <View className='family-member-row__name-line'>
                  <Text className='family-member-row__name'>{member.displayName}</Text>
                  {member.id === currentMemberId && <Text className='family-member-row__current'>当前用户</Text>}
                </View>
                {isAdmin ? (
                  <View className='family-role-chips'>
                    <ChipSelect
                      options={roleOptions}
                      value={member.roleLabel}
                      onChange={(v) => updateMemberRole(member, v as FamilyRole)}
                    />
                  </View>
                ) : (
                  <View className='family-role-label'>
                    {member.roleLabel === '家庭管理员' && <AppIcon icon={ShieldCheck} size={12} color={palette.primary} />}
                    <Text>{member.roleLabel}</Text>
                  </View>
                )}
              </View>
              {isAdmin && member.id !== currentMemberId && (
                <Button className='icon-action family-member-row__remove tap' hoverClass='tap--pressed' aria-label={`移除成员${member.displayName}`} onClick={() => removeMember(member)}>
                  <AppIcon icon={Trash2} size={16} color={palette.destructive} />
                </Button>
              )}
            </View>
          ))}
        </View>
        {isAdmin && <Text className='family-section-tip'>通过 24 小时有效的邀请码让家庭成员使用自己的微信账号加入。</Text>}
      </View>

      <View id='family-locations' className='section family-locations'>
        <View className='section__head family-section-head'>
          <View className='family-section-head__copy'>
            <Text className='section__title'>常用位置</Text>
            <Text className='family-section-head__meta'>全体成员均可维护</Text>
          </View>
        </View>

        <View className='family-location-create surface-card'>
          <View className='icon-bubble icon-bubble--sm icon-bubble--primary'>
            <AppIcon icon={MapPin} size={18} color={palette.primary} />
          </View>
          <Input
            className='family-location-create__input'
            type='text'
            maxlength={20}
            value={locationDraft}
            placeholder='例如：玄关柜、行李箱'
            placeholderClass='input-placeholder'
            confirmType='done'
            onInput={(event) => setLocationDraft(event.detail.value)}
            onConfirm={addLocation}
          />
          <Button className='family-location-create__button tap' hoverClass='tap--pressed' aria-label='添加位置' onClick={addLocation}>
            <AppIcon icon={Plus} size={18} color={palette.onPrimary} />
          </Button>
        </View>

        {locations.length === 0 ? (
          <View className='empty-state surface-card family-location-empty'>
            <View className='empty-state__icon'>
              <AppIcon icon={MapPin} size={28} color={palette.subtleForeground} />
            </View>
            <Text className='empty-state__title'>还没有常用位置</Text>
            <Text className='empty-state__copy'>添加位置后，新增物品时即可直接选择。</Text>
          </View>
        ) : (
          <View className='family-location-list surface-card'>
            {locations.map((location) => {
              const usageCount = locationUsage.get(location) ?? 0
              return (
                <View key={location} className='family-location-row'>
                  <View className='icon-bubble icon-bubble--sm icon-bubble--primary'>
                    <AppIcon icon={MapPin} size={16} color={palette.primary} />
                  </View>
                  <View className='family-location-row__body'>
                    <Text className='family-location-row__name'>{location}</Text>
                    <Text className='family-location-row__meta'>{usageCount > 0 ? `${usageCount} 件物品正在使用` : '暂无物品使用'}</Text>
                  </View>
                  <Button
                    className='icon-action tap'
                    hoverClass='tap--pressed'
                    aria-label={`删除位置${location}`}
                    aria-disabled={usageCount > 0 ? 'true' : 'false'}
                    onClick={() => removeLocation(location)}
                  >
                    <AppIcon icon={Trash2} size={16} color={usageCount > 0 ? palette.disabledForeground : palette.destructive} />
                  </Button>
                </View>
              )
            })}
          </View>
        )}
      </View>

      {showRename && (
        <View className='form-overlay' catchMove onClick={() => setShowRename(false)}>
          <View className='form-sheet family-sheet' onClick={(event) => event.stopPropagation()}>
            <View className='family-sheet__handle' />
            <View className='family-sheet__head'>
              <Text className='form-sheet__title'>修改家庭名称</Text>
              <Button className='family-sheet__cancel tap' hoverClass='tap--pressed' onClick={() => setShowRename(false)}>取消</Button>
            </View>
            <View className='field'>
              <Text className='field__label'>家庭名称</Text>
              <Input className='field__control' type='text' maxlength={20} value={familyNameDraft} placeholder='输入家庭名称' placeholderClass='input-placeholder' focus onInput={(event) => setFamilyNameDraft(event.detail.value)} onConfirm={renameFamily} />
            </View>
            <Button className='button button--primary tap family-sheet__submit' hoverClass='tap--pressed' onClick={renameFamily}>保存名称</Button>
          </View>
        </View>
      )}

    </PageShell>
  )
}
