import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Home, UserPlus } from 'lucide'
import { useEffect, useRef, useState } from 'react'

import { createFamily, ensureLoggedIn, getInvitationInfo, joinFamily, type InvitationInfo } from '../../api'
import { setUserInfo, getUserInfo } from '../../api/token'
import { useRefreshStore } from '../../store'
import { palette } from '../../theme/palette'
import { consumePendingInvite } from '../../utils/pending-invite'
import { useConfirm } from '../feedback'
import { ActionSheet } from '../action-sheet'
import { AppIcon } from '../app-icon'


type Step = 'choose' | 'create' | 'join'

interface FamilySetupSheetProps {
  open: boolean
  /** Optional line explaining why the sheet appeared, e.g. "记账需要先有一个家庭". */
  reason?: string
  onClose: () => void
  /** Called after the user successfully created or joined a family. */
  onDone?: () => void
}

/**
 * Bottom-sheet flow for creating or joining a family.
 *
 * Replaces the old standalone `pages/auth` screen: new users now land on the
 * app itself and only meet this sheet when they open 我的 or trigger a feature
 * that needs a family. Always dismissible — never block browsing.
 */
export function FamilySetupSheet({ open, reason, onClose, onDone }: FamilySetupSheetProps) {
  const refresh = useRefreshStore()
  const confirmMerge = useConfirm()
  const submitting = useRef(false)
  const [step, setStep] = useState<Step>('choose')
  const [familyName, setFamilyName] = useState('我们家')
  const [displayName, setDisplayName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null)
  const [previewStatus, setPreviewStatus] = useState('')
  // Opt-in: bring the user's current family's data into the family being
  // joined. Only meaningful when the user already belongs to a family.
  const [mergeData, setMergeData] = useState(false)
  const currentFamilyId = getUserInfo()?.familyId ?? null

  // Reset to the entry step each time the sheet opens. If the user arrived via
  // an invite QR code, jump straight to the join step with the code filled in.
  useEffect(() => {
    if (!open) return
    setErrorMessage('')
    const pending = consumePendingInvite()
    if (pending) {
      setInviteCode(pending)
      setStep('join')
    } else {
      setStep('choose')
    }
  }, [open])

  useEffect(() => {
    setInvitation(null)
    setPreviewStatus('')
    if (!open || step !== 'join' || inviteCode.trim().length !== 6) return
    let cancelled = false
    setPreviewStatus('正在核验邀请码…')
    const timer = setTimeout(() => {
      void ensureLoggedIn().then(() => getInvitationInfo(inviteCode.trim())).then(info => {
        if (cancelled) return
        setInvitation(info)
        setPreviewStatus(info.valid ? `即将加入「${info.family_name}」` : info.reason || '邀请码无效')
      }).catch(() => { if (!cancelled) setPreviewStatus('暂未能核验，提交时会再次检查邀请码。') })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [open, step, inviteCode])

  async function finish(familyId: string, role: 'owner' | 'member') {
    const existing = getUserInfo()
    setUserInfo({
      userId: existing?.userId ?? '',
      familyId,
      displayName: displayName.trim(),
      role
    })
    await refresh().catch(() => { /* cached state is fine */ })
    onDone?.()
    onClose()
  }

  async function handleCreateFamily() {
    if (loading || submitting.current) return
    setErrorMessage('')
    if (!displayName.trim()) {
      Taro.showToast({ title: '请填写你的名字', icon: 'none' })
      return
    }
    submitting.current = true
    setLoading(true)
    try {
      await ensureLoggedIn()
      const result = await createFamily(familyName.trim() || '我们家', displayName.trim())
      Taro.showToast({ title: '家庭创建成功', icon: 'success' })
      await finish(result.id, 'owner')
    } catch (error: any) {
      const message = error.message || error.errMsg || '创建失败，请重试'
      setErrorMessage(message)
      Taro.showToast({ title: message, icon: 'none' })
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  async function handleJoinFamily() {
    if (loading || submitting.current) return
    setErrorMessage('')
    if (!inviteCode.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    if (!displayName.trim()) {
      Taro.showToast({ title: '请填写你的名字', icon: 'none' })
      return
    }
    // Capture the merge source before joining, since joining switches the
    // active family. Merging copies the current family's data into the new one
    // (private ledger notes are never copied) and cannot be undone.
    let mergeFrom: string | undefined
    if (mergeData && currentFamilyId) {
      const confirmation = await confirmMerge({
        title: '确认合并数据',
        content: '将把你当前家庭的账本、物品、菜品等数据复制到新家庭，家庭成员都能看到。私密账本不会被复制。此操作不可撤销。',
        confirmText: '确认合并',
        danger: false
      })
      if (!confirmation.confirmed) return
      mergeFrom = currentFamilyId
    }

    submitting.current = true
    setLoading(true)
    try {
      await ensureLoggedIn()
      const result = await joinFamily(inviteCode.trim().toUpperCase(), displayName.trim(), mergeFrom)
      Taro.showToast({ title: mergeFrom ? '加入并合并成功' : '加入成功', icon: 'success' })
      await finish(result.family_id, 'member')
    } catch (error: any) {
      const message = error.message || error.errMsg || '加入失败，请重试'
      setErrorMessage(message)
      Taro.showToast({ title: message, icon: 'none' })
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  const title = step === 'create' ? '创建家庭' : step === 'join' ? '加入家庭' : '开启家庭'

  return (
    <ActionSheet open={open} title={title} onClose={onClose}>
      <View className='family-setup'>
        {errorMessage && <View className='family-setup__error' role='alert'><Text>{errorMessage}</Text><Text>填写的内容已保留，可以重试。</Text></View>}
        {step === 'choose' && (
          <View className='family-setup__choose'>
            <Text className='family-setup__lede'>
              {reason || '创建或加入一个家庭，就能和家人共享账本、物品和点餐。'}
            </Text>

            <Button
              className='family-setup__choice surface-card tap'
              hoverClass='tap--pressed'
              onClick={() => setStep('create')}
            >
              <View className='icon-bubble icon-bubble--primary'>
                <AppIcon icon={Home} size={22} color={palette.primary} />
              </View>
              <View className='family-setup__choice-body'>
                <Text className='family-setup__choice-title'>创建家庭</Text>
                <Text className='family-setup__choice-copy'>新建一个家庭，邀请家人加入</Text>
              </View>
            </Button>

            <Button
              className='family-setup__choice surface-card tap'
              hoverClass='tap--pressed'
              onClick={() => setStep('join')}
            >
              <View className='icon-bubble icon-bubble--green'>
                <AppIcon icon={UserPlus} size={22} color={palette.success} />
              </View>
              <View className='family-setup__choice-body'>
                <Text className='family-setup__choice-title'>加入家庭</Text>
                <Text className='family-setup__choice-copy'>输入邀请码或扫码加入</Text>
              </View>
            </Button>
          </View>
        )}

        {step === 'create' && (
          <View className='family-setup__form'>
            <View className='field'>
              <Text className='field__label'>你的名字</Text>
              <Input
                className='field__control'
                type='text'
                maxlength={20}
                placeholder='例如：爸爸、妈妈'
                placeholderClass='input-placeholder'
                value={displayName}
                onInput={(e) => setDisplayName(e.detail.value)}
              />
            </View>

            <View className='field'>
              <Text className='field__label'>家庭名称 <Text className='field__optional'>选填</Text></Text>
              <Input
                className='field__control'
                type='text'
                maxlength={20}
                placeholder='我们家'
                placeholderClass='input-placeholder'
                value={familyName}
                onInput={(e) => setFamilyName(e.detail.value)}
              />
            </View>

            <Button
              className='button button--primary family-setup__submit tap'
              hoverClass='tap--pressed'
              disabled={loading}
              onClick={handleCreateFamily}
            >
              {loading ? '创建中...' : '创建并进入'}
            </Button>

            <Button className='family-setup__back tap' hoverClass='tap--pressed' onClick={() => setStep('choose')}>
              <Text>返回</Text>
            </Button>
          </View>
        )}

        {step === 'join' && (
          <View className='family-setup__form'>
            <View className='field'>
              <Text className='field__label'>你的名字</Text>
              <Input
                className='field__control'
                type='text'
                maxlength={20}
                placeholder='例如：爸爸、妈妈'
                placeholderClass='input-placeholder'
                value={displayName}
                onInput={(e) => setDisplayName(e.detail.value)}
              />
            </View>

            <View className='field'>
              <Text className='field__label'>邀请码</Text>
              <Input
                className='field__control family-setup__invite-input'
                type='text'
                maxlength={6}
                placeholder='6 位邀请码'
                placeholderClass='input-placeholder'
                value={inviteCode}
                onInput={(e) => setInviteCode(e.detail.value.toUpperCase())}
              />
              <Text className='field__hint'>向家庭管理员索取邀请码，或扫描邀请二维码自动填入</Text>
              {previewStatus && <Text className={`field__hint ${invitation?.valid === false ? 'form-error' : ''}`}>{previewStatus}</Text>}
            </View>

            {currentFamilyId && (
              <Button
                className='family-setup__merge tap tap-row'
                hoverClass='tap--pressed'
                onClick={() => setMergeData((v) => !v)}
              >
                <View className='family-setup__merge-body'>
                  <Text className='family-setup__merge-title'>把我当前家庭的数据一起带过来</Text>
                  <Text className='family-setup__merge-hint'>复制账本、物品、菜品等到新家庭；私密账本不会复制</Text>
                </View>
                <Text className='family-setup__merge-state'>{mergeData ? '已选择' : '不带'}</Text>
              </Button>
            )}

            <Button
              className='button button--primary family-setup__submit tap'
              hoverClass='tap--pressed'
              disabled={loading}
              onClick={handleJoinFamily}
            >
              {loading ? '加入中...' : '加入家庭'}
            </Button>

            <Button className='family-setup__back tap' hoverClass='tap--pressed' onClick={() => setStep('choose')}>
              <Text>返回</Text>
            </Button>
          </View>
        )}
      </View>
    </ActionSheet>
  )
}
