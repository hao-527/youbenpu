import { Button, Image, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Calendar, Camera, MapPin, Package } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { DatePicker } from '../../components/date-picker'
import { ListSelect } from '../../components/list-select'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { useAppShare } from '../../hooks/use-app-share'
import { useDispatch, useStore } from '../../store'
import { uid } from '../../store/uid'
import { palette } from '../../theme/palette'
import { inventoryCategories, type InventoryCategory, type InventoryItem } from '../../types/domain'
import { formatLocalDate, getInventoryExpiry } from '../../utils/date'
import { choosePersistentImage } from '../../utils/media'

import './index.scss'

export default function InventoryFormPage() {
  const { inventory, locations, familyId, customInventoryCategories } = useStore()
  const dispatch = useDispatch()
  useAppShare()
  const itemId = Taro.getCurrentInstance().router?.params?.id
  const editingItem = itemId ? inventory.find((item) => item.id === itemId) : undefined

  const allCategories = useMemo(
    () => [...inventoryCategories, ...customInventoryCategories] as string[],
    [customInventoryCategories]
  )

  const locationOptions = useMemo(
    () => locations.map((loc) => ({ label: loc, value: loc })),
    [locations]
  )

  const [name, setName] = useState(editingItem?.name ?? '')
  const [category, setCategory] = useState<InventoryCategory>(editingItem?.category ?? '食品')
  const [location, setLocation] = useState(editingItem?.location ?? locations[0] ?? '')
  const [quantity, setQuantity] = useState(editingItem?.quantityLabel ?? '')
  const [expiryDate, setExpiryDate] = useState(editingItem?.expiryDate ?? '')
  const [photo, setPhoto] = useState(editingItem?.photo ?? '')
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)

  const choosePhoto = async () => {
    const selected = await choosePersistentImage()
    if (selected) setPhoto(selected)
  }

  const clearUnavailablePhoto = () => {
    setPhoto('')
    Taro.showToast({ title: '图片加载失败，请重新选择', icon: 'none' })
  }

  const addCustomCategory = () => {
    ;(Taro.showModal as (options: Record<string, unknown>) => Promise<{ confirm: boolean; content?: string }>)({
      title: '新增物品分类',
      editable: true,
      placeholderText: '输入分类名称（10字内）'
    }).then(async (result) => {
      if (!result.confirm || !result.content) return
      const newName = result.content.trim().slice(0, 10)
      if (!newName) return
      if (allCategories.includes(newName)) {
        setCategory(newName)
        setShowCategoryPicker(false)
        return
      }
      const succeeded = await dispatch({ type: 'category/addInventory', name: newName })
      if (!succeeded) return
      setCategory(newName)
      setShowCategoryPicker(false)
    })
  }

  const addLocation = () => {
    ;(Taro.showModal as (options: Record<string, unknown>) => Promise<{ confirm: boolean; content?: string }>)({
      title: '新增存放位置',
      editable: true,
      placeholderText: '例如：冰箱冷藏、阳台柜'
    }).then(async (result) => {
      if (!result.confirm || !result.content) return
      const newLocation = result.content.trim().slice(0, 20)
      if (!newLocation) return
      if (locations.includes(newLocation)) {
        setLocation(newLocation)
        setShowLocationPicker(false)
        return
      }
      const succeeded = await dispatch({ type: 'location/add', name: newLocation })
      if (!succeeded) return
      setLocation(newLocation)
      setShowLocationPicker(false)
    })
  }

  const submit = async () => {
    const normalizedName = name.trim()
    const normalizedQuantity = quantity.trim()
    if (!normalizedName) {
      Taro.showToast({ title: '请填写物品名称', icon: 'none' })
      return
    }
    if (!location) {
      Taro.showToast({ title: '请选择存放位置', icon: 'none' })
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
    const succeeded = await dispatch(editingItem ? { type: 'inventory/update', item } : { type: 'inventory/add', item })
    if (!succeeded) return
    Taro.showToast({ title: editingItem ? '物品已更新' : '物品已添加', icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 350)
  }

  if (itemId && !editingItem) {
    return (
      <PageShell tabPage={false}>
        <PageHeader title='物品信息' />
        <View className='empty-state surface-card'>
          <View className='empty-state__icon'>
            <AppIcon icon={Package} size={32} color={palette.subtleForeground} />
          </View>
          <Text className='empty-state__title'>物品不存在</Text>
          <Text className='empty-state__copy'>这个物品可能已经被删除。</Text>
        </View>
      </PageShell>
    )
  }

  return (
    <PageShell tabPage={false} withFixedBar>
      <PageHeader title={editingItem ? '编辑物品' : '新增物品'} subtitle='名称和存放位置为必填项' />

      <View className='photo-picker'>
        <Button className='photo-picker__button tap' hoverClass='tap--pressed' aria-label={photo ? '更换物品图片' : '添加物品图片'} onClick={choosePhoto}>
          {photo ? (
            <Image className='photo-picker__image' src={photo} mode='aspectFill' onError={clearUnavailablePhoto} />
          ) : (
            <View className='photo-picker__placeholder'>
              <AppIcon icon={Camera} size={28} color={palette.primary} />
              <Text>添加物品图片</Text>
            </View>
          )}
        </Button>
        {photo && <Button className='photo-picker__change tap' hoverClass='tap--pressed' onClick={choosePhoto}>更换图片</Button>}
      </View>

      <View className='inventory-form-card form-page surface-card'>
        <View className='field'>
          <Text className='field__label'>物品名称</Text>
          <Input className='field__control' type='text' maxlength={40} placeholder='例如：儿童退热贴' placeholderClass='input-placeholder' value={name} onInput={(event) => setName(event.detail.value)} />
        </View>

        <View className='field'>
          <Text className='field__label'>分类</Text>
          <Button className='field__control field__control--picker tap' hoverClass='tap--pressed' onClick={() => setShowCategoryPicker(true)}>
            <Text>{category}</Text>
            <AppIcon icon={Package} size={16} color={palette.subtleForeground} />
          </Button>
        </View>

        <View className='field'>
          <Text className='field__label'>存放位置</Text>
          <Button className='field__control field__control--picker tap' hoverClass='tap--pressed' onClick={() => setShowLocationPicker(true)}>
            <Text className={location ? '' : 'inventory-form-empty-date'}>{location || '点击选择或新增位置'}</Text>
            <AppIcon icon={MapPin} size={16} color={palette.subtleForeground} />
          </Button>
        </View>

        <View className='field'>
          <Text className='field__label'>数量 <Text className='field__optional'>选填</Text></Text>
          <Input className='field__control' type='text' maxlength={30} placeholder='例如：2 盒、半袋' placeholderClass='input-placeholder' value={quantity} onInput={(event) => setQuantity(event.detail.value)} />
        </View>

        <View className='field'>
          <Text className='field__label'>到期日期 <Text className='field__optional'>选填</Text></Text>
          <Button className='field__control field__control--picker tap' hoverClass='tap--pressed' onClick={() => setShowDatePicker(true)}>
            <Text className={expiryDate ? '' : 'inventory-form-empty-date'}>{expiryDate || '无需到期提醒'}</Text>
            <AppIcon icon={Calendar} size={16} color={palette.subtleForeground} />
          </Button>
        </View>
      </View>

      <View className='fixed-action-bar'>
        <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={submit}>
          {editingItem ? '保存修改' : '添加物品'}
        </Button>
      </View>

      <ListSelect
        open={showCategoryPicker}
        title='选择分类'
        options={allCategories.map((c) => ({ label: c, value: c }))}
        value={category}
        onSelect={(v) => setCategory(v)}
        onClose={() => setShowCategoryPicker(false)}
        addLabel='自定义分类'
        onAdd={addCustomCategory}
      />

      <ListSelect
        open={showLocationPicker}
        title='选择存放位置'
        options={locationOptions}
        value={location}
        onSelect={setLocation}
        onClose={() => setShowLocationPicker(false)}
        addLabel='新增位置'
        onAdd={addLocation}
      />

      <DatePicker
        open={showDatePicker}
        value={expiryDate}
        clearable
        onSelect={setExpiryDate}
        onClear={() => setExpiryDate('')}
        onClose={() => setShowDatePicker(false)}
      />
    </PageShell>
  )
}
