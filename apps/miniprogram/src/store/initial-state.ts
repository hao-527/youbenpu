import type { AppState } from './reducer'

/**
 * First-run seed data. On subsequent launches, persisted state is used.
 *
 * Family identity starts empty on purpose: a brand-new user has no family
 * until they create or join one through the family-setup sheet, and the real
 * family/members then arrive from the API. Seeding a placeholder family here
 * made the home page claim "我们家" while 我的 said "还没有加入家庭".
 *
 * Business data (ledger, dishes, orders, inventory) also starts empty. Only
 * the default storage locations are pre-filled, since starting with none is
 * more confusing than helpful.
 */
export const initialState: AppState = {
  schemaVersion: 2,
  familyId: '',
  currentMemberId: '',
  familyName: '',
  members: [],
  ledger: [],
  dishes: [],
  orders: [],
  inventory: [],
  locations: ['冰箱冷藏', '冰箱冷冻', '橱柜', '药箱', '浴室'],
  customDishCategories: [],
  customInventoryCategories: [],
  settings: {
    expiryReminder: true,
    mealReminder: true
  },
  onboardingCompleted: false
}
