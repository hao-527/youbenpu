import { Button, Text, View } from '@tarojs/components'
import { ChevronLeft, ChevronRight } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../app-icon'
import { ActionSheet } from '../action-sheet'
import { palette } from '../../theme/palette'

import './index.scss'

interface DatePickerProps {
  open: boolean
  value: string // YYYY-MM-DD or ''
  /** Max selectable date (YYYY-MM-DD). Defaults to today. */
  max?: string
  /** Min selectable date (YYYY-MM-DD). */
  min?: string
  /** Allow clearing the date */
  clearable?: boolean
  onSelect: (date: string) => void
  onClear?: () => void
  onClose: () => void
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterday() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay()
}

export function DatePicker({ open, value, max, min, clearable, onSelect, onClear, onClose }: DatePickerProps) {
  const maxDate = max ?? today()
  const todayStr = today()
  const yesterdayStr = yesterday()

  const initialYear = value ? Number(value.slice(0, 4)) : new Date().getFullYear()
  const initialMonth = value ? Number(value.slice(5, 7)) : new Date().getMonth() + 1

  const [viewYear, setViewYear] = useState(initialYear)
  const [viewMonth, setViewMonth] = useState(initialMonth)

  const days = useMemo(() => {
    const totalDays = getDaysInMonth(viewYear, viewMonth)
    const firstDay = getFirstDayOfWeek(viewYear, viewMonth)
    const cells: Array<{ day: number; date: string; disabled: boolean } | null> = []

    // leading empty cells
    for (let i = 0; i < firstDay; i++) cells.push(null)

    for (let d = 1; d <= totalDays; d++) {
      const date = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const disabled = date > maxDate || (min ? date < min : false)
      cells.push({ day: d, date, disabled })
    }
    return cells
  }, [viewYear, viewMonth, maxDate, min])

  const canGoNext = (() => {
    const nextMonth = viewMonth === 12 ? 1 : viewMonth + 1
    const nextYear = viewMonth === 12 ? viewYear + 1 : viewYear
    const firstOfNext = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
    return firstOfNext <= maxDate
  })()

  const moveMonth = (delta: number) => {
    let y = viewYear
    let m = viewMonth + delta
    if (m < 1) { m = 12; y-- }
    if (m > 12) { m = 1; y++ }
    setViewYear(y)
    setViewMonth(m)
  }

  const selectDate = (date: string) => {
    onSelect(date)
    onClose()
  }

  // Shortcuts
  const shortcuts: Array<{ label: string; date: string }> = []
  if (todayStr <= maxDate && (!min || todayStr >= min)) {
    shortcuts.push({ label: '今天', date: todayStr })
  }
  if (yesterdayStr <= maxDate && (!min || yesterdayStr >= min)) {
    shortcuts.push({ label: '昨天', date: yesterdayStr })
  }

  return (
    <ActionSheet open={open} title='选择日期' onClose={onClose}>
      {shortcuts.length > 0 && (
        <View className='dp-shortcuts'>
          {shortcuts.map((s) => (
            <Button
              key={s.label}
              className={`dp-shortcut tap ${value === s.date ? 'dp-shortcut--active' : ''}`}
              hoverClass='tap--pressed'
              onClick={() => selectDate(s.date)}
            >
              {s.label}
            </Button>
          ))}
          {clearable && value && (
            <Button className='dp-shortcut dp-shortcut--clear tap' hoverClass='tap--pressed' onClick={() => { onClear?.(); onClose() }}>
              清除
            </Button>
          )}
        </View>
      )}

      <View className='dp-nav'>
        <Button className='dp-nav__btn tap' hoverClass='tap--pressed' onClick={() => moveMonth(-1)}>
          <AppIcon icon={ChevronLeft} size={18} color={palette.foreground} />
        </Button>
        <Text className='dp-nav__label'>{viewYear}年{viewMonth}月</Text>
        <Button className='dp-nav__btn tap' hoverClass='tap--pressed' disabled={!canGoNext} onClick={() => moveMonth(1)}>
          <AppIcon icon={ChevronRight} size={18} color={canGoNext ? palette.foreground : palette.disabledForeground} />
        </Button>
      </View>

      <View className='dp-weekdays'>
        {WEEKDAYS.map((w) => <Text key={w} className='dp-weekday'>{w}</Text>)}
      </View>

      <View className='dp-grid'>
        {days.map((cell, idx) => {
          if (!cell) return <View key={`e${idx}`} className='dp-cell dp-cell--empty' />
          const isSelected = cell.date === value
          const isToday = cell.date === todayStr
          return (
            <Button
              key={cell.date}
              className={`dp-cell tap ${isSelected ? 'dp-cell--selected' : ''} ${isToday && !isSelected ? 'dp-cell--today' : ''} ${cell.disabled ? 'dp-cell--disabled' : ''}`}
              hoverClass={cell.disabled ? '' : 'tap--pressed'}
              disabled={cell.disabled}
              onClick={() => selectDate(cell.date)}
            >
              <Text className='dp-cell__day'>{cell.day}</Text>
            </Button>
          )
        })}
      </View>
    </ActionSheet>
  )
}
