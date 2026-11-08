import { useNativeOverlay } from '../../hooks/use-native-overlay'
import { Button, Text, View } from '@tarojs/components'
import { Package, ReceiptText, Utensils } from 'lucide'
import { useState } from 'react'
import type { IconNode } from 'lucide'

import { useDispatch } from '../../store'
import { palette } from '../../theme/palette'
import { AppIcon } from '../app-icon'


interface OnboardingStep {
  icon: IconNode
  title: string
  description: string
  detail: string
}

const steps: OnboardingStep[] = [
  {
    icon: ReceiptText,
    title: '记账',
    description: '随手记录家庭收支',
    detail: '每笔收支按成员归类，月底清楚钱花在哪里。支持按月查看和成员筛选。'
  },
  {
    icon: Package,
    title: '找物品',
    description: '记录家中物品位置',
    detail: '牛奶在冰箱、退热贴在药箱——记下来就不用翻找。到期前自动提醒。'
  },
  {
    icon: Utensils,
    title: '点餐',
    description: '选好今天吃什么',
    detail: '建一份家庭菜谱，每天从菜谱里点餐，全家人都能看到今天吃什么。'
  }
]

export function Onboarding() {
  useNativeOverlay(true)
  const dispatch = useDispatch()
  const [current, setCurrent] = useState(0)
  const step = steps[current]
  const isLast = current === steps.length - 1

  const next = () => {
    if (isLast) {
      dispatch({ type: 'onboarding/complete' })
    } else {
      setCurrent(current + 1)
    }
  }

  const skip = () => {
    dispatch({ type: 'onboarding/complete' })
  }

  return (
    <View className='onboarding' catchMove>
      <View className='onboarding__card'>
        {/* Progress dots */}
        <View className='onboarding__dots'>
          {steps.map((_, index) => (
            <View key={index} className={`onboarding__dot ${index === current ? 'onboarding__dot--active' : ''}`} />
          ))}
        </View>

        {/* Icon */}
        <View className='onboarding__icon'>
          <AppIcon icon={step.icon} size={32} color={palette.primary} />
        </View>

        {/* Content */}
        <Text className='onboarding__title'>{step.title}</Text>
        <Text className='onboarding__description'>{step.description}</Text>
        <Text className='onboarding__detail'>{step.detail}</Text>

        {/* Actions */}
        <View className='onboarding__actions'>
          <Button className='onboarding__next tap' hoverClass='tap--pressed' onClick={next}>
            {isLast ? '开始使用' : '下一步'}
          </Button>
          {!isLast && (
            <Button className='onboarding__skip tap' hoverClass='tap--pressed' onClick={skip}>
              跳过
            </Button>
          )}
        </View>

        {/* Step indicator text */}
        <Text className='onboarding__counter'>{current + 1} / {steps.length}</Text>
      </View>
    </View>
  )
}
