import { Text, View } from '@tarojs/components'
import { CheckCircle2, XCircle, Info } from 'lucide'
import { useEffect, useState } from 'react'

import { AppIcon } from '../../app-icon'
import { palette } from '../../../theme/palette'


export type ToastKind = 'success' | 'error' | 'none'

export interface ToastData {
  id: number
  text: string
  kind: ToastKind
  duration: number
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  none: Info
} as const

const ICON_COLORS = {
  success: palette.success,
  error: palette.destructive,
  none: palette.onPrimary
} as const

/**
 * Single centered toast card. Fades/scales in, holds, then fades out.
 * `onDone` fires after the exit animation so the host can drop it from state.
 */
export function Toast({ data, onDone }: { data: ToastData; onDone: (id: number) => void }) {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setEntered(true))
    const hideTimer = setTimeout(() => setEntered(false), data.duration)
    const doneTimer = setTimeout(() => onDone(data.id), data.duration + 240)
    return () => {
      clearTimeout(hideTimer)
      clearTimeout(doneTimer)
    }
  }, [data.id, data.duration, onDone])

  const showIcon = data.kind !== 'none'

  return (
    <View className={`toast ${entered ? 'toast--enter' : ''} ${showIcon ? '' : 'toast--text-only'}`}>
      {showIcon && (
        <View className='toast__icon'>
          <AppIcon icon={ICONS[data.kind]} size={30} color={ICON_COLORS[data.kind]} strokeWidth={2} />
        </View>
      )}
      <Text className='toast__text'>{data.text}</Text>
    </View>
  )
}
