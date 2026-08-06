import { Button, Text, View } from '@tarojs/components'

import './index.scss'

interface ChipSelectProps {
  options: string[]
  value: string
  onChange: (value: string) => void
  /** Allow wrapping to multiple lines (default: true) */
  wrap?: boolean
}

/**
 * Inline chip selector for small option sets (2-8 items).
 * Replaces native Picker for categories, members, etc.
 */
export function ChipSelect({ options, value, onChange, wrap = true }: ChipSelectProps) {
  return (
    <View className={`chip-select ${wrap ? 'chip-select--wrap' : ''}`}>
      {options.map((option) => (
        <Button
          key={option}
          className={`chip-select__item tap ${option === value ? 'chip-select__item--active' : ''}`}
          hoverClass='tap--pressed'
          onClick={() => onChange(option)}
        >
          <Text>{option}</Text>
        </Button>
      ))}
    </View>
  )
}
