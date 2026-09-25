/* ========== 账本 ========== */

export type TransactionType = 'income' | 'expense'

export interface LedgerEntry {
  id: string
  familyId: string
  type: TransactionType
  amountCents: number
  /** 用途，手动输入的简短描述 */
  purpose: string
  memberName: string
  /** ISO date string YYYY-MM-DD */
  date: string
  /** 时间标签，展示用 */
  timeLabel: string
  note?: string
  noteVisibility: 'private' | 'shared'
  /**
   * 是否计入收支合计。默认 true（手动记账）。账单导入的退款计为 income 且 true，
   * 交易关闭/冻结/中性转账等记录但不计入（false），既保留痕迹又不影响金额。
   */
  countsTowardTotal: boolean
}

/* ========== 点餐 ========== */

export const dishCategories = ['炒菜', '汤', '凉菜', '主食', '甜品', '其他'] as const
export type DishCategory = typeof dishCategories[number] | (string & {})

export interface Dish {
  id: string
  familyId: string
  name: string
  category: DishCategory
  /** 做法简述 */
  method: string
  /** 主要食材 */
  ingredients: string[]
  /** 菜品图片，本地路径或远程URL */
  photo: string
  available: boolean
}

export type MealOrderStatus = 'pending' | 'completed' | 'cancelled'

export interface MealOrderItem {
  id: string
  /** 关联菜品，用于回查图片和做法 */
  dishId: string
  name: string
  quantity: number
  /** 下单时的菜品图片快照 */
  photo: string
}

export interface MealOrder {
  id: string
  familyId: string
  status: MealOrderStatus
  requesterName: string
  submittedAt: string
  items: MealOrderItem[]
}

/* ========== 物品 ========== */

export type InventoryStatus = 'normal' | 'expiring' | 'expired' | 'finished' | 'discarded' | 'deleted'

export const inventoryCategories = ['食品', '药品', '日用品', '化妆品', '证件'] as const
export type InventoryCategory = typeof inventoryCategories[number] | (string & {})

export interface InventoryItem {
  id: string
  familyId: string
  name: string
  category: InventoryCategory
  /** 自定义存放位置：床头柜、行李箱、衣柜等 */
  location: string
  quantityLabel: string
  /** ISO date string YYYY-MM-DD；空字符串表示无需提醒 */
  expiryDate: string
  /** 根据 expiryDate 计算的展示文案 */
  expiryLabel: string
  status: InventoryStatus
  photo: string
}

/* ========== 家庭 ========== */

export type FamilyRole = '家庭管理员' | '家庭成员'

export interface FamilyMember {
  id: string
  familyId: string
  displayName: string
  roleLabel: FamilyRole
  avatarText: string
}
