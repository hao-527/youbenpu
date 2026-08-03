import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide'
import { useCallback, useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { useDispatch, useStore } from '../../store'
import { uid } from '../../store/uid'
import { palette } from '../../theme/palette'
import type { LedgerEntry, TransactionType } from '../../types/domain'
import { formatYuan } from '../../utils/money'

import './index.scss'

function getMonthLabel(year: number, month: number) {
  return `${year}年${month}月`
}

function getDateLabel(date: string, today: string, yesterday: string) {
  if (date === today) return '今天'
  if (date === yesterday) return '昨天'
  return date.slice(5).replace('-', '月') + '日'
}

function groupByDate(entries: LedgerEntry[], today: string, yesterday: string) {
  const groups: Array<{ date: string; label: string; entries: LedgerEntry[] }> = []
  const map = new Map<string, LedgerEntry[]>()
  for (const entry of entries) {
    const existing = map.get(entry.date)
    if (existing) { existing.push(entry) }
    else {
      const list = [entry]
      map.set(entry.date, list)
      groups.push({ date: entry.date, label: getDateLabel(entry.date, today, yesterday), entries: list })
    }
  }
  return groups
}

export default function LedgerPage() {
  const { ledger, members, familyId } = useStore()
  const dispatch = useDispatch()

  // Month navigation
  const [viewYear, setViewYear] = useState(2026)
  const [viewMonth, setViewMonth] = useState(8)
  const [memberFilter, setMemberFilter] = useState<string>('全部')
  const [showMemberMenu, setShowMemberMenu] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formType, setFormType] = useState<TransactionType>('expense')
  const [formAmount, setFormAmount] = useState('')
  const [formPurpose, setFormPurpose] = useState('')
  const [formDate, setFormDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  const monthPrefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
  const today = '2026-08-03'
  const yesterday = '2026-08-02'

  const filteredEntries = useMemo(() => {
    return ledger.filter((e) => {
      const inMonth = e.date.startsWith(monthPrefix)
      const inMember = memberFilter === '全部' || e.memberName === memberFilter
      return inMonth && inMember
    })
  }, [ledger, monthPrefix, memberFilter])

  const summary = useMemo(() => {
    let income = 0
    let expense = 0
    for (const e of filteredEntries) {
      if (e.type === 'income') income += e.amountCents
      else expense += e.amountCents
    }
    return { incomeCents: income, expenseCents: expense, balanceCents: income - expense }
  }, [filteredEntries])

  const grouped = useMemo(() => groupByDate(filteredEntries, today, yesterday), [filteredEntries])

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12) }
    else setViewMonth(viewMonth - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1) }
    else setViewMonth(viewMonth + 1)
  }

  const memberOptions = useMemo(() => ['全部', ...members.map((m) => m.displayName)], [members])

  const submitEntry = useCallback(() => {
    const cents = Math.round(parseFloat(formAmount) * 100)
    if (!cents || cents <= 0 || !formPurpose.trim()) {
      Taro.showToast({ title: '请填写金额和用途', icon: 'none' })
      return
    }
    const entry: LedgerEntry = {
      id: uid('l-'),
      familyId,
      type: formType,
      amountCents: cents,
      purpose: formPurpose.trim(),
      memberName: '我',
      date: formDate,
      timeLabel: formDate === today ? '刚刚' : formDate.slice(5).replace('-', '月') + '日',
      noteVisibility: 'shared'
    }
    dispatch({ type: 'ledger/add', entry })
    setShowForm(false)
    setFormAmount('')
    setFormPurpose('')
    Taro.showToast({ title: '已记录', icon: 'success' })
  }, [formAmount, formPurpose, formDate, formType, familyId, dispatch])

  const deleteEntry = (id: string) => {
    Taro.showModal({
      title: '删除这笔记录？',
      content: '删除后无法恢复',
      confirmText: '删除',
      confirmColor: palette.destructive
    }).then((res) => {
      if (res.confirm) dispatch({ type: 'ledger/delete', id })
    })
  }

  return (
    <View className='page-shell'>
      {/* Month nav */}
      <View className='month-nav'>
        <Button className='month-nav__btn tap' hoverClass='tap--pressed' onClick={prevMonth}>
          <AppIcon icon={ChevronLeft} size={20} color={palette.foreground} />
        </Button>
        <Text className='month-nav__label'>{getMonthLabel(viewYear, viewMonth)}</Text>
        <Button className='month-nav__btn tap' hoverClass='tap--pressed' onClick={nextMonth}>
          <AppIcon icon={ChevronRight} size={20} color={palette.foreground} />
        </Button>
      </View>

      {/* Summary */}
      <View className='ledger-summary'>
        <View className='ledger-summary__item'>
          <Text className='ledger-summary__label'>收入</Text>
          <Text className='ledger-summary__value ledger-summary__value--income'>{formatYuan(summary.incomeCents)}</Text>
        </View>
        <View className='ledger-summary__item'>
          <Text className='ledger-summary__label'>支出</Text>
          <Text className='ledger-summary__value'>{formatYuan(summary.expenseCents)}</Text>
        </View>
        <View className='ledger-summary__item'>
          <Text className='ledger-summary__label'>结余</Text>
          <Text className='ledger-summary__value ledger-summary__value--balance'>{formatYuan(summary.balanceCents)}</Text>
        </View>
      </View>

      {/* Member filter */}
      <View className='member-filter'>
        <Button
          className='member-filter__trigger tap'
          hoverClass='tap--pressed'
          onClick={() => setShowMemberMenu(!showMemberMenu)}
        >
          <Text className={memberFilter !== '全部' ? 'filter-drop__text--active' : ''}>{memberFilter}</Text>
          <AppIcon icon={ChevronDown} size={14} color={palette.subtleForeground} />
        </Button>
        {showMemberMenu && (
          <View className='member-filter__menu'>
            {memberOptions.map((opt) => (
              <Button
                key={opt}
                className={`member-filter__option tap ${memberFilter === opt ? 'period-option--active' : ''}`}
                hoverClass='tap--pressed'
                onClick={() => { setMemberFilter(opt); setShowMemberMenu(false) }}
              >
                {opt}
              </Button>
            ))}
          </View>
        )}
      </View>

      {/* Entries grouped by date */}
      {grouped.length === 0 && <View className='list__empty'>该月暂无记录</View>}
      {grouped.map((group) => (
        <View key={group.date} className='section'>
          <View className='section__head'>
            <Text className='section__title'>{group.label}</Text>
          </View>
          <View className='list'>
            {group.entries.map((entry) => (
              <View key={entry.id} className='list__row'>
                <View className={`icon-bubble ${entry.type === 'income' ? 'icon-bubble--green' : 'icon-bubble--primary'}`}>
                  <AppIcon
                    icon={entry.type === 'income' ? ArrowDownLeft : ArrowUpRight}
                    size={18}
                    color={entry.type === 'income' ? palette.success : palette.primary}
                  />
                </View>
                <View className='list__body'>
                  <Text className='list__title'>{entry.purpose}</Text>
                  <Text className='list__meta'>{entry.memberName} · {entry.timeLabel}</Text>
                </View>
                <Text className={`list__value ${entry.type === 'income' ? 'ledger-income' : ''}`}>
                  {entry.type === 'income' ? '+' : '-'}{formatYuan(entry.amountCents).slice(1)}
                </Text>
                <Button className='tap' hoverClass='tap--pressed' onClick={() => deleteEntry(entry.id)}>
                  <AppIcon icon={Trash2} size={16} color={palette.subtleForeground} />
                </Button>
              </View>
            ))}
          </View>
        </View>
      ))}

      {/* Add form overlay */}
      {showForm && (
        <View className='form-overlay' onClick={() => setShowForm(false)}>
          <View className='form-sheet' onClick={(e) => e.stopPropagation()}>
            <Text className='form-sheet__title'>记一笔</Text>

            <View className='form-type-toggle'>
              <Button
                className={`form-type-btn tap ${formType === 'expense' ? 'form-type-btn--active' : ''}`}
                hoverClass='tap--pressed'
                onClick={() => setFormType('expense')}
              >
                支出
              </Button>
              <Button
                className={`form-type-btn tap ${formType === 'income' ? 'form-type-btn--active-income' : ''}`}
                hoverClass='tap--pressed'
                onClick={() => setFormType('income')}
              >
                收入
              </Button>
            </View>

            <Input
              className='form-input'
              type='digit'
              placeholder='金额'
              value={formAmount}
              onInput={(e) => setFormAmount(e.detail.value)}
            />
            <Input
              className='form-input'
              type='text'
              placeholder='用途'
              value={formPurpose}
              onInput={(e) => setFormPurpose(e.detail.value)}
            />
            <Picker mode='date' value={formDate} onChange={(e) => setFormDate(e.detail.value)}>
              <View className='form-input form-input--picker'>
                <Text>{formDate}</Text>
              </View>
            </Picker>

            <Button className='button button--primary tap form-submit' hoverClass='tap--pressed' onClick={submitEntry}>
              确认
            </Button>
          </View>
        </View>
      )}

      <View className='button-bar'>
        <Button
          className='button button--primary tap'
          hoverClass='tap--pressed'
          onClick={() => setShowForm(true)}
        >
          <AppIcon icon={Plus} size={20} color='#FFFFFF' />
          记一笔
        </Button>
      </View>
    </View>
  )
}
