import type { AppState } from './reducer'

/**
 * First-run seed data. On subsequent launches, persisted state is used.
 *
 * Family identity starts empty on purpose: a brand-new user has no family
 * until they create or join one through the family-setup sheet, and the real
 * family/members then arrive from the API. Seeding a placeholder family here
 * made the home page claim "我们家" while 我的 said "还没有加入家庭".
 *
 * Business data and locations start empty. Creating a family supplies its
 * real default locations through the API; no-family state has no fake locations.
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
  locations: [],
  customDishCategories: [],
  customInventoryCategories: [],
  settings: {
    expiryReminder: true,
    mealReminder: true
  },
  onboardingCompleted: false
}
