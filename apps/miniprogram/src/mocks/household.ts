import breadPhoto from '../assets/images/inventory/bread.png'
import dumplingPhoto from '../assets/images/inventory/dumpling.png'
import feverPatchPhoto from '../assets/images/inventory/fever-patch.png'
import laundryPodsPhoto from '../assets/images/inventory/laundry-pods.png'
import milkPhoto from '../assets/images/inventory/milk.png'
import placeholderPhoto from '../assets/images/inventory/placeholder.png'
import type { Dish, FamilyMember, FamilyOverview, InventoryItem, LedgerEntry, MealOrder, MonthSummary } from '../types/domain'

export const currentFamilyId = 'family-home-001'

/* ========== 账本 ========== */

export const monthSummary: MonthSummary = {
  incomeCents: 1500000,
  expenseCents: 328640,
  balanceCents: 1500000 - 328640
}

export const ledgerEntries: LedgerEntry[] = [
  {
    id: 'l-001', familyId: currentFamilyId, type: 'expense',
    amountCents: 6820, purpose: '菜市场采购', memberName: '我',
    date: '2026-08-03', timeLabel: '今天 18:24',
    note: '晚饭和明早的食材', noteVisibility: 'private'
  },
  {
    id: 'l-002', familyId: currentFamilyId, type: 'expense',
    amountCents: 600, purpose: '地铁出行', memberName: '家人',
    date: '2026-08-03', timeLabel: '今天 08:41',
    noteVisibility: 'shared'
  },
  {
    id: 'l-003', familyId: currentFamilyId, type: 'expense',
    amountCents: 12160, purpose: '家庭清洁用品', memberName: '我',
    date: '2026-08-02', timeLabel: '昨天 20:16',
    note: '洗衣液和垃圾袋', noteVisibility: 'shared'
  },
  {
    id: 'l-004', familyId: currentFamilyId, type: 'expense',
    amountCents: 8900, purpose: '儿童绘本', memberName: '家人',
    date: '2026-08-01', timeLabel: '8月1日 14:02',
    noteVisibility: 'private'
  },
  {
    id: 'l-005', familyId: currentFamilyId, type: 'income',
    amountCents: 1500000, purpose: '工资', memberName: '我',
    date: '2026-08-01', timeLabel: '8月1日 09:00',
    noteVisibility: 'shared'
  }
]

/* ========== 点餐 ========== */

export const pendingMealOrder: MealOrder = {
  id: 'meal-order-001',
  familyId: currentFamilyId,
  status: 'pending',
  requesterName: '家人',
  submittedAt: '今天 16:30',
  items: [
    { id: 'oi-001', name: '番茄炒蛋', quantity: 1 },
    { id: 'oi-002', name: '清炒时蔬', quantity: 1 },
    { id: 'oi-003', name: '冬瓜排骨汤', quantity: 1 }
  ]
}

export const dishes: Dish[] = [
  {
    id: 'd-001', familyId: currentFamilyId,
    name: '番茄炒蛋', category: '炒菜',
    method: '番茄切块，鸡蛋打散先炒定型，再下番茄翻炒加糖调味',
    ingredients: ['番茄', '鸡蛋', '葱', '糖'],
    photo: placeholderPhoto, available: true
  },
  {
    id: 'd-002', familyId: currentFamilyId,
    name: '冬瓜排骨汤', category: '汤',
    method: '排骨焯水，冬瓜去皮切块，加姜片炖煮40分钟',
    ingredients: ['冬瓜', '排骨', '姜', '盐'],
    photo: placeholderPhoto, available: true
  },
  {
    id: 'd-003', familyId: currentFamilyId,
    name: '凉拌黄瓜', category: '凉菜',
    method: '黄瓜拍碎切段，蒜末醋酱油辣油拌匀',
    ingredients: ['黄瓜', '蒜', '醋', '酱油'],
    photo: placeholderPhoto, available: true
  },
  {
    id: 'd-004', familyId: currentFamilyId,
    name: '红烧鸡翅', category: '炒菜',
    method: '鸡翅划刀腌制，煎至两面金黄后加酱油冰糖焖煮收汁',
    ingredients: ['鸡翅', '酱油', '冰糖', '姜', '八角'],
    photo: placeholderPhoto, available: false
  }
]

/* ========== 物品 ========== */

/** 自定义位置列表 */
export const locations = ['冰箱冷藏', '冰箱冷冻', '橱柜', '药箱', '浴室', '床头柜', '衣柜', '行李箱']

export const inventoryItems: InventoryItem[] = [
  {
    id: 'i-001', familyId: currentFamilyId,
    name: '鲜牛奶', location: '冰箱冷藏',
    quantityLabel: '2 盒', expiryLabel: '明天到期',
    status: 'expiring', photo: milkPhoto
  },
  {
    id: 'i-002', familyId: currentFamilyId,
    name: '儿童退热贴', location: '药箱',
    quantityLabel: '1 盒', expiryLabel: '还有 5 天',
    status: 'expiring', photo: feverPatchPhoto
  },
  {
    id: 'i-003', familyId: currentFamilyId,
    name: '全麦面包', location: '橱柜',
    quantityLabel: '半袋', expiryLabel: '已过期 1 天',
    status: 'expired', photo: breadPhoto
  },
  {
    id: 'i-004', familyId: currentFamilyId,
    name: '冷冻水饺', location: '冰箱冷冻',
    quantityLabel: '18 个', expiryLabel: '还有 24 天',
    status: 'normal', photo: dumplingPhoto
  },
  {
    id: 'i-005', familyId: currentFamilyId,
    name: '洗衣凝珠', location: '浴室',
    quantityLabel: '22 颗', expiryLabel: '无需提醒',
    status: 'normal', photo: laundryPodsPhoto
  }
]

/* ========== 家庭 ========== */

export const familyMembers: FamilyMember[] = [
  { id: 'm-001', familyId: currentFamilyId, displayName: '我', roleLabel: '家庭管理员', avatarText: '我' },
  { id: 'm-002', familyId: currentFamilyId, displayName: '家人一', roleLabel: '家庭成员', avatarText: '家' },
  { id: 'm-003', familyId: currentFamilyId, displayName: '家人二', roleLabel: '家庭成员', avatarText: '人' }
]

/* ========== 首页概览 ========== */

export const overview: FamilyOverview = {
  familyId: currentFamilyId,
  monthIncomeCents: monthSummary.incomeCents,
  monthExpenseCents: monthSummary.expenseCents,
  monthBalanceCents: monthSummary.balanceCents,
  pendingMealCount: 1,
  expiringItemCount: inventoryItems.filter((i) => i.status === 'expiring' || i.status === 'expired').length
}
