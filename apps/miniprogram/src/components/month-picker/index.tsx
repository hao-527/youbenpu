import { Button, Text, View } from '@tarojs/components'
import { ChevronLeft, ChevronRight } from 'lucide'
import { useState } from 'react'

import { AppIcon } from '../app-icon'
import { ActionSheet } from '../action-sheet'
import { palette } from '../../theme/palette'

import './index.scss'

interface MonthPickerProps {
  open: boolean
  year: number
  month: number // 1-12
  /** Cannot select beyond this year/month */
  maxYear?: number
  maxMonth?: number // 1-12
  onSelect: (year: number, month: number) => void
  onClose: () => void
}

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

export function MonthPicker({ open, year, month, maxYear, maxMonth, onSelect, onClose }: MonthPickerProps) {
  const now = new Date()
  const effectiveMaxYear = maxYear ?? now.getFullYear()
  const effectiveMaxMonth = maxMonth ?? (effectiveMaxYear === now.getFullYear() ? now.getMonth() + 1 : 12)

  const [viewYear, setViewYear] = useState(year)

  const canGoNext = viewYear < effectiveMaxYear
  const canGoPrev = true // no lower bound for history

  const isDisabled = (m: number) => {
    if (viewYear > effectiveMaxYear) return true
    if (viewYear === effectiveMaxYear && m > effectiveMaxMonth) return true
    return false
  }

  const selectMonth = (m: number) => {
    onSelect(viewYear, m)
    onClose()
  }

  return (
    <ActionSheet open={open} title='选择月份' onClose={onClose}>
      <View className='mp-nav'>
        <Button className='mp-nav__btn tap' hoverClass='tap--pressed' disabled={!canGoPrev} onClick={() => setViewYear(viewYear - 1)}>
          <AppIcon icon={ChevronLeft} size={18} color={canGoPrev ? palette.foreground : palette.disabledForeground} />
        </Button>
        <Text className='mp-nav__year num'>{viewYear}年</Text>
        <Button className='mp-nav__btn tap' hoverClass='tap--pressed' disabled={!canGoNext} onClick={() => setViewYear(viewYear + 1)}>
          <AppIcon icon={ChevronRight} size={18} color={canGoNext ? palette.foreground : palette.disabledForeground} />
        </Button>
      </View>

      <View className='mp-grid'>
        {MONTHS.map((m) => {
          const disabled = isDisabled(m)
          const isSelected = viewYear === year && m === month
          return (
            <Button
              key={m}
              className={`mp-cell tap ${isSelected ? 'mp-cell--selected' : ''} ${disabled ? 'mp-cell--disabled' : ''}`}
              hoverClass={disabled ? '' : 'tap--pressed'}
              disabled={disabled}
              onClick={() => selectMonth(m)}
            >
              <Text className='mp-cell__label'>{m}月</Text>
            </Button>
          )
        })}
      </View>
    </ActionSheet>
  )
}
