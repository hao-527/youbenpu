import type { Dish, FamilyMember, InventoryItem, LedgerEntry, MealOrder } from '../types/domain'

export interface AppState {
  familyId: string
  familyName: string
  members: FamilyMember[]
  ledger: LedgerEntry[]
  dishes: Dish[]
  mealOrder: MealOrder | null
  inventory: InventoryItem[]
  locations: string[]
  settings: {
    expiryReminder: boolean
    mealReminder: boolean
  }
}

export type AppAction =
  // Ledger
  | { type: 'ledger/add'; entry: LedgerEntry }
  | { type: 'ledger/update'; entry: LedgerEntry }
  | { type: 'ledger/delete'; id: string }
  // Dishes
  | { type: 'dish/add'; dish: Dish }
  | { type: 'dish/update'; dish: Dish }
  | { type: 'dish/delete'; id: string }
  | { type: 'dish/toggleAvailable'; id: string }
  // Meal order
  | { type: 'order/create'; order: MealOrder }
  | { type: 'order/complete' }
  | { type: 'order/cancel' }
  // Inventory
  | { type: 'inventory/add'; item: InventoryItem }
  | { type: 'inventory/update'; item: InventoryItem }
  | { type: 'inventory/delete'; id: string }
  | { type: 'inventory/markStatus'; id: string; status: InventoryItem['status'] }
  // Locations
  | { type: 'location/add'; name: string }
  | { type: 'location/delete'; name: string }
  // Family
  | { type: 'family/rename'; name: string }
  | { type: 'member/add'; member: FamilyMember }
  | { type: 'member/remove'; id: string }
  | { type: 'member/updateRole'; id: string; roleLabel: string }
  // Settings
  | { type: 'settings/toggleExpiryReminder' }
  | { type: 'settings/toggleMealReminder' }

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // Ledger
    case 'ledger/add':
      return { ...state, ledger: [action.entry, ...state.ledger] }
    case 'ledger/update':
      return { ...state, ledger: state.ledger.map((e) => e.id === action.entry.id ? action.entry : e) }
    case 'ledger/delete':
      return { ...state, ledger: state.ledger.filter((e) => e.id !== action.id) }

    // Dishes
    case 'dish/add':
      return { ...state, dishes: [...state.dishes, action.dish] }
    case 'dish/update':
      return { ...state, dishes: state.dishes.map((d) => d.id === action.dish.id ? action.dish : d) }
    case 'dish/delete':
      return { ...state, dishes: state.dishes.filter((d) => d.id !== action.id) }
    case 'dish/toggleAvailable':
      return { ...state, dishes: state.dishes.map((d) => d.id === action.id ? { ...d, available: !d.available } : d) }

    // Meal order
    case 'order/create':
      return { ...state, mealOrder: action.order }
    case 'order/complete':
      return { ...state, mealOrder: state.mealOrder ? { ...state.mealOrder, status: 'completed' } : null }
    case 'order/cancel':
      return { ...state, mealOrder: state.mealOrder ? { ...state.mealOrder, status: 'cancelled' } : null }

    // Inventory
    case 'inventory/add':
      return { ...state, inventory: [...state.inventory, action.item] }
    case 'inventory/update':
      return { ...state, inventory: state.inventory.map((i) => i.id === action.item.id ? action.item : i) }
    case 'inventory/delete':
      return { ...state, inventory: state.inventory.filter((i) => i.id !== action.id) }
    case 'inventory/markStatus':
      return { ...state, inventory: state.inventory.map((i) => i.id === action.id ? { ...i, status: action.status } : i) }

    // Locations
    case 'location/add':
      return { ...state, locations: state.locations.includes(action.name) ? state.locations : [...state.locations, action.name] }
    case 'location/delete':
      return { ...state, locations: state.locations.filter((l) => l !== action.name) }

    // Family
    case 'family/rename':
      return { ...state, familyName: action.name }
    case 'member/add':
      return { ...state, members: [...state.members, action.member] }
    case 'member/remove':
      return { ...state, members: state.members.filter((m) => m.id !== action.id) }
    case 'member/updateRole':
      return { ...state, members: state.members.map((m) => m.id === action.id ? { ...m, roleLabel: action.roleLabel } : m) }

    // Settings
    case 'settings/toggleExpiryReminder':
      return { ...state, settings: { ...state.settings, expiryReminder: !state.settings.expiryReminder } }
    case 'settings/toggleMealReminder':
      return { ...state, settings: { ...state.settings, mealReminder: !state.settings.mealReminder } }

    default:
      return state
  }
}
