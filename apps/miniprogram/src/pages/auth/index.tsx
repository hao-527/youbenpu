import { Button, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Home, UserPlus } from 'lucide'
import { useState } from 'react'

import { createFamily, joinFamily, login } from '../../api'
import { setUserInfo } from '../../api/token'
import { AppIcon } from '../../components/app-icon'
import { palette } from '../../theme/palette'

import './index.scss'

type Step = 'loading' | 'choose' | 'create' | 'join'

export default function AuthPage() {
  const [step, setStep] = useState<Step>('loading')
  const [familyName, setFamilyName] = useState('我们家')
  const [displayName, setDisplayName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)

  // Auto-login on mount
  useState(() => {
    doLogin()
  })

  async function doLogin() {
    try {
      const result = await login()
      if (result.family_id) {
        // Already has a family, go to home
        Taro.switchTab({ url: '/pages/home/index' })
      } else {
        // New user or no family — show choice
        setStep('choose')
      }
    } catch {
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
      setStep('choose')
    }
  }

  async function handleCreateFamily() {
    if (!displayName.trim()) {
      Taro.showToast({ title: '请填写你的名字', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const result = await createFamily(familyName.trim() || '我们家', displayName.trim())
      // Update local user info with new family
      setUserInfo({
        userId: '',  // will be refreshed
        familyId: result.id,
        displayName: displayName.trim(),
        role: 'owner'
      })
      Taro.showToast({ title: '家庭创建成功', icon: 'success' })
      setTimeout(() => Taro.switchTab({ url: '/pages/home/index' }), 500)
    } catch (error: any) {
      Taro.showToast({ title: error.message || '创建失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinFamily() {
    if (!inviteCode.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    if (!displayName.trim()) {
      Taro.showToast({ title: '请填写你的名字', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      const result = await joinFamily(inviteCode.trim().toUpperCase(), displayName.trim())
      setUserInfo({
        userId: '',
        familyId: result.family_id,
        displayName: displayName.trim(),
        role: 'member'
      })
      Taro.showToast({ title: '加入成功', icon: 'success' })
      setTimeout(() => Taro.switchTab({ url: '/pages/home/index' }), 500)
    } catch (error: any) {
      Taro.showToast({ title: error.message || '加入失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // Handle QR code scene (from app.ts onLaunch)
  const params = Taro.getCurrentInstance().router?.params
  if (params?.scene) {
    const scene = decodeURIComponent(params.scene)
    const match = scene.match(/invite=([A-Z0-9]+)/)
    if (match && !inviteCode) {
      setInviteCode(match[1])
      if (step === 'choose') setStep('join')
    }
  }

  if (step === 'loading') {
    return (
      <View className='auth-page'>
        <View className='auth-loading'>
          <Text className='auth-loading__text'>正在登录...</Text>
        </View>
      </View>
    )
  }

  if (step === 'choose') {
    return (
      <View className='auth-page'>
        <View className='auth-hero'>
          <Text className='auth-hero__title'>生活有本谱</Text>
          <Text className='auth-hero__subtitle'>家庭记账、物品管理、一起点餐</Text>
        </View>

        <View className='auth-choices'>
          <Button className='auth-choice surface-card tap' hoverClass='tap--pressed' onClick={() => setStep('create')}>
            <View className='icon-bubble icon-bubble--primary'>
              <AppIcon icon={Home} size={22} color={palette.primary} />
            </View>
            <View className='auth-choice__body'>
              <Text className='auth-choice__title'>创建家庭</Text>
              <Text className='auth-choice__copy'>新建一个家庭，邀请家人加入</Text>
            </View>
          </Button>

          <Button className='auth-choice surface-card tap' hoverClass='tap--pressed' onClick={() => setStep('join')}>
            <View className='icon-bubble icon-bubble--green'>
              <AppIcon icon={UserPlus} size={22} color={palette.success} />
            </View>
            <View className='auth-choice__body'>
              <Text className='auth-choice__title'>加入家庭</Text>
              <Text className='auth-choice__copy'>输入邀请码或扫码加入</Text>
            </View>
          </Button>
        </View>
      </View>
    )
  }

  if (step === 'create') {
    return (
      <View className='auth-page'>
        <View className='auth-form'>
          <Text className='auth-form__title'>创建家庭</Text>

          <View className='field'>
            <Text className='field__label'>你的名字</Text>
            <Input className='field__control' type='text' maxlength={20} placeholder='例如：爸爸、妈妈' placeholderClass='input-placeholder' value={displayName} onInput={(e) => setDisplayName(e.detail.value)} />
          </View>

          <View className='field'>
            <Text className='field__label'>家庭名称 <Text className='field__optional'>选填</Text></Text>
            <Input className='field__control' type='text' maxlength={20} placeholder='我们家' placeholderClass='input-placeholder' value={familyName} onInput={(e) => setFamilyName(e.detail.value)} />
          </View>

          <Button className='button button--primary auth-form__submit tap' hoverClass='tap--pressed' disabled={loading} onClick={handleCreateFamily}>
            {loading ? '创建中...' : '创建并进入'}
          </Button>

          <Button className='auth-form__back tap' hoverClass='tap--pressed' onClick={() => setStep('choose')}>
            <Text>返回</Text>
          </Button>
        </View>
      </View>
    )
  }

  // step === 'join'
  return (
    <View className='auth-page'>
      <View className='auth-form'>
        <Text className='auth-form__title'>加入家庭</Text>

        <View className='field'>
          <Text className='field__label'>你的名字</Text>
          <Input className='field__control' type='text' maxlength={20} placeholder='例如：爸爸、妈妈' placeholderClass='input-placeholder' value={displayName} onInput={(e) => setDisplayName(e.detail.value)} />
        </View>

        <View className='field'>
          <Text className='field__label'>邀请码</Text>
          <Input className='field__control auth-invite-input' type='text' maxlength={6} placeholder='6 位邀请码' placeholderClass='input-placeholder' value={inviteCode} onInput={(e) => setInviteCode(e.detail.value.toUpperCase())} />
          <Text className='field__hint'>向家庭管理员索取邀请码，或扫描邀请二维码自动填入</Text>
        </View>

        <Button className='button button--primary auth-form__submit tap' hoverClass='tap--pressed' disabled={loading} onClick={handleJoinFamily}>
          {loading ? '加入中...' : '加入家庭'}
        </Button>

        <Button className='auth-form__back tap' hoverClass='tap--pressed' onClick={() => setStep('choose')}>
          <Text>返回</Text>
        </Button>
      </View>
    </View>
  )
}
