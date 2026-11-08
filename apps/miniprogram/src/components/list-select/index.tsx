import { Button, Text, View } from '@tarojs/components'
import { Check, Plus } from 'lucide'

import { AppIcon } from '../app-icon'
import { ActionSheet } from '../action-sheet'
import { palette } from '../../theme/palette'


interface ListSelectOption {
  label: string
  value: string
}

interface ListSelectProps {
  open: boolean
  title?: string
  options: ListSelectOption[]
  value: string
  onSelect: (value: string) => void
  onClose: () => void
  /** When provided, a "新增" row appears at the bottom of the list. */
  addLabel?: string
  onAdd?: () => void
}

/**
 * Single-select list inside an ActionSheet.
 * Best for 4-15 options (locations, time filters, etc.)
 */
export function ListSelect({ open, title, options, value, onSelect, onClose, addLabel, onAdd }: ListSelectProps) {
  const handleSelect = (v: string) => {
    onSelect(v)
    onClose()
  }

  return (
    <ActionSheet open={open} title={title} onClose={onClose}>
      <View className='ls-list'>
        {options.map((option) => {
          const isActive = option.value === value
          return (
            <Button
              key={option.value}
              className={`ls-item tap ${isActive ? 'ls-item--active' : ''}`}
              hoverClass='tap--pressed'
              onClick={() => handleSelect(option.value)}
            >
              <Text className='ls-item__label'>{option.label}</Text>
              {isActive && <AppIcon icon={Check} size={18} color={palette.primary} />}
            </Button>
          )
        })}
        {onAdd && (
          <Button className='ls-item ls-item--add tap' hoverClass='tap--pressed' onClick={onAdd}>
            <AppIcon icon={Plus} size={16} color={palette.primary} />
            <Text className='ls-item__add-label'>{addLabel || '新增'}</Text>
          </Button>
        )}
      </View>
    </ActionSheet>
  )
}
