import { Button, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { ArrowDownLeft, ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, Plus, Users } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageShell } from '../../components/page-shell'
import { useStore } from '../../store'
import { palette } from '../../theme/palette'
import type { LedgerEntry } from '../../types/domain'
import { formatLocalDate, getPreviousDate } from '../../utils/date'
import { formatYuan } from '../../utils/money'

import './index.scss'

function getMonthLabel(year: number, month: number) {
  return `${year}年${month}月`
}

function getDateLabel(date: string, today: string, yesterday: string) {
  if (date === today) return '今天'
  if (date === yesterday) return '昨天'
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
}

function groupByDate(entries: LedgerEntry[], today: string, yesterday: string) {
  const groups: Array<{ date: string; label: string; entries: LedgerEntry[] }> = []
  const map = new Map<string, LedgerEntry[]>()
  entries.forEach((entry) => {
    const existing = map.get(entry.date)
    if (existing) existing.push(entry)
    else {
      const list = [entry]
      map.set(entry.date, list)
      groups.push({ date: entry.date, label: getDateLabel(entry.date, today, yesterday), entries: list })
    }
  })
  return groups
}

export default function LedgerPage() {
  const { ledger, members } = useStore()
  const now = new Date()
  const today = formatLocalDate(now)
  const yesterday = getPreviousDate(today)
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [memberFilter, setMemberFilter] = useState('全部')

  const monthPrefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
  const memberOptions = useMemo(() => ['全部', ...members.map((member) => member.displayName)], [members])
  const filteredEntries = useMemo(() => ledger
    .filter((entry) => entry.date.startsWith(monthPrefix)
      && (memberFilter === '全部' || entry.memberName === memberFilter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.timeLabel.localeCompare(a.timeLabel)), [ledger, memberFilter, monthPrefix])

  const summary = useMemo(() => filteredEntries.reduce((result, entry) => {
    if (entry.type === 'income') result.incomeCents += entry.amountCents
    else result.expenseCents += entry.amountCents
    result.balanceCents = result.incomeCents - result.expenseCents
    return result
  }, { incomeCents: 0, expenseCents: 0, balanceCents: 0 }), [filteredEntries])
  const grouped = useMemo(() => groupByDate(filteredEntries, today, yesterday), [filteredEntries, today, yesterday])

  /** 成员支出小计：本月各成员的支出金额（排除收入） */
  const memberStats = useMemo(() => members.map((member) => {
    const expenseCents = filteredEntries
      .filter((entry) => entry.memberName === member.displayName && entry.type === 'expense')
      .reduce((sum, entry) => sum + entry.amountCents, 0)
    return { name: member.displayName, expenseCents }
  }).filter((item) => item.expenseCents > 0), [filteredEntries, members])

  const currentMonthIndex = now.getFullYear() * 12 + now.getMonth()
  const viewMonthIndex = viewYear * 12 + viewMonth - 1
  const isCurrentMonth = viewMonthIndex >= currentMonthIndex

  const moveMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth - 1 + delta, 1)
    const nextIndex = next.getFullYear() * 12 + next.getMonth()
    if (nextIndex > currentMonthIndex) return
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth() + 1)
  }

  return (
    <PageShell withFab>
      <View className='page-title'>
        <View>
          <Text className='page-title__text'>账本</Text>
          <Text className='page-title__subtitle'>{memberFilter === '全部' ? '全家收支' : `${memberFilter}的收支`}</Text>
        </View>
        {/* Secondary filter, so it lives in the title row rather than taking
            a full toolbar row of its own. */}
        <Picker
          mode='selector'
          range={memberOptions}
          value={Math.max(0, memberOptions.indexOf(memberFilter))}
          onChange={(event) => setMemberFilter(memberOptions[Number(event.detail.value)] ?? '全部')}
        >
          <View className='ledger-member-filter tap' hoverClass='tap--pressed' hoverStayTime={100}>
            <AppIcon icon={Users} size={15} color={palette.subtleForeground} />
            <Text className='ledger-member-filter__label'>{memberFilter}</Text>
            <AppIcon icon={ChevronDown} size={14} color={palette.subtleForeground} />
          </View>
        </Picker>
      </View>

      <View className='month-nav'>
        <Button className='month-nav__btn tap' hoverClass='tap--pressed' aria-label='上一个月' onClick={() => moveMonth(-1)}>
          <AppIcon icon={ChevronLeft} size={20} color={palette.foreground} />
        </Button>
        <Text className='month-nav__label num'>{getMonthLabel(viewYear, viewMonth)}</Text>
        <Button className='month-nav__btn tap' hoverClass='tap--pressed' disabled={isCurrentMonth} aria-label='下一个月' onClick={() => moveMonth(1)}>
          <AppIcon icon={ChevronRight} size={20} color={isCurrentMonth ? palette.disabledForeground : palette.foreground} />
        </Button>
      </View>

      <View className='ledger-overview surface-card'>
        <Text className='ledger-overview__label'>本月结余</Text>
        <Text className={`ledger-overview__balance num ${summary.balanceCents < 0 ? 'ledger-overview__balance--negative' : ''}`}>{formatYuan(summary.balanceCents)}</Text>
        <View className='ledger-overview__metrics'>
          <View className='ledger-overview__metric'>
            <Text className='ledger-overview__metric-label'>收入</Text>
            <Text className='ledger-overview__metric-value num ledger-overview__metric-value--income'>{formatYuan(summary.incomeCents)}</Text>
          </View>
          <View className='ledger-overview__divider' />
          <View className='ledger-overview__metric'>
            <Text className='ledger-overview__metric-label'>支出</Text>
            <Text className='ledger-overview__metric-value num'>{formatYuan(summary.expenseCents)}</Text>
          </View>
        </View>
      </View>

      {memberStats.length > 0 && (
        <View className='ledger-member-stats surface-card'>
          <View className='ledger-member-stats__head'>
            <Text className='ledger-member-stats__title'>本月支出</Text>
            <Text className='ledger-member-stats__meta'>按成员</Text>
          </View>
          <View className='ledger-member-stats__rows'>
            {memberStats.map((item) => (
              <View key={item.name} className='ledger-member-stat'>
                <Text className='ledger-member-stat__name'>{item.name}</Text>
                <Text className='ledger-member-stat__amount num'>{formatYuan(item.expenseCents)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {grouped.length === 0 ? (
        <View className='empty-state surface-card'>
          <Text className='empty-state__title'>这个月还没有记录</Text>
          <Text className='empty-state__copy'>{memberFilter === '全部' ? '记录第一笔家庭收支，月底更清楚钱花在哪里。' : '当前成员在这个月没有收支记录。'}</Text>
          <Button className='button button--outline empty-state__action tap' hoverClass='tap--pressed' onClick={() => Taro.navigateTo({ url: '/pages/ledger-entry/index' })}>
            记一笔
          </Button>
        </View>
      ) : grouped.map((group) => (
        <View key={group.date} className='section ledger-day'>
          <View className='section__head ledger-day__head'>
            <Text className='section__title'>{group.label}</Text>
            <Text className='section__meta'>{group.entries.length} 笔</Text>
          </View>
          <View className='ledger-list surface-card'>
            {group.entries.map((entry) => (
              <Button
                key={entry.id}
                className='ledger-row tap tap-row'
                hoverClass='tap--pressed'
                aria-label={`${entry.purpose}，${entry.type === 'income' ? '收入' : '支出'}${formatYuan(entry.amountCents)}`}
                onClick={() => Taro.navigateTo({ url: `/pages/ledger-entry/index?id=${entry.id}` })}
              >
                <View className={`icon-bubble ${entry.type === 'income' ? 'icon-bubble--green' : 'icon-bubble--primary'}`}>
                  <AppIcon icon={entry.type === 'income' ? ArrowDownLeft : ArrowUpRight} size={18} color={entry.type === 'income' ? palette.success : palette.primary} />
                </View>
                <View className='ledger-row__body'>
                  <Text className='ledger-row__title'>{entry.purpose}</Text>
                  <View className='ledger-row__meta-line'>
                    <Text className='ledger-row__meta'>{entry.memberName} · {entry.timeLabel}</Text>
                    {entry.orderId && (
                      <View className='ledger-row__tags'>
                        <Text className='ledger-row__tag ledger-row__tag--order'>点餐</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View className='ledger-row__amount-wrap'>
                  <Text className={`ledger-row__amount num ${entry.type === 'income' ? 'ledger-row__amount--income' : ''}`}>
                    {entry.type === 'income' ? '+' : '-'}{formatYuan(entry.amountCents).slice(1)}
                  </Text>
                  <AppIcon icon={ChevronRight} size={15} color={palette.subtleForeground} />
                </View>
              </Button>
            ))}
          </View>
        </View>
      ))}

      <Button
        className='fab tap'
        hoverClass='tap--pressed'
        aria-label='记一笔'
        onClick={() => Taro.navigateTo({ url: '/pages/ledger-entry/index' })}
      >
        <AppIcon icon={Plus} size={17} color={palette.onPrimary} />
        <Text>记一笔</Text>
      </Button>
    </PageShell>
  )
}
