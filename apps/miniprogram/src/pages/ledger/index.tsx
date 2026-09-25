import { Button, Image, Text, View } from '@tarojs/components'
import { useDidShow } from '@tarojs/taro'
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Download, Plus } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { MonthPicker } from '../../components/month-picker'
import { PageShell } from '../../components/page-shell'
import { useAppShare } from '../../hooks/use-app-share'
import { navigate } from '../../utils/navigation'
import { useMaybeRefreshStore, useStore } from '../../store'
import { palette } from '../../theme/palette'
import type { LedgerEntry } from '../../types/domain'
import { formatLocalDate, getPreviousDate } from '../../utils/date'
import { formatYuan } from '../../utils/money'

import illustLedger from '../../assets/images/illustrations/ledger.svg'
import illustNote from '../../assets/images/illustrations/note.svg'

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
  const { ledger, members, currentMemberId } = useStore()
  useAppShare()
  const maybeRefresh = useMaybeRefreshStore()
  // Pull fresh family data when this tab is shown so one member sees another's
  // edits without restarting the app. Throttled inside the store.
  useDidShow(() => { void maybeRefresh() })
  const now = new Date()
  const today = formatLocalDate(now)
  const yesterday = getPreviousDate(today)
  const currentMemberName = members.find((member) => member.id === currentMemberId)?.displayName ?? ''
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)
  const [showMonthPicker, setShowMonthPicker] = useState(false)

  const monthPrefix = `${viewYear}-${String(viewMonth).padStart(2, '0')}`
  const filteredEntries = useMemo(() => ledger
    .filter((entry) => entry.date.startsWith(monthPrefix))
    .sort((a, b) => b.date.localeCompare(a.date) || b.timeLabel.localeCompare(a.timeLabel)), [ledger, monthPrefix])

  const summary = useMemo(() => filteredEntries.reduce((result, entry) => {
    // Neutral entries (imported closed/frozen/transfer rows) are shown in the
    // list for traceability but must not affect the income/expense totals.
    if (entry.countsTowardTotal === false) return result
    if (entry.type === 'income') result.incomeCents += entry.amountCents
    else result.expenseCents += entry.amountCents
    result.balanceCents = result.incomeCents - result.expenseCents
    return result
  }, { incomeCents: 0, expenseCents: 0, balanceCents: 0 }), [filteredEntries])
  const grouped = useMemo(() => groupByDate(filteredEntries, today, yesterday), [filteredEntries, today, yesterday])

  const memberStats = useMemo(() => members.map((member) => {
    const expenseCents = filteredEntries
      .filter((entry) => entry.memberName === member.displayName && entry.type === 'expense' && entry.countsTowardTotal !== false)
      .reduce((sum, entry) => sum + entry.amountCents, 0)
    return { name: member.displayName, expenseCents }
  }).filter((item) => item.expenseCents > 0), [filteredEntries, members])

  return (
    <PageShell withFab={grouped.length > 0}>
      <View className='page-title'>
        <View>
          <View className='ledger-page-title__row'>
            <Text className='page-title__text'>账本</Text>
            <Image className='ledger-page-title__illust' src={illustLedger} mode='aspectFit' />
          </View>
          <Text className='page-title__subtitle'>家庭收支</Text>
        </View>
        <Button
          className='ledger-import-entry tap'
          hoverClass='tap--pressed'
          aria-label='导入微信或支付宝账单'
          onClick={() => navigate('/pages/ledger-import/index')}
        >
          <AppIcon icon={Download} size={14} color={palette.primary} />
          <Text className='ledger-import-entry__text'>导入账单</Text>
        </Button>
      </View>

      <View className='ledger-overview surface-card'>
        <View className='ledger-overview__head'>
          <Text className='ledger-overview__label'>本月结余</Text>
          <Button className='month-nav__label ledger-overview__month tap' hoverClass='tap--pressed' onClick={() => setShowMonthPicker(true)}>
            <Text className='month-nav__text num'>{getMonthLabel(viewYear, viewMonth)}</Text>
          </Button>
        </View>
        <Text className={`ledger-overview__balance num ${summary.balanceCents < 0 ? 'ledger-overview__balance--negative' : ''} ${summary.balanceCents === 0 ? 'ledger-overview__balance--zero' : ''}`}>{formatYuan(summary.balanceCents)}</Text>
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

        {memberStats.length > 0 && (
          <View className='ledger-member-stats'>
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
      </View>

      <View className='ledger-records section'>
        <View className='section__head ledger-records__head'>
          <Text className='section__title'>最近记录</Text>
          <Text className='section__meta'>{filteredEntries.length > 0 ? `${filteredEntries.length} 笔` : '本月'}</Text>
        </View>

        {grouped.length === 0 ? (
          <View className='empty-state surface-card'>
          <Image className='ledger-empty__illust' src={illustNote} mode='aspectFit' />
            <Text className='empty-state__title'>本月还没有记录</Text>
            <Text className='empty-state__copy'>从第一笔家庭收支开始，掌握每一笔钱的去向。</Text>
            <Button className='button button--outline empty-state__action tap' hoverClass='tap--pressed' onClick={() => navigate('/pages/ledger-entry/index')}>
              记一笔
            </Button>
          </View>
        ) : grouped.map((group) => (
          <View key={group.date} className='ledger-day'>
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
                  onClick={() => navigate(`/pages/ledger-entry/index?id=${entry.id}`)}
                >
                  <View className={`icon-bubble ${entry.type === 'income' ? 'icon-bubble--green' : 'icon-bubble--primary'}`}>
                    <AppIcon icon={entry.type === 'income' ? ArrowDownLeft : ArrowUpRight} size={16} color={entry.type === 'income' ? palette.success : palette.primary} />
                  </View>
                  <View className='ledger-row__body'>
                    <View className='ledger-row__title-row'>
                      <Text className='ledger-row__title'>{entry.purpose}</Text>
                      {entry.countsTowardTotal === false && (
                        <Text className='ledger-row__tag'>未计入</Text>
                      )}
                    </View>
                    <Text className='ledger-row__meta'>{entry.memberName} · {entry.timeLabel}</Text>
                    {entry.note && (entry.noteVisibility === 'shared' || entry.memberName === currentMemberName) && (
                      <Text className='ledger-row__note'>{entry.note}</Text>
                    )}
                  </View>
                  <View className='ledger-row__amount-wrap'>
                    <Text className={`ledger-row__amount num ${entry.type === 'income' ? 'ledger-row__amount--income' : ''} ${entry.countsTowardTotal === false ? 'ledger-row__amount--neutral' : ''}`}>
                      {entry.countsTowardTotal === false ? '' : entry.type === 'income' ? '+' : '-'}{formatYuan(entry.amountCents).slice(1)}
                    </Text>
                    <AppIcon icon={ChevronRight} size={14} color={palette.subtleForeground} />
                  </View>
                </Button>
              ))}
            </View>
          </View>
        ))}
      </View>

      {grouped.length > 0 && (
        <Button
          className='fab tap'
          hoverClass='tap--pressed'
          aria-label='记一笔'
          onClick={() => navigate('/pages/ledger-entry/index')}
        >
          <AppIcon icon={Plus} size={16} color={palette.onPrimary} />
          <Text>记一笔</Text>
        </Button>
      )}

      <MonthPicker
        open={showMonthPicker}
        year={viewYear}
        month={viewMonth}
        onSelect={(y, m) => { setViewYear(y); setViewMonth(m) }}
        onClose={() => setShowMonthPicker(false)}
      />
    </PageShell>
  )
}
