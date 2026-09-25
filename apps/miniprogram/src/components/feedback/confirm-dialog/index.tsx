import { Button, Input, Text, View } from '@tarojs/components'
import { AlertTriangle, HelpCircle, Pencil, Trash2 } from 'lucide'
import { useEffect, useState } from 'react'

import { AppIcon } from '../../app-icon'
import { palette } from '../../../theme/palette'

import './index.scss'

export interface ConfirmOptions {
  title: string
  content?: string
  confirmText?: string
  cancelText?: string
  /** Destructive actions render the confirm button in the destructive color. */
  danger?: boolean
  /** When true, an input field is shown and its trimmed value is returned. */
  editable?: boolean
  placeholder?: string
  defaultValue?: string
  /** Overrides the auto-picked header icon. */
  icon?: 'danger' | 'warning' | 'question' | 'edit'
}

const ICONS = {
  danger: Trash2,
  warning: AlertTriangle,
  question: HelpCircle,
  edit: Pencil
} as const

/** Header icon glyph + circle tint, derived from danger/editable unless overridden. */
function resolveIcon(data: ConfirmOptions) {
  const kind = data.icon ?? (data.danger ? 'danger' : data.editable ? 'edit' : 'question')
  const tint = kind === 'danger' || kind === 'warning' ? palette.destructive : palette.primary
  return { glyph: ICONS[kind], tint }
}

export interface ConfirmData extends ConfirmOptions {
  id: number
  /** Resolves the awaiting caller. For editable dialogs, value carries the input text. */
  resolve: (result: { confirmed: boolean; value?: string }) => void
}

export function ConfirmDialog({ data }: { data: ConfirmData }) {
  const [entered, setEntered] = useState(false)
  const [value, setValue] = useState(data.defaultValue ?? '')

  useEffect(() => {
    requestAnimationFrame(() => setEntered(true))
  }, [])

  const close = (confirmed: boolean) => {
    setEntered(false)
    const payload = confirmed && data.editable ? { confirmed, value: value.trim() } : { confirmed }
    setTimeout(() => data.resolve(payload), 200)
  }

  const { glyph, tint } = resolveIcon(data)
  const isDanger = data.danger || data.icon === 'danger' || data.icon === 'warning'

  return (
    <View className={`cdialog-overlay ${entered ? 'cdialog-overlay--enter' : ''}`} catchMove>
      <View className={`cdialog ${entered ? 'cdialog--enter' : ''}`}>
        <View className='cdialog__body'>
          <View className={`cdialog__icon ${isDanger ? 'cdialog__icon--danger' : 'cdialog__icon--primary'}`}>
            <AppIcon icon={glyph} size={26} color={tint} strokeWidth={2} />
          </View>
          <Text className='cdialog__title'>{data.title}</Text>
          {data.content && <Text className='cdialog__content'>{data.content}</Text>}
          {data.editable && (
            <Input
              className='cdialog__input'
              value={value}
              placeholder={data.placeholder}
              placeholderClass='cdialog__input-ph'
              onInput={(e) => setValue(e.detail.value)}
              focus
            />
          )}
        </View>
        <View className='cdialog__actions'>
          <Button className='cdialog__btn cdialog__btn--cancel tap' hoverClass='tap--pressed' onClick={() => close(false)}>
            {data.cancelText ?? '取消'}
          </Button>
          <Button
            className={`cdialog__btn ${data.danger ? 'cdialog__btn--danger' : 'cdialog__btn--confirm'} tap`}
            hoverClass='tap--pressed'
            onClick={() => close(true)}
          >
            {data.confirmText ?? '确认'}
          </Button>
        </View>
      </View>
    </View>
  )
}
