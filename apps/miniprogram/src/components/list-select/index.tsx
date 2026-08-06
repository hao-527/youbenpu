import { Button, Text, View } from '@tarojs/components'
import { Check } from 'lucide'

import { AppIcon } from '../app-icon'
import { ActionSheet } from '../action-sheet'
import { palette } from '../../theme/palette'

import './index.scss'

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
}

/**
 * Single-select list inside an ActionSheet.
 * Best for 4-15 options (locations, time filters, etc.)
 */
export function ListSelect({ open, title, options, value, onSelect, onClose }: ListSelectProps) {
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
      </View>
    </ActionSheet>
  )
}
