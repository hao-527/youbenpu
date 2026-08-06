import type { Dish, FamilyMember, FamilyRole, InventoryItem, LedgerEntry, MealOrder } from '../types/domain'

export interface AppState {
  schemaVersion: number
  familyId: string
  currentMemberId: string
  familyName: string
  members: FamilyMember[]
  ledger: LedgerEntry[]
  dishes: Dish[]
  /** 全部点餐单，最新在前。同一时间最多一张 pending */
  orders: MealOrder[]
  inventory: InventoryItem[]
  locations: string[]
  /** 用户自定义的菜品分类 */
  customDishCategories: string[]
  /** 用户自定义的物品分类 */
  customInventoryCategories: string[]
  settings: {
    expiryReminder: boolean
    mealReminder: boolean
  }
  /** 首次引导是否已完成。false 时首页显示引导遮罩。 */
  onboardingCompleted: boolean
}

export type AppAction =
  | { type: 'hydrate'; state: AppState }
  | { type: 'ledger/add'; entry: LedgerEntry }
  | { type: 'ledger/update'; entry: LedgerEntry }
  | { type: 'ledger/delete'; id: string }
  | { type: 'dish/add'; dish: Dish }
  | { type: 'dish/update'; dish: Dish }
  | { type: 'dish/delete'; id: string }
  | { type: 'dish/toggleAvailable'; id: string }
  | { type: 'order/create'; order: MealOrder }
  | { type: 'order/complete'; id: string }
  | { type: 'order/cancel'; id: string }
  | { type: 'order/delete'; id: string }
  | { type: 'inventory/add'; item: InventoryItem }
  | { type: 'inventory/update'; item: InventoryItem }
  | { type: 'inventory/delete'; id: string }
  | { type: 'inventory/permanentDelete'; id: string }
  | { type: 'inventory/permanentDeleteAll' }
  | { type: 'inventory/markStatus'; id: string; status: InventoryItem['status'] }
  | { type: 'location/add'; name: string }
  | { type: 'location/delete'; name: string }
  | { type: 'family/rename'; name: string }
  | { type: 'member/add'; member: FamilyMember }
  | { type: 'member/remove'; id: string }
  | { type: 'member/updateRole'; id: string; roleLabel: FamilyRole }
  | { type: 'category/addDish'; name: string }
  | { type: 'category/removeDish'; name: string }
  | { type: 'category/addInventory'; name: string }
  | { type: 'category/removeInventory'; name: string }
  | { type: 'settings/toggleExpiryReminder' }
  | { type: 'settings/toggleMealReminder' }
  | { type: 'onboarding/complete' }

