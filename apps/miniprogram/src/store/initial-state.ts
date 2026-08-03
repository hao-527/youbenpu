import {
  currentFamilyId,
  dishes,
  familyMembers,
  inventoryItems,
  locations,
  ledgerEntries,
  pendingMealOrder
} from '../mocks/household'
import type { AppState } from './reducer'

/** First-run seed data. On subsequent launches, persisted state is used. */
export const initialState: AppState = {
  familyId: currentFamilyId,
  familyName: '我们家',
  members: familyMembers,
  ledger: ledgerEntries,
  dishes,
  mealOrder: pendingMealOrder,
  inventory: inventoryItems,
  locations,
  settings: {
    expiryReminder: true,
    mealReminder: true
  }
}
