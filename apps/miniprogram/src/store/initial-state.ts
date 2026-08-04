import {
  currentFamilyId,
  dishes,
  familyMembers,
  inventoryItems,
  locations,
  ledgerEntries,
  mealOrders
} from '../mocks/household'
import type { AppState } from './reducer'

/** First-run seed data. On subsequent launches, persisted state is used. */
export const initialState: AppState = {
  schemaVersion: 2,
  familyId: currentFamilyId,
  currentMemberId: familyMembers[0].id,
  familyName: '我们家',
  members: familyMembers,
  ledger: ledgerEntries,
  dishes,
  orders: mealOrders,
  inventory: inventoryItems,
  locations,
  customDishCategories: [],
  customInventoryCategories: [],
  settings: {
    expiryReminder: true,
    mealReminder: true
  }
}
