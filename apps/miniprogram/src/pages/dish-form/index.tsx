import { Button, Image, Input, Text, Textarea, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Camera, Utensils } from 'lucide'
import { useMemo, useState } from 'react'

import { AppIcon } from '../../components/app-icon'
import { ListSelect } from '../../components/list-select'
import { PageHeader } from '../../components/page-header'
import { PageShell } from '../../components/page-shell'
import { useDispatch, useStore } from '../../store'
import { uid } from '../../store/uid'
import { palette } from '../../theme/palette'
import { dishCategories } from '../../types/domain'
import type { Dish, DishCategory } from '../../types/domain'
import { choosePersistentImage } from '../../utils/media'

import './index.scss'

export default function DishFormPage() {
  const { dishes, familyId, customDishCategories } = useStore()
  const dispatch = useDispatch()
  const dishId = Taro.getCurrentInstance().router?.params?.id
  const editingDish = dishId ? dishes.find((dish) => dish.id === dishId) : undefined

  const allCategories = useMemo(
    () => [...dishCategories, ...customDishCategories] as string[],
    [customDishCategories]
  )

  const [name, setName] = useState(editingDish?.name ?? '')
  const [category, setCategory] = useState<DishCategory>(editingDish?.category ?? '炒菜')
  const [method, setMethod] = useState(editingDish?.method ?? '')
  const [ingredientsText, setIngredientsText] = useState(editingDish?.ingredients.join('、') ?? '')
  const [photo, setPhoto] = useState(editingDish?.photo ?? '')
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)

  const choosePhoto = async () => {
    const selected = await choosePersistentImage()
    if (selected) setPhoto(selected)
  }

  const addCustomCategory = () => {
    ;(Taro.showModal as (options: Record<string, unknown>) => Promise<{ confirm: boolean; content?: string }>)({
      title: '新增菜品分类',
      editable: true,
      placeholderText: '输入分类名称（10字内）'
    }).then((result) => {
      if (!result.confirm || !result.content) return
      const newName = result.content.trim().slice(0, 10)
      if (!newName) return
      if (allCategories.includes(newName)) {
        setCategory(newName)
        setShowCategoryPicker(false)
        return
      }
      dispatch({ type: 'category/addDish', name: newName })
      setCategory(newName)
      setShowCategoryPicker(false)
    })
  }

  const submit = () => {
    const normalizedName = name.trim()
    if (!normalizedName) {
      Taro.showToast({ title: '请填写菜品名称', icon: 'none' })
      return
    }
    if (normalizedName.length > 20) {
      Taro.showToast({ title: '菜品名称最多 20 个字', icon: 'none' })
      return
    }
    if (dishes.some((dish) => dish.id !== editingDish?.id && dish.name.trim().toLowerCase() === normalizedName.toLowerCase())) {
      Taro.showToast({ title: '已有同名菜品', icon: 'none' })
      return
    }
    const ingredients = ingredientsText.split(/[、,，\n]/).map((value) => value.trim()).filter(Boolean)
    if (ingredients.length > 20) {
      Taro.showToast({ title: '食材最多填写 20 项', icon: 'none' })
      return
    }
    if (method.trim().length > 200 || ingredientsText.trim().length > 200) {
      Taro.showToast({ title: '做法和食材各最多 200 个字', icon: 'none' })
      return
    }

    const dish: Dish = {
      id: editingDish?.id ?? uid('d-'),
      familyId,
      name: normalizedName,
      category,
      method: method.trim(),
      ingredients,
      photo,
      available: editingDish?.available ?? true
    }
    dispatch(editingDish ? { type: 'dish/update', dish } : { type: 'dish/add', dish })
    Taro.showToast({ title: editingDish ? '菜品已更新' : '菜品已添加', icon: 'success' })
    setTimeout(() => Taro.navigateBack(), 350)
  }

  if (dishId && !editingDish) {
    return (
      <PageShell tabPage={false}>
        <PageHeader title='菜品信息' />
        <View className='empty-state surface-card'>
          <View className='empty-state__icon'>
            <AppIcon icon={Utensils} size={32} color={palette.subtleForeground} />
          </View>
          <Text className='empty-state__title'>菜品不存在</Text>
          <Text className='empty-state__copy'>这道菜可能已经被删除。</Text>
        </View>
      </PageShell>
    )
  }

  return (
    <PageShell tabPage={false} withFixedBar>
      <PageHeader title={editingDish ? '编辑菜品' : '添加菜品'} subtitle='菜名和分类为必填项' />

      <View className='photo-picker dish-form-photo'>
        <Button className='photo-picker__button tap' hoverClass='tap--pressed' aria-label={photo ? '更换菜品图片' : '添加菜品图片'} onClick={choosePhoto}>
          {photo ? (
            <Image className='photo-picker__image' src={photo} mode='aspectFill' />
          ) : (
            <View className='photo-picker__placeholder'>
              <AppIcon icon={Camera} size={28} color={palette.primary} />
              <Text>添加菜品图片</Text>
            </View>
          )}
        </Button>
        {photo && <Button className='photo-picker__change tap' hoverClass='tap--pressed' onClick={choosePhoto}>更换图片</Button>}
      </View>

      <View className='form-page dish-form-fields surface-card'>
        <View className='field'>
          <Text className='field__label'>菜品名称</Text>
          <Input className='field__control' type='text' maxlength={20} placeholder='例如：番茄炒蛋' placeholderClass='input-placeholder' value={name} onInput={(event) => setName(event.detail.value)} />
        </View>

        <View className='field'>
          <Text className='field__label'>分类</Text>
          <Button className='field__control field__control--picker tap' hoverClass='tap--pressed' onClick={() => setShowCategoryPicker(true)}>
            <Text>{category}</Text>
            <AppIcon icon={Utensils} size={16} color={palette.subtleForeground} />
          </Button>
        </View>

        <View className='field'>
          <Text className='field__label'>主要食材 <Text className='field__optional'>选填</Text></Text>
          <Textarea className='field__control field__control--textarea' maxlength={200} placeholder='用顿号或逗号分隔，最多 20 项' placeholderClass='input-placeholder' value={ingredientsText} onInput={(event) => setIngredientsText(event.detail.value)} />
          <Text className='field__hint'>示例：番茄、鸡蛋、葱</Text>
        </View>

        <View className='field'>
          <Text className='field__label'>做法简述 <Text className='field__optional'>选填</Text></Text>
          <Textarea className='field__control field__control--textarea' maxlength={200} placeholder='写下家里常用的做法' placeholderClass='input-placeholder' value={method} onInput={(event) => setMethod(event.detail.value)} />
        </View>
      </View>

      <View className='fixed-action-bar'>
        <Button className='button button--primary tap' hoverClass='tap--pressed' onClick={submit}>
          {editingDish ? '保存修改' : '添加到菜品库'}
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
    </PageShell>
  )
}
