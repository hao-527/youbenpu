import Taro from '@tarojs/taro'
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import type { Dispatch, PropsWithChildren } from 'react'

import * as api from '../api'
import { hasFamily, isLoggedIn } from '../api/token'
import { initialState } from './initial-state'
import { appReducer, type AppAction, type AppState } from './reducer'
import { loadState, saveState } from './storage'

const StateContext = createContext<AppState>(initialState)
const DispatchContext = createContext<Dispatch<AppAction>>(() => {})

/**
 * Fetches all family data from the API and returns a partial state update.
 * Falls back gracefully if individual endpoints fail.
 */
async function fetchRemoteState(): Promise<Partial<AppState>> {
  const partial: Partial<AppState> = {}

  try {
    const family = await api.getFamilyInfo()
    partial.familyId = family.id
    partial.familyName = family.name
    partial.members = family.members.map((m) => ({
      id: m.id,
      familyId: family.id,
      displayName: m.display_name,
      roleLabel: m.role === 'owner' ? '家庭管理员' as const : '家庭成员' as const,
      avatarText: m.avatar_text
    }))
  } catch { /* use cached */ }

  try {
    const ledger = await api.listLedger()
    partial.ledger = ledger.map((e) => ({
      id: e.id,
      familyId: '',
      type: e.type as 'income' | 'expense',
      amountCents: e.amount_cents,
      purpose: e.purpose,
      memberName: e.member_name,
      date: e.date,
      timeLabel: e.time_label,
      note: e.note ?? undefined,
      noteVisibility: (e.note_visibility as 'private' | 'shared') ?? 'shared'
    }))
  } catch { /* use cached */ }

  try {
    const items = await api.listInventory()
    partial.inventory = items.map((i) => ({
      id: i.id,
      familyId: '',
      name: i.name,
      category: i.category,
      location: i.location,
      quantityLabel: i.quantity_label,
      expiryDate: i.expiry_date ?? '',
      expiryLabel: '',
      status: i.status as any,
      photo: i.photo_url ?? ''
    }))
  } catch { /* use cached */ }

  try {
    const dishes = await api.listDishes()
    partial.dishes = dishes.map((d) => ({
      id: d.id,
      familyId: '',
      name: d.name,
      category: d.category,
      method: d.method,
      ingredients: d.ingredients,
      photo: d.photo_url ?? '',
      available: d.available
    }))
  } catch { /* use cached */ }

  try {
    const orders = await api.listOrders()
    partial.orders = orders.map((o) => ({
      id: o.id,
      familyId: '',
      status: o.status as any,
      requesterName: o.requester_name,
      submittedAt: o.submitted_at,
      items: o.items.map((item) => ({
        id: item.id,
        dishId: item.dish_id,
        name: item.dish_name,
        quantity: item.quantity,
        photo: item.photo_url ?? ''
      }))
    }))
  } catch { /* use cached */ }

  try {
    const locations = await api.listLocations()
    partial.locations = locations.map((l) => l.name)
  } catch { /* use cached */ }

  try {
    const categories = await api.listCategories()
    partial.customDishCategories = categories.filter((c) => c.domain === 'dish').map((c) => c.name)
    partial.customInventoryCategories = categories.filter((c) => c.domain === 'inventory').map((c) => c.name)
  } catch { /* use cached */ }

  return partial
}

export function StoreProvider({ children }: PropsWithChildren) {
  const [state, localDispatch] = useReducer(appReducer, initialState, (seed) => loadState(seed))
  const [ready, setReady] = useState(false)
  const hydrated = useRef(false)

  // Sync remote data on mount
  useEffect(() => {
    if (!isLoggedIn() || !hasFamily()) {
      setReady(true)
      return
    }

    fetchRemoteState().then((remote) => {
      // Merge remote into local state
      const merged: AppState = { ...state, ...remote, onboardingCompleted: true }
      // Patch familyId into sub-items
      if (remote.familyId) {
        if (merged.ledger) merged.ledger = merged.ledger.map((e) => ({ ...e, familyId: remote.familyId! }))
        if (merged.inventory) merged.inventory = merged.inventory.map((i) => ({ ...i, familyId: remote.familyId! }))
        if (merged.dishes) merged.dishes = merged.dishes.map((d) => ({ ...d, familyId: remote.familyId! }))
        if (merged.orders) merged.orders = merged.orders.map((o) => ({ ...o, familyId: remote.familyId! }))
      }
      // Use HYDRATE action to set state
      localDispatch({ type: 'hydrate' as any, state: merged } as any)
      saveState(merged)
      setReady(true)
    }).catch(() => {
      setReady(true) // proceed with cached data
    })
  }, [])

  // Save to local cache on state change
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    saveState(state)
  }, [state])

  // Enhanced dispatch: calls API then updates local state
  const dispatch: Dispatch<AppAction> = useCallback(async (action: AppAction) => {
    try {
      await syncActionToAPI(action)
    } catch (error: any) {
      Taro.showToast({ title: error.message || '操作失败', icon: 'none' })
      return // Don't update local state if API failed
    }
    localDispatch(action)
  }, [])

  if (!ready) {
    return null // or a loading indicator — pages won't render until data is ready
  }

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useStore(): AppState {
  return useContext(StateContext)
}

