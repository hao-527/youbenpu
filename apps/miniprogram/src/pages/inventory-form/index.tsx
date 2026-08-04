import { Button, Image, Input, Picker, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Camera, ChevronRight, MapPin, Package } from 'lucide'
import { useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { useDispatch, useStore } from '../../store'
import { uid } from '../../store/uid'
import { palette } from '../../theme/palette'
import { inventoryCategories, type InventoryCategory, type InventoryItem } from '../../types/domain'
import { formatLocalDate, getInventoryExpiry } from '../../utils/date'
import { choosePersistentImage } from '../../utils/media'

import './index.scss'

const CUSTOM_PLACEHOLDER = '+ 自定义'

export default function InventoryFormPage() {
  const { inventory, locations, familyId, customInventoryCategories } = useStore()
  const dispatch = useDispatch()
  const itemId = Taro.getCurrentInstance().router?.params?.id
  const editingItem = itemId ? inventory.find((item) => item.id === itemId) : undefined

  const allCategories: string[] = [...inventoryCategories, ...customInventoryCategories, CUSTOM_PLACEHOLDER]

  const [name, setName] = useState(editingItem?.name ?? '')
  const [category, setCategory] = useState<InventoryCategory>(editingItem?.category ?? '食品')
  const [location, setLocation] = useState(editingItem?.location ?? locations[0] ?? '')
  const [quantity, setQuantity] = useState(editingItem?.quantityLabel ?? '')
  const [expiryDate, setExpiryDate] = useState(editingItem?.expiryDate ?? '')
  const [photo, setPhoto] = useState(editingItem?.photo ?? '')

  const choosePhoto = async () => {
    const selected = await choosePersistentImage()
    if (selected) setPhoto(selected)
  }

  const submit = () => {
    const normalizedName = name.trim()
    const normalizedQuantity = quantity.trim()
    if (!normalizedName) {
      Taro.showToast({ title: '请填写物品名称', icon: 'none' })
      return
    }
    if (!location || !locations.includes(location)) {
      Taro.showToast({ title: '请选择有效的存放位置', icon: 'none' })
      return
    }
    if (normalizedName.length > 40 || normalizedQuantity.length > 30) {
      Taro.showToast({ title: '名称最多 40 字，数量最多 30 字', icon: 'none' })
      return
    }

    const expiry = getInventoryExpiry(expiryDate)
    const terminalStatus = editingItem?.status === 'finished' || editingItem?.status === 'discarded' ? editingItem.status : null
    const item: InventoryItem = {
      id: editingItem?.id ?? uid('i-'),
      familyId,
      name: normalizedName,
      category,
      location,
      quantityLabel: normalizedQuantity || '1 件',
      expiryDate,
      expiryLabel: expiry.label,
      status: terminalStatus ?? expiry.status,
      photo
    }
    dispatch(editingItem ? { type: 'inventory/update', item } : { type: 'inventory/add', item })
    Taro.showToast({ title: editingItem ? '物品已更新' : '物品已添加', icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 350)
  }

  if (itemId && !editingItem) {
    return (
      <PageShell tabPage={false}>
        <PageHeader title='物品信息' />
        <View className='empty-state surface-card'>
          <AppIcon icon={Package} size={32} color={palette.subtleForeground} />
          <Text className='empty-state__title'>物品不存在</Text>
          <Text className='empty-state__copy'>这个物品可能已经被删除。</Text>
        </View>
      </PageShell>
    )
  }

  if (locations.length === 0) {
    return (
      <PageShell tabPage={false}>
        <PageHeader title={editingItem ? '编辑物品' : '新增物品'} />
        <View className='empty-state surface-card'>
          <AppIcon icon={MapPin} size={32} color={palette.primary} />
          <Text className='empty-state__title'>请先设置存放位置</Text>
          <Text className='empty-state__copy'>物品必须有明确位置，之后查找才有意义。</Text>
          <Button className='button button--primary empty-state__action tap' hoverClass='tap--pressed' onClick={() => Taro.redirectTo({ url: '/pages/family-manage/index?section=locations' })}>设置位置</Button>
        </View>
      </PageShell>
    )
  }

  return (
    <PageShell tabPage={false} withFixedBar>
      <PageHeader title={editingItem ? '编辑物品' : '新增物品'} subtitle='名称和存放位置为必填项' />

      <View className='inventory-form-photo surface-card'>
        <Button className='inventory-form-photo__button tap' hoverClass='tap--pressed' onClick={choosePhoto}>
          {photo ? (
            <Image className='inventory-form-photo__image' src={photo} mode='aspectFill' />
          ) : (
            <View className='inventory-form-photo__placeholder'>
              <AppIcon icon={Camera} size={28} color={palette.primary} />
              <Text>添加物品图片</Text>
            </View>
          )}
        </Button>
        {photo && <Button className='inventory-form-photo__change tap' hoverClass='tap--pressed' onClick={choosePhoto}>更换图片</Button>}
      </View>

      <View className='inventory-form-card form-page surface-card'>
        <View className='field'>
          <Text className='field__label'>物品名称</Text>
          <Input className='field__control' type='text' maxlength={40} placeholder='例如：儿童退热贴' value={name} onInput={(event) => setName(event.detail.value)} />
        </View>

        <View className='field'>
          <Text className='field__label'>分类</Text>
          <Picker mode='selector' range={allCategories} value={Math.max(0, allCategories.indexOf(category))} onChange={(event) => {
            const selected = allCategories[Number(event.detail.value)]
            if (selected === CUSTOM_PLACEHOLDER) {
              ;(Taro.showModal as (options: Record<string, unknown>) => Promise<{ confirm: boolean; content?: string }>)({
                title: '新增物品分类',
                editable: true,
                placeholderText: '输入分类名称（10字内）'
              }).then((result) => {
                if (!result.confirm || !result.content) return
                const newName = result.content.trim().slice(0, 10)
                if (!newName) return
                dispatch({ type: 'category/addInventory', name: newName })
                setCategory(newName)
              })
            } else if (selected) {
              setCategory(selected)
            }
          }}>
            <View className='field__control field__control--picker'>
              <Text>{category}</Text>
              <AppIcon icon={ChevronRight} size={16} color={palette.subtleForeground} />
            </View>
          </Picker>
        </View>

        <View className='field'>
          <Text className='field__label'>存放位置</Text>
          <Picker mode='selector' range={locations} value={Math.max(0, locations.indexOf(location))} onChange={(event) => setLocation(locations[Number(event.detail.value)] ?? locations[0])}>
            <View className='field__control field__control--picker'>
              <Text>{location}</Text>
              <AppIcon icon={ChevronRight} size={16} color={palette.subtleForeground} />
            </View>
          </Picker>
          <Text className='field__hint'>位置可在“我的 → 家庭管理”中维护</Text>
        </View>

        <View className='field'>
          <Text className='field__label'>数量 <Text className='field__optional'>选填</Text></Text>
          <Input className='field__control' type='text' maxlength={30} placeholder='例如：2 盒、半袋' value={quantity} onInput={(event) => setQuantity(event.detail.value)} />
        </View>

        <View className='field'>
          <Text className='field__label'>到期日期 <Text className='field__optional'>选填</Text></Text>
          <Picker mode='date' value={expiryDate || formatLocalDate()} onChange={(event) => setExpiryDate(event.detail.value)}>
            <View className='field__control field__control--picker'>
              <Text>{expiryDate || '无需到期提醒'}</Text>
              <AppIcon icon={ChevronRight} size={16} color={palette.subtleForeground} />
            </View>
          </Picker>
          {expiryDate && <Button className='inventory-form-clear tap' hoverClass='tap--pressed' onClick={() => setExpiryDate('')}>清除到期日期</Button>}
        </View>
      </View>

      <View className='fixed-action-bar'>
        <Button className='button button--primary tap inventory-form-submit' hoverClass='tap--pressed' onClick={submit}>
          {editingItem ? '保存修改' : '添加物品'}
        </Button>
      </View>
    </PageShell>
  )
}
