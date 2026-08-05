import type { AppState } from './reducer'

/**
 * First-run seed data. On subsequent launches, persisted state is used.
 *
 * Business data (ledger, dishes, orders, inventory) starts empty — the user
 * builds their own through the onboarding flow and normal usage. Only
 * structural scaffolding that would be confusing to start without (locations,
 * the owner member, and the household name) is pre-filled.
 */
export const initialState: AppState = {
  schemaVersion: 2,
  familyId: 'family-home-001',
  currentMemberId: 'm-owner',
  familyName: '我们家',
  members: [
    { id: 'm-owner', familyId: 'family-home-001', displayName: '我', roleLabel: '家庭管理员', avatarText: '我' }
  ],
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
