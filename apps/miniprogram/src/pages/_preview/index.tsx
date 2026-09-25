import { Button, Text, View } from '@tarojs/components'
import { useState } from 'react'

import { PageShell } from '../../components/page-shell'
import { ActionSheet } from '../../components/action-sheet'
import { DatePicker } from '../../components/date-picker'
import { MonthPicker } from '../../components/month-picker'
import { ListSelect } from '../../components/list-select'
import { ChipSelect } from '../../components/chip-select'
import { useConfirm, useToast } from '../../components/feedback'

import './index.scss'

/**
 * Dev-only component gallery. Every self-designed popup / picker / feedback
 * component is listed here with a trigger, so the design-capture flow can open
 * each interaction state and snapshot it into Figma. Not part of the shipped
 * mini-program (guarded out of production builds).
 */

const MEMBERS = [
  { label: '妈妈', value: '妈妈' },
  { label: '爸爸', value: '爸爸' },
  { label: '我', value: '我' }
]

const CATEGORIES = ['炒菜', '汤', '凉菜', '主食', '甜品']

export default function PreviewPage() {
  const toast = useToast()
  const confirm = useConfirm()

  const [sheet, setSheet] = useState(false)
  const [datePicker, setDatePicker] = useState(false)
  const [monthPicker, setMonthPicker] = useState(false)
  const [listSelect, setListSelect] = useState(false)
  const [chip, setChip] = useState('炒菜')

  return (
    <PageShell tabPage={false} className='preview'>
      <View className='preview__header'>
        <Text className='preview__title'>组件预览</Text>
        <Text className='preview__subtitle'>自研弹窗、选择器与反馈组件</Text>
      </View>

      <View className='preview__section'>
        <Text className='preview__label'>轻提示 Toast</Text>
        <View className='preview__row'>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => toast('已记一笔', 'success')}>成功</Button>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => toast('请填写用途', 'error')}>失败</Button>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => toast('已复制', 'none')}>普通</Button>
        </View>
      </View>

      <View className='preview__section'>
        <Text className='preview__label'>确认对话框 ConfirmDialog</Text>
        <View className='preview__row'>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => confirm({ title: '确认这餐已完成？', content: '完成后会移入历史记录。', confirmText: '确认完成' })}>普通</Button>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => confirm({ title: '删除这笔记录？', content: '删除后无法恢复。', confirmText: '删除', danger: true })}>危险</Button>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => confirm({ title: '新增物品分类', editable: true, placeholder: '输入分类名称（10字内）' })}>带输入</Button>
        </View>
      </View>

      <View className='preview__section'>
        <Text className='preview__label'>选择器 Pickers</Text>
        <View className='preview__row'>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => setDatePicker(true)}>日期选择</Button>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => setMonthPicker(true)}>月份选择</Button>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => setListSelect(true)}>成员选择</Button>
          <Button className='preview__btn tap' hoverClass='tap--pressed' onClick={() => setSheet(true)}>底部弹层</Button>
        </View>
      </View>

      <View className='preview__section'>
        <Text className='preview__label'>分类标签 ChipSelect</Text>
        <ChipSelect options={CATEGORIES} value={chip} onChange={setChip} />
      </View>

      <DatePicker open={datePicker} value='2026-09-24' onSelect={() => setDatePicker(false)} onClose={() => setDatePicker(false)} />
      <MonthPicker open={monthPicker} year={2026} month={9} onSelect={() => setMonthPicker(false)} onClose={() => setMonthPicker(false)} />
      <ListSelect open={listSelect} title='选择成员' options={MEMBERS} value='妈妈' onSelect={() => setListSelect(false)} onClose={() => setListSelect(false)} />
      <ActionSheet open={sheet} title='底部弹层示例' onClose={() => setSheet(false)}>
        <View className='preview__sheet-demo'>
          <Text className='preview__sheet-text'>ActionSheet 是所有底部弹层的基础容器，日期、月份、成员选择都基于它。</Text>
        </View>
      </ActionSheet>
    </PageShell>
  )
}