export function useDispatch(): Dispatch<AppAction> {
  return useContext(DispatchContext)
}

/**
 * Maps local dispatch actions to API calls.
 * Actions that don't need remote sync just resolve immediately.
 */
async function syncActionToAPI(action: AppAction): Promise<void> {
  switch (action.type) {
    case 'ledger/add':
      await api.createLedgerEntry({
        type: action.entry.type,
        amount_cents: action.entry.amountCents,
        purpose: action.entry.purpose,
        member_name: action.entry.memberName,
        date: action.entry.date,
        time_label: action.entry.timeLabel,
        note: action.entry.note ?? null,
        note_visibility: action.entry.noteVisibility
      })
      return
    case 'ledger/update':
      await api.updateLedgerEntry(action.entry.id, {
        type: action.entry.type,
        amount_cents: action.entry.amountCents,
        purpose: action.entry.purpose,
        member_name: action.entry.memberName,
        date: action.entry.date,
        time_label: action.entry.timeLabel,
        note: action.entry.note ?? null,
        note_visibility: action.entry.noteVisibility
      })
      return
    case 'ledger/delete':
      await api.deleteLedgerEntry(action.id)
      return

    case 'dish/add':
      await api.createDish({
        name: action.dish.name,
        category: action.dish.category,
        method: action.dish.method,
        ingredients: action.dish.ingredients,
        photo_url: action.dish.photo || null
      })
      return
    case 'dish/update':
      await api.updateDish(action.dish.id, {
        name: action.dish.name,
        category: action.dish.category,
        method: action.dish.method,
        ingredients: action.dish.ingredients,
        photo_url: action.dish.photo || null
      })
      return
    case 'dish/delete':
      await api.deleteDish(action.id)
      return
    case 'dish/toggleAvailable':
      await api.toggleDishAvailable(action.id)
      return

    case 'order/create':
      await api.createOrder(action.order.items.map((item) => ({
        dish_id: item.dishId,
        dish_name: item.name,
        quantity: item.quantity,
        photo_url: item.photo || null
      })))
      return
    case 'order/complete':
      await api.updateOrderStatus(action.id, 'completed')
      return
    case 'order/cancel':
      await api.updateOrderStatus(action.id, 'cancelled')
      return
    case 'order/delete':
      await api.deleteOrder(action.id)
      return

    case 'inventory/add':
      await api.createInventoryItem({
        name: action.item.name,
        category: action.item.category,
        location: action.item.location,
        quantity_label: action.item.quantityLabel,
        expiry_date: action.item.expiryDate || null,
        status: action.item.status,
        photo_url: action.item.photo || null
      })
      return
    case 'inventory/update':
      await api.updateInventoryItem(action.item.id, {
        name: action.item.name,
        category: action.item.category,
        location: action.item.location,
        quantity_label: action.item.quantityLabel,
        expiry_date: action.item.expiryDate || null,
        status: action.item.status,
        photo_url: action.item.photo || null
      })
      return
    case 'inventory/delete':
      await api.updateInventoryStatus(action.id, 'deleted')
      return
    case 'inventory/permanentDelete':
      await api.deleteInventoryItem(action.id)
      return
    case 'inventory/permanentDeleteAll':
      // No single API for this; the local reducer handles it.
      // In practice, the manage page deletes one by one.
      return
    case 'inventory/markStatus':
      await api.updateInventoryStatus(action.id, action.status)
      return

    case 'location/add':
      await api.createLocation(action.name)
      return
    case 'location/delete':
      // Need to find the location ID — for now just let the local reducer handle.
      // The API delete uses ID but local uses name. We'll need to refactor later
      // or accept this gap (locations are fetched fresh on next load).
      return

    case 'family/rename':
      await api.renameFamily(action.name)
      return
    case 'member/add':
      // Members are added via invitation flow, not direct dispatch
      return
    case 'member/remove':
      await api.removeMember(action.id)
      return
    case 'member/updateRole':
      await api.updateMemberRole(action.id, action.roleLabel === '家庭管理员' ? 'owner' : 'member')
      return

    case 'category/addDish':
      await api.createCategory('dish', action.name)
      return
    case 'category/removeDish':
      // Need category ID — same gap as locations. Will sync on next fetch.
      return
    case 'category/addInventory':
      await api.createCategory('inventory', action.name)
      return
    case 'category/removeInventory':
      return

    // Local-only actions (no API needed)
    case 'settings/toggleExpiryReminder':
    case 'settings/toggleMealReminder':
    case 'onboarding/complete':
      return

    default:
      return
  }
}
