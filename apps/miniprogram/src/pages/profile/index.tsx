import { Button, Input, Switch, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ChevronRight, Trash2, UserPlus } from 'lucide'
import { useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { useDispatch, useStore } from '../../store'
import { uid } from '../../store/uid'
import { palette } from '../../theme/palette'

import './index.scss'

export default function ProfilePage() {
  const { familyName, members, settings, familyId } = useStore()
  const dispatch = useDispatch()

  const [showRenameForm, setShowRenameForm] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [newFamilyName, setNewFamilyName] = useState(familyName)
  const [inviteName, setInviteName] = useState('')

  // Rename family
  const submitRename = () => {
    if (!newFamilyName.trim()) {
      Taro.showToast({ title: '请输入家庭名称', icon: 'none' }); return
    }
    dispatch({ type: 'family/rename', name: newFamilyName.trim() })
    setShowRenameForm(false)
    Taro.showToast({ title: '已修改', icon: 'success' })
  }

  // Invite
  const submitInvite = () => {
    if (!inviteName.trim()) {
      Taro.showToast({ title: '请输入成员名称', icon: 'none' }); return
    }
    dispatch({
      type: 'member/add',
      member: {
        id: uid('m-'),
        familyId,
        displayName: inviteName.trim(),
        roleLabel: '家庭成员',
        avatarText: inviteName.trim().slice(0, 1)
      }
    })
    setInviteName('')
    setShowInviteForm(false)
    Taro.showToast({ title: '已添加成员', icon: 'success' })
  }

  // Remove member
  const removeMember = (id: string, name: string) => {
    Taro.showModal({
      title: `移除 ${name}？`,
      content: '移除后该成员将无法访问家庭数据',
      confirmText: '移除',
      confirmColor: palette.destructive
    }).then((res) => {
      if (res.confirm) dispatch({ type: 'member/remove', id })
    })
  }

  // Toggle role
  const toggleRole = (id: string, currentRole: string) => {
    const newRole = currentRole === '家庭管理员' ? '家庭成员' : '家庭管理员'
    dispatch({ type: 'member/updateRole', id, roleLabel: newRole })
    Taro.showToast({ title: `已设为${newRole}`, icon: 'success' })
  }

  // Danger actions
  const confirmLeave = () => {
    Taro.showModal({
      title: '确认退出当前家庭？',
      content: '退出后将不能继续访问这个家庭的账本、点餐单和物品信息。',
      confirmText: '确认退出',
      confirmColor: palette.destructive
    }).then((res) => {
      if (res.confirm) Taro.showToast({ title: '退出功能将在接入后端后启用', icon: 'none' })
    })
  }

  const confirmDelete = () => {
    Taro.showModal({
      title: '确认注销账户？',
      content: '账户注销属于高风险操作，正式版本会再次校验身份并说明数据处理方式。',
      confirmText: '继续核验',
      confirmColor: palette.destructive
    }).then((res) => {
      if (res.confirm) Taro.showToast({ title: '注销功能将在接入后端后启用', icon: 'none' })
    })
  }

  // Copy invite code
  const copyInviteCode = () => {
    Taro.setClipboardData({ data: `youbenpu://join/${familyId}` })
  }

  return (
    <View className='page-shell'>
      <View className='page-title'>
        <Text className='page-title__text'>我的</Text>
      </View>

      {/* Family info */}
      <View className='profile-family tap' hoverClass='tap--pressed' onClick={() => { setNewFamilyName(familyName); setShowRenameForm(true) }}>
        <Text className='profile-family__name'>{familyName}</Text>
        <Text className='profile-family__meta'>{members.length} 位成员</Text>
        <AppIcon icon={ChevronRight} size={18} color={palette.subtleForeground} />
      </View>

      {/* Members */}
      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>成员</Text>
          <Button className='section__link tap' hoverClass='tap--pressed' onClick={() => setShowInviteForm(true)}>
            <AppIcon icon={UserPlus} size={15} color={palette.primary} />
            <Text> 邀请</Text>
          </Button>
        </View>
        <View className='list'>
          {members.map((member) => (
            <View key={member.id} className='list__row'>
              <View className='profile-avatar'>
                <Text>{member.avatarText}</Text>
              </View>
              <View className='list__body'>
                <Text className='list__title'>{member.displayName}</Text>
                <Button className='profile-role tap' hoverClass='tap--pressed' onClick={() => toggleRole(member.id, member.roleLabel)}>
                  <Text>{member.roleLabel}</Text>
                  <AppIcon icon={ChevronRight} size={13} color={palette.subtleForeground} />
                </Button>
              </View>
              {member.displayName !== '我' && (
                <Button className='tap' hoverClass='tap--pressed' onClick={() => removeMember(member.id, member.displayName)}>
                  <AppIcon icon={Trash2} size={16} color={palette.subtleForeground} />
                </Button>
              )}
            </View>
          ))}
        </View>
        <Button className='profile-copy-invite tap' hoverClass='tap--pressed' onClick={copyInviteCode}>
          复制邀请链接
        </Button>
      </View>

      {/* Settings */}
      <View className='section'>
        <View className='section__head'>
          <Text className='section__title'>提醒</Text>
        </View>
        <View className='list'>
          <View className='list__row'>
            <View className='list__body'>
              <Text className='list__title'>物品到期提醒</Text>
            </View>
            <Switch checked={settings.expiryReminder} color={palette.primary} onChange={() => dispatch({ type: 'settings/toggleExpiryReminder' })} />
          </View>
          <View className='list__row'>
            <View className='list__body'>
              <Text className='list__title'>点餐状态提醒</Text>
            </View>
            <Switch checked={settings.mealReminder} color={palette.primary} onChange={() => dispatch({ type: 'settings/toggleMealReminder' })} />
          </View>
        </View>
      </View>

      {/* Danger */}
      <View className='profile-danger'>
        <Button className='profile-danger__item tap' hoverClass='tap--pressed' onClick={confirmLeave}>
          退出当前家庭
        </Button>
        <Button className='profile-danger__item tap' hoverClass='tap--pressed' onClick={confirmDelete}>
          注销个人账户
        </Button>
      </View>
      <Text className='hint'>以上操作都会二次确认，不会误触执行</Text>

      {/* Rename form */}
      {showRenameForm && (
        <View className='form-overlay' onClick={() => setShowRenameForm(false)}>
          <View className='form-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='form-sheet__title'>修改家庭名称</Text>
            <Input className='form-input' type='text' placeholder='家庭名称' value={newFamilyName} onInput={(e) => setNewFamilyName(e.detail.value)} />
            <Button className='button button--primary tap form-submit' hoverClass='tap--pressed' onClick={submitRename}>确认</Button>
          </View>
        </View>
      )}

      {/* Invite form */}
      {showInviteForm && (
        <View className='form-overlay' onClick={() => setShowInviteForm(false)}>
          <View className='form-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='form-sheet__title'>邀请家人</Text>
            <Input className='form-input' type='text' placeholder='成员名称' value={inviteName} onInput={(e) => setInviteName(e.detail.value)} />
            <Button className='button button--primary tap form-submit' hoverClass='tap--pressed' onClick={submitInvite}>添加</Button>
          </View>
        </View>
      )}
    </View>
  )
}
