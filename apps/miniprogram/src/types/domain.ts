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
}

export interface MonthSummary {
  incomeCents: number
  expenseCents: number
  /** 结余 = 收入 - 支出 */
  balanceCents: number
}

/* ========== 点餐 ========== */

export type DishCategory = '炒菜' | '汤' | '凉菜' | '主食' | '甜品' | '其他'

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
  name: string
  quantity: number
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

export type InventoryStatus = 'normal' | 'expiring' | 'expired' | 'finished' | 'discarded'

export interface InventoryItem {
  id: string
  familyId: string
  name: string
  /** 自定义存放位置：床头柜、行李箱、衣柜等 */
  location: string
  quantityLabel: string
  expiryLabel: string
  status: InventoryStatus
  photo: string
}

/* ========== 家庭 ========== */

export interface FamilyMember {
  id: string
  familyId: string
  displayName: string
  roleLabel: string
  avatarText: string
}

/* ========== 首页概览 ========== */

export interface FamilyOverview {
  familyId: string
  monthIncomeCents: number
  monthExpenseCents: number
  monthBalanceCents: number
  pendingMealCount: number
  expiringItemCount: number
}
