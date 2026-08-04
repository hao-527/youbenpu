import dishWingsPhoto from '../assets/images/dishes/chicken-wings.png'
import dishCucumberPhoto from '../assets/images/dishes/cucumber.png'
import dishTomatoPhoto from '../assets/images/dishes/tomato-egg.png'
import dishSoupPhoto from '../assets/images/dishes/winter-melon-soup.png'
import breadPhoto from '../assets/images/inventory/bread.png'
import dumplingPhoto from '../assets/images/inventory/dumpling.png'
import feverPatchPhoto from '../assets/images/inventory/fever-patch.png'
import laundryPodsPhoto from '../assets/images/inventory/laundry-pods.png'
import milkPhoto from '../assets/images/inventory/milk.png'
import type { Dish, FamilyMember, InventoryItem, LedgerEntry, MealOrder } from '../types/domain'
import { addDays, formatLocalDate, getInventoryExpiry } from '../utils/date'

export const currentFamilyId = 'family-home-001'

const now = new Date()
const today = formatLocalDate(now)
const yesterday = formatLocalDate(addDays(now, -1))
const monthStart = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1))

/* ========== 账本 ========== */

export const ledgerEntries: LedgerEntry[] = [
  {
    id: 'l-001', familyId: currentFamilyId, type: 'expense',
    amountCents: 6820, purpose: '菜市场采购', memberName: '我',
    date: today, timeLabel: '今天 18:24',
    note: '晚饭和明早的食材', noteVisibility: 'private'
  },
  {
    id: 'l-002', familyId: currentFamilyId, type: 'expense',
    amountCents: 600, purpose: '地铁出行', memberName: '家人一',
    date: today, timeLabel: '今天 08:41',
    noteVisibility: 'shared'
  },
  {
    id: 'l-003', familyId: currentFamilyId, type: 'expense',
    amountCents: 12160, purpose: '家庭清洁用品', memberName: '我',
    date: yesterday, timeLabel: '昨天 20:16',
    note: '洗衣液和垃圾袋', noteVisibility: 'shared'
  },
  {
    id: 'l-004', familyId: currentFamilyId, type: 'expense',
    amountCents: 8900, purpose: '儿童绘本', memberName: '家人一',
    date: monthStart, timeLabel: `${now.getMonth() + 1}月1日 14:02`,
    noteVisibility: 'private'
  },
  {
    id: 'l-005', familyId: currentFamilyId, type: 'income',
    amountCents: 1500000, purpose: '工资', memberName: '我',
    date: monthStart, timeLabel: `${now.getMonth() + 1}月1日 09:00`,
    noteVisibility: 'shared'
  }
]

/* ========== 点餐 ========== */

export const dishes: Dish[] = [
  {
    id: 'd-001', familyId: currentFamilyId,
    name: '番茄炒蛋', category: '炒菜',
    method: '番茄切块，鸡蛋打散先炒定型，再下番茄翻炒加糖调味',
    ingredients: ['番茄', '鸡蛋', '葱', '糖'],
    photo: dishTomatoPhoto, available: true
  },
  {
    id: 'd-002', familyId: currentFamilyId,
    name: '冬瓜排骨汤', category: '汤',
    method: '排骨焯水，冬瓜去皮切块，加姜片炖煮40分钟',
    ingredients: ['冬瓜', '排骨', '姜', '盐'],
    photo: dishSoupPhoto, available: true
  },
  {
    id: 'd-003', familyId: currentFamilyId,
    name: '凉拌黄瓜', category: '凉菜',
    method: '黄瓜拍碎切段，蒜末醋酱油辣油拌匀',
    ingredients: ['黄瓜', '蒜', '醋', '酱油'],
    photo: dishCucumberPhoto, available: true
  },
  {
    id: 'd-004', familyId: currentFamilyId,
    name: '红烧鸡翅', category: '炒菜',
    method: '鸡翅划刀腌制，煎至两面金黄后加酱油冰糖焖煮收汁',
    ingredients: ['鸡翅', '酱油', '冰糖', '姜', '八角'],
    photo: dishWingsPhoto, available: false
  }
]

export const mealOrders: MealOrder[] = [
  {
    id: 'mo-001', familyId: currentFamilyId, status: 'pending', requesterName: '家人一', submittedAt: '今天 16:30',
    items: [
      { id: 'oi-001', dishId: 'd-001', name: '番茄炒蛋', quantity: 1, photo: dishTomatoPhoto },
      { id: 'oi-002', dishId: 'd-003', name: '凉拌黄瓜', quantity: 1, photo: dishCucumberPhoto },
      { id: 'oi-003', dishId: 'd-002', name: '冬瓜排骨汤', quantity: 1, photo: dishSoupPhoto }
    ]
  },
  {
    id: 'mo-000', familyId: currentFamilyId, status: 'completed', requesterName: '我', submittedAt: '昨天 18:10',
    items: [
      { id: 'oi-101', dishId: 'd-002', name: '冬瓜排骨汤', quantity: 1, photo: dishSoupPhoto },
      { id: 'oi-102', dishId: 'd-001', name: '番茄炒蛋', quantity: 2, photo: dishTomatoPhoto }
    ]
  }
]

/* ========== 物品 ========== */

export const locations = ['冰箱冷藏', '冰箱冷冻', '橱柜', '药箱', '浴室', '床头柜', '衣柜', '行李箱']

function createInventoryItem(
  id: string,
  name: string,
  category: InventoryItem['category'],
  location: string,
  quantityLabel: string,
  expiryOffset: number | null,
  photo: string
): InventoryItem {
  const expiryDate = expiryOffset === null ? '' : formatLocalDate(addDays(now, expiryOffset))
  const expiry = getInventoryExpiry(expiryDate, now)
  return {
    id,
    familyId: currentFamilyId,
    name,
    category,
    location,
    quantityLabel,
    expiryDate,
    expiryLabel: expiry.label,
    status: expiry.status,
    photo
  }
}

export const inventoryItems: InventoryItem[] = [
  createInventoryItem('i-001', '鲜牛奶', '食品', '冰箱冷藏', '2 盒', 1, milkPhoto),
  createInventoryItem('i-002', '儿童退热贴', '药品', '药箱', '1 盒', 5, feverPatchPhoto),
  createInventoryItem('i-003', '全麦面包', '食品', '橱柜', '半袋', -1, breadPhoto),
  createInventoryItem('i-004', '冷冻水饺', '食品', '冰箱冷冻', '18 个', 24, dumplingPhoto),
  createInventoryItem('i-005', '洗衣凝珠', '日用品', '浴室', '22 颗', null, laundryPodsPhoto)
]

/* ========== 家庭 ========== */

export const familyMembers: FamilyMember[] = [
  { id: 'm-001', familyId: currentFamilyId, displayName: '我', roleLabel: '家庭管理员', avatarText: '我' },
  { id: 'm-002', familyId: currentFamilyId, displayName: '家人一', roleLabel: '家庭成员', avatarText: '家' },
  { id: 'm-003', familyId: currentFamilyId, displayName: '家人二', roleLabel: '家庭成员', avatarText: '人' }
]
