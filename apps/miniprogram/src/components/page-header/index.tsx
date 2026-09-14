import { Button, Text, View } from '@tarojs/components'
import { ChevronLeft } from 'lucide'
import type { ReactNode } from 'react'

import { palette } from '../../theme/palette'
import { goBack as safeGoBack } from '../../utils/navigation'
import { AppIcon } from '../app-icon'

interface PageHeaderProps {
  title: string
  subtitle?: string
  end?: ReactNode
  onBack?: () => void
}

export function PageHeader({ title, subtitle, end, onBack }: PageHeaderProps) {
  const goBack = onBack ?? (() => safeGoBack())

  return (
    <View className='subpage-header'>
      <Button className='page-back tap' hoverClass='tap--pressed' aria-label='返回上一页' onClick={goBack}>
        <AppIcon icon={ChevronLeft} size={22} color={palette.foreground} />
      </Button>
      <View className='subpage-header__body'>
        <Text className='subpage-header__title'>{title}</Text>
        {subtitle && <Text className='subpage-header__subtitle'>{subtitle}</Text>}
      </View>
      <View className='subpage-header__end'>{end}</View>
    </View>
  )
}