function currentMemberIsAdmin(state: AppState): boolean {
  return state.members.some((member) => member.id === state.currentMemberId && member.roleLabel === '家庭管理员')
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.state
    case 'ledger/add':
      return { ...state, ledger: [action.entry, ...state.ledger] }
    case 'ledger/update':
      return { ...state, ledger: state.ledger.map((entry) => entry.id === action.entry.id ? action.entry : entry) }
    case 'ledger/delete':
      return { ...state, ledger: state.ledger.filter((entry) => entry.id !== action.id) }

    case 'dish/add': {
      const name = action.dish.name.trim()
      if (!name || state.dishes.some((dish) => dish.name.trim().toLowerCase() === name.toLowerCase())) return state
      return { ...state, dishes: [...state.dishes, { ...action.dish, name }] }
    }
    case 'dish/update': {
      const name = action.dish.name.trim()
      if (!name || state.dishes.some((dish) => dish.id !== action.dish.id && dish.name.trim().toLowerCase() === name.toLowerCase())) return state
      return { ...state, dishes: state.dishes.map((dish) => dish.id === action.dish.id ? { ...action.dish, name } : dish) }
    }
    case 'dish/delete':
      if (state.orders.some((order) => order.status === 'pending' && order.items.some((item) => item.dishId === action.id))) return state
      return { ...state, dishes: state.dishes.filter((dish) => dish.id !== action.id) }
    case 'dish/toggleAvailable':
      return { ...state, dishes: state.dishes.map((dish) => dish.id === action.id ? { ...dish, available: !dish.available } : dish) }

    case 'order/create':
      if (state.orders.some((order) => order.status === 'pending')) return state
      return { ...state, orders: [action.order, ...state.orders] }
    case 'order/complete':
      return { ...state, orders: state.orders.map((order) => order.id === action.id && order.status === 'pending' ? { ...order, status: 'completed' } : order) }
    case 'order/cancel':
      return { ...state, orders: state.orders.map((order) => order.id === action.id && order.status === 'pending' ? { ...order, status: 'cancelled' } : order) }
    case 'order/delete':
      return { ...state, orders: state.orders.filter((order) => order.id !== action.id || order.status === 'pending') }

    case 'inventory/add':
      return { ...state, inventory: [...state.inventory, action.item] }
    case 'inventory/update':
      return { ...state, inventory: state.inventory.map((item) => item.id === action.item.id ? action.item : item) }
    case 'inventory/delete':
      return { ...state, inventory: state.inventory.map((item) => item.id === action.id ? { ...item, status: 'deleted' as const } : item) }
    case 'inventory/permanentDelete':
      return { ...state, inventory: state.inventory.filter((item) => item.id !== action.id) }
    case 'inventory/permanentDeleteAll':
      return { ...state, inventory: state.inventory.filter((item) => item.status !== 'finished' && item.status !== 'discarded' && item.status !== 'deleted') }
    case 'inventory/markStatus':
      return { ...state, inventory: state.inventory.map((item) => item.id === action.id ? { ...item, status: action.status } : item) }

    case 'location/add': {
      const name = action.name.trim()
      if (!name || state.locations.some((location) => location.toLowerCase() === name.toLowerCase())) return state
      return { ...state, locations: [...state.locations, name] }
    }
    case 'location/delete':
      if (state.inventory.some((item) => item.location === action.name && item.status !== 'finished' && item.status !== 'discarded' && item.status !== 'deleted')) return state
      return { ...state, locations: state.locations.filter((location) => location !== action.name) }

    case 'family/rename': {
      if (!currentMemberIsAdmin(state)) return state
      const name = action.name.trim()
      return name ? { ...state, familyName: name } : state
    }
    case 'member/add': {
      if (!currentMemberIsAdmin(state)) return state
      const name = action.member.displayName.trim()
      if (!name || state.members.some((member) => member.displayName.trim().toLowerCase() === name.toLowerCase())) return state
      return { ...state, members: [...state.members, { ...action.member, displayName: name }] }
    }
    case 'member/remove': {
      if (!currentMemberIsAdmin(state)) return state
      const target = state.members.find((member) => member.id === action.id)
      if (!target || action.id === state.currentMemberId || state.members.length <= 1) return state
      const adminCount = state.members.filter((member) => member.roleLabel === '家庭管理员').length
      if (target.roleLabel === '家庭管理员' && adminCount <= 1) return state
      return { ...state, members: state.members.filter((member) => member.id !== action.id) }
    }
    case 'member/updateRole': {
      if (!currentMemberIsAdmin(state)) return state
      const target = state.members.find((member) => member.id === action.id)
      if (!target) return state
      const isDemotingLastAdmin = target.roleLabel === '家庭管理员'
        && action.roleLabel !== '家庭管理员'
        && state.members.filter((member) => member.roleLabel === '家庭管理员').length <= 1
      if (isDemotingLastAdmin) return state
      return { ...state, members: state.members.map((member) => member.id === action.id ? { ...member, roleLabel: action.roleLabel } : member) }
    }

    case 'settings/toggleExpiryReminder':
      return { ...state, settings: { ...state.settings, expiryReminder: !state.settings.expiryReminder } }
    case 'settings/toggleMealReminder':
      return { ...state, settings: { ...state.settings, mealReminder: !state.settings.mealReminder } }

    case 'onboarding/complete':
      return { ...state, onboardingCompleted: true }

    case 'category/addDish': {
      const name = action.name.trim()
      if (!name || name.length > 10) return state
      const allDish = [...state.customDishCategories]
      if (allDish.some((item) => item.toLowerCase() === name.toLowerCase())) return state
      return { ...state, customDishCategories: [...allDish, name] }
    }
    case 'category/removeDish': {
      const name = action.name.trim()
      if (!name) return state
      if (state.dishes.some((dish) => dish.category.toLowerCase() === name.toLowerCase())) return state
      return { ...state, customDishCategories: state.customDishCategories.filter((item) => item.toLowerCase() !== name.toLowerCase()) }
    }
    case 'category/addInventory': {
      const name = action.name.trim()
      if (!name || name.length > 10) return state
      const allInv = [...state.customInventoryCategories]
      if (allInv.some((item) => item.toLowerCase() === name.toLowerCase())) return state
      return { ...state, customInventoryCategories: [...allInv, name] }
    }
    case 'category/removeInventory': {
      const name = action.name.trim()
      if (!name) return state
      if (state.inventory.some((item) => item.category.toLowerCase() === name.toLowerCase() && item.status !== 'deleted')) return state
      return { ...state, customInventoryCategories: state.customInventoryCategories.filter((item) => item.toLowerCase() !== name.toLowerCase()) }
    }

    default:
      return state
  }
}
