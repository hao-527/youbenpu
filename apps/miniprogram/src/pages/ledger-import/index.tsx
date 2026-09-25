import { Button, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { CheckCircle, Circle, FileText, Upload } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import * as api from '../../api'
import type { ImportDraft, ImportPreview } from '../../api'
import { useRefreshStore } from '../../store'
import { palette } from '../../theme/palette'
import { formatYuan } from '../../utils/money'
import { goBack } from '../../utils/navigation'

import './index.scss'

const SOURCE_LABEL: Record<string, string> = {
  wechat: '微信支付账单',
  alipay: '支付宝账单'
}

export default function LedgerImportPage() {
  const refresh = useRefreshStore()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)

  // Import-able drafts exclude duplicates already recorded in a prior import.
  const importable = useMemo(
    () => (preview?.drafts ?? []).filter((d) => !d.duplicate),
    [preview]
  )
  const selectedList = useMemo(
    () => importable.filter((d) => selected[d.fingerprint]),
    [importable, selected]
  )
  // Only counting expenses contribute to the preview total; neutral rows
  // (closed/frozen/transfer) are recorded but excluded from the sum.
  const selectedTotalCents = useMemo(
    () => selectedList.reduce(
      (sum, d) => sum + (d.counts_toward_total && d.type === 'expense' ? d.amount_cents : 0),
      0
    ),
    [selectedList]
  )

  async function handleChooseFile() {
    if (busy) return
    try {
      const chosen = await Taro.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['csv', 'xlsx']
      })
      const file = chosen.tempFiles?.[0]
      if (!file) return

      setBusy(true)
      Taro.showLoading({ title: '解析中…' })
      const result = await api.importBill(file.path)
      // Pre-select every non-duplicate row so the common case (import all) is
      // one tap. Users uncheck what they don't want.
      const initial: Record<string, boolean> = {}
      result.drafts.forEach((d) => { if (!d.duplicate) initial[d.fingerprint] = true })
      setSelected(initial)
      setPreview(result)
    } catch (error: any) {
      // chooseMessageFile rejects with "cancel" when the user backs out.
      if (!String(error?.errMsg ?? error?.message ?? '').includes('cancel')) {
        Taro.showToast({ title: error?.message || '解析失败', icon: 'none' })
      }
    } finally {
      Taro.hideLoading()
      setBusy(false)
    }
  }

  function toggle(fingerprint: string) {
    setSelected((prev) => ({ ...prev, [fingerprint]: !prev[fingerprint] }))
  }

  function toggleAll() {
    const allSelected = selectedList.length === importable.length
    const next: Record<string, boolean> = {}
    if (!allSelected) importable.forEach((d) => { next[d.fingerprint] = true })
    setSelected(next)
  }

  async function handleConfirm() {
    if (busy || selectedList.length === 0) return
    try {
      setBusy(true)
      Taro.showLoading({ title: '导入中…' })
      const result = await api.confirmImport(selectedList.map((d) => ({
        fingerprint: d.fingerprint,
        type: d.type,
        amount_cents: d.amount_cents,
        purpose: d.purpose,
        date: d.date,
        time_label: d.time_label,
        note: d.note,
        counts_toward_total: d.counts_toward_total
      })))
      Taro.hideLoading()
      await refresh().catch(() => {})
      Taro.showToast({ title: `已导入 ${result.imported} 笔`, icon: 'success' })
      setTimeout(() => goBack('/pages/ledger/index'), 800)
    } catch (error: any) {
      Taro.hideLoading()
      Taro.showToast({ title: error?.message || '导入失败', icon: 'none' })
    } finally {
      setBusy(false)
    }
  }

  const allSelected = importable.length > 0 && selectedList.length === importable.length

  return (
    <PageShell>
      <PageHeader title='导入账单' subtitle='微信 / 支付宝' onBack={() => goBack('/pages/ledger/index')} />

      {!preview && (
        <View className='import-intro'>
          <View className='import-intro__card surface-card'>
            <View className='import-intro__steps'>
              <Text className='import-intro__title'>如何导入</Text>
              <Text className='import-intro__step'>1. 在微信/支付宝申请「交易账单」，账单文件会发到你的聊天里。</Text>
              <Text className='import-intro__step'>2. 回到这里，点下方按钮，从聊天记录中选择该账单文件。</Text>
              <Text className='import-intro__step'>3. 预览解析结果，勾选要记的账，确认导入。</Text>
              <Text className='import-intro__hint'>支持微信 xlsx、支付宝 csv。转账、退款、理财等非消费会自动跳过。</Text>
            </View>
          </View>
          <Button className='button button--primary import-choose tap' hoverClass='tap--pressed' onClick={handleChooseFile}>
            <AppIcon icon={Upload} size={16} color={palette.onPrimary} />
            <Text>从聊天选择账单文件</Text>
          </Button>
        </View>
      )}

      {preview && (
        <View className='import-result'>
          <View className='import-summary surface-card'>
            <View className='import-summary__row'>
              <AppIcon icon={FileText} size={16} color={palette.primary} />
              <Text className='import-summary__source'>{SOURCE_LABEL[preview.source] ?? '账单'}</Text>
            </View>
            <Text className='import-summary__meta'>
              共 {preview.total} 笔 · 计入收支 {preview.counted} 笔 · 仅记录 {preview.neutral} 笔
            </Text>
            <Text className='import-summary__hint'>
              退款已记为收入以抵消支出；交易关闭、押金冻结等仅保留记录，不计入收支合计。
            </Text>
            {importable.length === 0 && (
              <Text className='import-summary__empty'>没有可导入的新记录（可能都已导入过）。</Text>
            )}
          </View>

          {importable.length > 0 && (
            <View className='import-list-head'>
              <Text className='import-list-head__title'>选择要导入的记录</Text>
              <Button className='import-selectall tap' hoverClass='tap--pressed' onClick={toggleAll}>
                <Text>{allSelected ? '取消全选' : '全选'}</Text>
              </Button>
            </View>
          )}

          <View className='import-list surface-card'>
            {importable.map((draft: ImportDraft) => {
              const checked = !!selected[draft.fingerprint]
              return (
                <Button
                  key={draft.fingerprint}
                  className='import-row tap tap-row'
                  hoverClass='tap--pressed'
                  onClick={() => toggle(draft.fingerprint)}
                >
                  <AppIcon icon={checked ? CheckCircle : Circle} size={20} color={checked ? palette.primary : palette.subtleForeground} />
                  <View className='import-row__body'>
                    <View className='import-row__title-row'>
                      <Text className='import-row__purpose'>{draft.purpose}</Text>
                      {!draft.counts_toward_total && (
                        <Text className='import-row__tag'>未计入</Text>
                      )}
                    </View>
                    <Text className='import-row__meta'>{draft.date} {draft.time_label}</Text>
                  </View>
                  <Text className={`import-row__amount num ${draft.type === 'income' ? 'import-row__amount--income' : ''} ${!draft.counts_toward_total ? 'import-row__amount--neutral' : ''}`}>
                    {!draft.counts_toward_total ? '' : draft.type === 'income' ? '+' : '-'}{formatYuan(draft.amount_cents).slice(1)}
                  </Text>
                </Button>
              )
            })}
          </View>
        </View>
      )}

      {preview && importable.length > 0 && (
        <View className='import-actionbar'>
          <View className='import-actionbar__info'>
            <Text className='import-actionbar__count'>已选 {selectedList.length} 笔</Text>
            <Text className='import-actionbar__amount num'>支出 {formatYuan(selectedTotalCents)}</Text>
          </View>
          <Button
            className={`button button--primary import-actionbar__btn tap ${selectedList.length === 0 ? 'is-disabled' : ''}`}
            hoverClass='tap--pressed'
            disabled={selectedList.length === 0 || busy}
            onClick={handleConfirm}
          >
            确认导入
          </Button>
        </View>
      )}
    </PageShell>
  )
}
