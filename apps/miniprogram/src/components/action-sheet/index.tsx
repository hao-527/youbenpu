import { Button, Text, View } from '@tarojs/components'
import { useEffect, useState } from 'react'

import './index.scss'

interface ActionSheetProps {
  open: boolean
  title?: string
  onClose: () => void
  children: React.ReactNode
}

export function ActionSheet({ open, title, onClose, children }: ActionSheetProps) {
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (open) {
      setVisible(true)
      // trigger enter animation next frame
      requestAnimationFrame(() => setAnimating(true))
    } else {
      setAnimating(false)
      const timer = setTimeout(() => setVisible(false), 300)
      return () => clearTimeout(timer)
    }
  }, [open])

  if (!visible) return null

  return (
    <View className={`asheet-overlay ${animating ? 'asheet-overlay--enter' : ''}`} catchMove onClick={onClose}>
      <View className={`asheet ${animating ? 'asheet--enter' : ''}`} onClick={(e) => e.stopPropagation()}>
        <View className='asheet__handle' />
        {title && (
          <View className='asheet__header'>
            <Text className='asheet__title'>{title}</Text>
            <Button className='asheet__close tap' hoverClass='tap--pressed' onClick={onClose}>取消</Button>
          </View>
        )}
        <View className='asheet__body'>
          {children}
        </View>
      </View>
    </View>
  )
}
