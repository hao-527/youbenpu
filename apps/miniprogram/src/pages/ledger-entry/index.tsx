import { goBack } from '../../utils/navigation'
import { DesignIntro } from '../../components/design-intro'
import { Button, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Calendar, ChevronDown, Trash2 } from 'lucide'
import { useEffect, useMemo, useRef, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { ChipSelect } from '../../components/chip-select'
import { DatePicker } from '../../components/date-picker'
import { useConfirm, useToast } from '../../components/feedback'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { useAppShare } from '../../hooks/use-app-share'
import { useDispatch, useStore, useRemoteStatus } from '../../store'
import { useOperation } from '../../hooks/use-operation'
import { uid } from '../../store/uid'
import { palette } from '../../theme/palette'
import type { LedgerEntry, TransactionType } from '../../types/domain'
import { formatLocalDate, getPreviousDate } from '../../utils/date'

import './index.scss'

function createTimeLabel(date: string, today: string) {
  if (date === today) {
    const now = new Date()
    return `今天 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }
  if (date === getPreviousDate(today)) return '昨天'
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
}

function getDateDisplayLabel(date: string, today: string) {
  if (date === today) return '今天'
  if (date === getPreviousDate(today)) return '昨天'
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`
}

export default function LedgerEntryPage() {
  const { ledger, members, familyId, currentMemberId } = useStore()
  const dispatch = useDispatch()
  const remote = useRemoteStatus()
  const submission = useOperation()
  const upload = useOperation()
  const confirm = useConfirm()
  const toast = useToast()
  useAppShare()
  const params = Taro.getCurrentInstance().router?.params
  const entryId = params?.id
  const editingEntry = entryId ? ledger.find((entry) => entry.id === entryId) : undefined
  const today = formatLocalDate()
  const currentMemberName = members.find((member) => member.id === currentMemberId)?.displayName ?? ''
  const memberNames = useMemo(() => members.map((member) => member.displayName), [members])
  const purposeOptions = useMemo(() => {
    const seen = new Set<string>()
    const values: string[] = []

    for (const entry of ledger) {
      const value = entry.purpose.trim()
      const key = value.toLocaleLowerCase()
      if (!value || seen.has(key)) continue
      seen.add(key)
      values.push(value)
      if (values.length >= 12) break
    }

    const currentPurpose = editingEntry?.purpose.trim() ?? ''
    if (currentPurpose && !seen.has(currentPurpose.toLocaleLowerCase())) {
      values.unshift(currentPurpose)
    }

    return values.map((value) => ({ label: value, value }))
  }, [editingEntry?.purpose, ledger])

  const [type, setType] = useState<TransactionType>(editingEntry?.type ?? 'expense')
  const [amount, setAmount] = useState(editingEntry ? (editingEntry.amountCents / 100).toFixed(2).replace(/\.00$/, '') : '')
  const [purpose, setPurpose] = useState(editingEntry?.purpose ?? '')
  const [memberName, setMemberName] = useState(editingEntry?.memberName ?? currentMemberName)
  const [date, setDate] = useState(editingEntry?.date ?? today)
  const [note, setNote] = useState(editingEntry?.note ?? '')
  const filteredPurposeOptions = useMemo(() => {
    const keyword = purpose.trim().toLocaleLowerCase()
    if (!keyword) return purposeOptions
    return purposeOptions.filter((option) => option.value.toLocaleLowerCase().includes(keyword))
  }, [purpose, purposeOptions])

  const [visibility, setVisibility] = useState<LedgerEntry['noteVisibility']>(editingEntry?.noteVisibility ?? 'shared')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showPurposeSuggestions, setShowPurposeSuggestions] = useState(false)


  const hydratedId = useRef<string | null>(null)
  useEffect(() => {
    if (!entryId || !editingEntry || hydratedId.current === entryId) return
    hydratedId.current = entryId
    setType(editingEntry.type)
    setAmount((editingEntry.amountCents / 100).toFixed(2))
    setPurpose(editingEntry.purpose)
    setMemberName(editingEntry.memberName)
    setDate(editingEntry.date)
    setNote(editingEntry.note ?? '')
    setVisibility(editingEntry.noteVisibility)
  }, [entryId, editingEntry])

  useEffect(() => {
    if (!entryId && !memberName && currentMemberName) setMemberName(currentMemberName)
  }, [entryId, memberName, currentMemberName])

  const submit = async () => {
    if (submission.busy || upload.busy || editingEntry?.canEdit === false) return
    if (!familyId) { Taro.showToast({ title: '请先创建或加入家庭', icon: 'none' }); return }
    const normalizedAmount = amount.trim()
    const normalizedPurpose = purpose.trim()
    if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(normalizedAmount) || Number(normalizedAmount) <= 0) {
      Taro.showToast({ title: '请输入正确金额，最多两位小数', icon: 'none' })
      return
    }
    if (!normalizedPurpose) {
      Taro.showToast({ title: '请填写用途', icon: 'none' })
      return
    }
    if (!memberName || !memberNames.includes(memberName)) {
      Taro.showToast({ title: '请选择有效成员', icon: 'none' })
      return
    }

    const entry: LedgerEntry = {
      id: editingEntry?.id ?? uid('l-'),
      familyId,
      type,
      amountCents: Math.round(Number(normalizedAmount) * 100),
      purpose: normalizedPurpose.slice(0, 40),
      memberName,
      date,
      timeLabel: editingEntry?.date === date ? editingEntry.timeLabel : createTimeLabel(date, today),
      note: note.trim() || undefined,
      noteVisibility: visibility,
      // Manual entries always count; editing an imported entry keeps its flag.
      countsTowardTotal: editingEntry?.countsTowardTotal ?? true
    }
    const succeeded = await submission.run(() => dispatch(editingEntry ? { type: 'ledger/update', entry } : { type: 'ledger/add', entry }), '提交失败，已保留内容，请重试', true)
    if (!succeeded) return
    Taro.showToast({ title: editingEntry ? '记录已更新' : '已记一笔', icon: 'success' })
    setTimeout(() => goBack('/pages/ledger/index'), 350)
  }

  const deleteEntry = async () => {
    if (!editingEntry || submission.busy || editingEntry.canEdit === false) return
    const { confirmed } = await confirm({
      title: '删除这笔记录？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      danger: true
    })
    if (!confirmed) return
    const succeeded = await submission.run(() => dispatch({ type: 'ledger/delete', id: editingEntry.id }), '删除失败，请重试', true)
    if (!succeeded) return
    toast('记录已删除', 'success')
    setTimeout(() => goBack('/pages/ledger/index'), 350)
  }

  if (entryId && !editingEntry && (remote.loading || !remote.ready)) {
    return <PageShell className='ledger-entry-page' tabPage={false}><PageHeader title='加载记录' /><View className='empty-state'><Text>{remote.loading ? '正在加载，请稍候' : '请重试加载后查看记录'}</Text></View></PageShell>
  }

  if (entryId && !editingEntry) {
    return (
      <PageShell className='ledger-entry-page' tabPage={false}>
        <PageHeader title='收支记录' />
        <View className='empty-state surface-card'>
          <Text className='empty-state__title'>记录不存在</Text>
          <Text className='empty-state__copy'>这笔记录可能已经被删除。</Text>
        </View>
      </PageShell>
    )
  }

  if (editingEntry?.canEdit === false) {
    return <PageShell className='ledger-entry-page' tabPage={false}>
      <PageHeader title='收支记录' subtitle='这笔记录的备注仅记录人可见' />
      <View className='surface-card form-page'>
        <Text className='section-title'>{editingEntry.purpose}</Text>
        <Text className={`ledger-entry-amount ledger-entry-readonly-amount num ${editingEntry.type === 'income' ? 'ledger-entry-readonly-amount--income' : ''}`}>¥ {(editingEntry.amountCents / 100).toFixed(2)}</Text>
        <Text>{editingEntry.type === 'income' ? '收入' : '支出'} · {editingEntry.memberName} · {editingEntry.date}</Text>
        <Text className='field__hint'>你可以查看金额和用途。仅记录人可以修改或删除这笔私有记录。</Text>
      </View>
    </PageShell>
  }

  return (
    <PageShell className='ledger-entry-page' tabPage={false} withFixedBar>
      <PageHeader title={editingEntry ? '编辑记录' : '记一笔'} subtitle='金额和用途为必填项' />
      <DesignIntro kind='entry'></DesignIntro>

      <View className='ledger-entry-card ledger-entry-form form-page'>


        <View className='field ledger-entry-field ledger-entry-field--amount'>
        <View className='segmented-control ledger-entry-type-switch'>
          <Button className={`segmented-control__item tap ${type === 'expense' ? 'segmented-control__item--active ledger-entry-type--expense' : ''}`} hoverClass='tap--pressed' onClick={() => setType('expense')}>支出</Button>
          <Button className={`segmented-control__item tap ${type === 'income' ? 'segmented-control__item--active ledger-entry-type--income' : ''}`} hoverClass='tap--pressed' onClick={() => setType('income')}>收入</Button>
        </View>
          <Text className='field__label'>金额</Text>
          <View className={`ledger-entry-amount ${type === 'income' ? 'ledger-entry-amount--income' : ''}`}>
            <Text className='ledger-entry-amount__symbol'>¥</Text>
            <Input className='ledger-entry-amount__input num' type='digit' maxlength={11} placeholder='0.00' placeholderClass='input-placeholder' value={amount} onInput={(event) => setAmount(event.detail.value)} />
          </View>
        </View>

        <View className='field ledger-entry-field'>
          <Text className='field__label'>用途</Text>
          <View className={`ledger-entry-purpose ${showPurposeSuggestions ? 'ledger-entry-purpose--open' : ''}`}>
            <View className='ledger-entry-purpose__input-wrap'>
              <Input
                className='ledger-entry-purpose__input'
                type='text'
                maxlength={40}
                placeholder='例如：菜市场采购'
                placeholderClass='input-placeholder'
                value={purpose}
                onFocus={() => purposeOptions.length > 0 && setShowPurposeSuggestions(true)}
                onBlur={() => setTimeout(() => setShowPurposeSuggestions(false), 180)}
                onInput={(event) => {
                  setPurpose(event.detail.value)
                  setShowPurposeSuggestions(purposeOptions.length > 0)
                }}
              />
              {purposeOptions.length > 0 && <AppIcon icon={ChevronDown} size={16} color={palette.subtleForeground} />}
            </View>
            {showPurposeSuggestions && filteredPurposeOptions.length > 0 && (
              <View className='ledger-entry-purpose__suggestions'>
                {filteredPurposeOptions.map((option) => (
                  <Button
                    key={option.value}
                    className='ledger-entry-purpose__option tap'
                    hoverClass='tap--pressed'
                    onClick={() => {
                      setPurpose(option.value)
                      setShowPurposeSuggestions(false)
                    }}
                  >
                    <Text>{option.label}</Text>
                  </Button>
                ))}
              </View>
            )}
          </View>
        </View>

        <View className='field ledger-entry-field'>
          <Text className='field__label'>成员</Text>
          <ChipSelect options={memberNames} value={memberName} onChange={setMemberName} />
        </View>

        <View className='field ledger-entry-field'>
          <Text className='field__label'>日期</Text>
          <Button className='field__control field__control--picker tap' hoverClass='tap--pressed' onClick={() => setShowDatePicker(true)}>
            <Text className='num'>{getDateDisplayLabel(date, today)}</Text>
            <AppIcon icon={Calendar} size={16} color={palette.subtleForeground} />
          </Button>
        </View>

        <View className='field ledger-entry-field'>
          <Text className='field__label'>备注 <Text className='field__optional'>选填</Text></Text>
          <Textarea className='field__control field__control--textarea' maxlength={120} placeholder='补充这笔收支的说明' placeholderClass='input-placeholder' value={note} onInput={(event) => setNote(event.detail.value)} />
        </View>

        <View className='field ledger-entry-field'>
          <Text className='field__label'>备注可见范围</Text>
          <View className='segmented-control'>
            <Button className={`segmented-control__item tap ${visibility === 'shared' ? 'segmented-control__item--active' : ''}`} hoverClass='tap--pressed' onClick={() => setVisibility('shared')}>家庭可见</Button>
            <Button className={`segmented-control__item tap ${visibility === 'private' ? 'segmented-control__item--active' : ''}`} hoverClass='tap--pressed' onClick={() => setVisibility('private')}>仅自己</Button>
          </View>
          <Text className='field__optional'>仅自己只隐藏备注，金额和用途仍对家庭可见。</Text>
        </View>
      </View>

      {editingEntry && (
        <Button className='danger-action ledger-entry-delete tap' hoverClass='tap--pressed' disabled={submission.busy} onClick={deleteEntry}>
          <AppIcon icon={Trash2} size={17} color={palette.destructive} />
          <Text>删除这笔记录</Text>
        </Button>
      )}

      {submission.error && <View className='surface-card form-error'><Text>{submission.error}</Text></View>}
      <View className='fixed-action-bar'>
        <Button className='button button--primary tap' hoverClass='tap--pressed' disabled={submission.busy || upload.busy || !familyId} loading={submission.busy || upload.busy} onClick={submit}>
          {editingEntry ? '保存修改' : '确认记录'}
        </Button>
      </View>

      <DatePicker
        open={showDatePicker}
        value={date}
        max={today}
        onSelect={setDate}
        onClose={() => setShowDatePicker(false)}
      />

    </PageShell>
  )
}
