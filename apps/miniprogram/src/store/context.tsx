import Taro from '@tarojs/taro'
import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react'
import type { PropsWithChildren } from 'react'

import * as api from '../api'
import { getUserInfo, hasFamily, isLoggedIn, onSessionCleared } from '../api/token'
import { getPortableImageUrl } from '../utils/image-source'
import { initialState } from './initial-state'
import { appReducer, type AppAction, type AppState } from './reducer'
import { clearStateStorage, loadState, saveState } from './storage'

export type AppDispatch = (action: AppAction) => Promise<boolean>

const StateContext = createContext<AppState>(initialState)
const DispatchContext = createContext<AppDispatch>(async () => false)
const RefreshContext = createContext<() => Promise<void>>(async () => {})
const MaybeRefreshContext = createContext<() => Promise<void>>(async () => {})

/**
 * Fetches all family data from the API and returns a partial state update.
 * Falls back gracefully if individual endpoints fail.
 */
async function fetchRemoteState(): Promise<Partial<AppState>> {
  const partial: Partial<AppState> = {}
  let remoteFetchFailed = false

  try {
    const family = await api.getFamilyInfo()
    partial.familyId = family.id
    partial.familyName = family.name
    const members = family.members.map((m) => ({
      id: m.id,
      familyId: family.id,
      displayName: m.display_name,
      roleLabel: m.role === 'owner' ? '家庭管理员' as const : '家庭成员' as const,
      avatarText: m.avatar_text
    }))
    partial.members = members

    // Member IDs are user IDs in the family-info response. Use the logged-in
    // identity so Profile represents the actual person rather than whichever
    // family member happens to be first in the list.
    const currentUserId = getUserInfo()?.userId
    partial.currentMemberId = members.find((member) => member.id === currentUserId)?.id ?? members[0]?.id ?? ''
  } catch { remoteFetchFailed = true }

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
      noteVisibility: (e.note_visibility as 'private' | 'shared') ?? 'shared',
      // Older API responses omit the flag; treat missing as counting so manual
      // entries and legacy data behave unchanged.
      countsTowardTotal: e.counts_toward_total !== false
    }))
  } catch { remoteFetchFailed = true }

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
      photo: getPortableImageUrl(i.photo_url)
    }))
  } catch { remoteFetchFailed = true }

  try {
    const dishes = await api.listDishes()
    partial.dishes = dishes.map((d) => ({
      id: d.id,
      familyId: '',
      name: d.name,
      category: d.category,
      method: d.method,
      ingredients: d.ingredients,
      photo: getPortableImageUrl(d.photo_url),
      available: d.available
    }))
  } catch { remoteFetchFailed = true }

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
        photo: getPortableImageUrl(item.photo_url)
      }))
    }))
  } catch { remoteFetchFailed = true }

  try {
    const locations = await api.listLocations()
    partial.locations = locations.map((l) => l.name)
  } catch { remoteFetchFailed = true }

  try {
    const categories = await api.listCategories()
    partial.customDishCategories = categories.filter((c) => c.domain === 'dish').map((c) => c.name)
    partial.customInventoryCategories = categories.filter((c) => c.domain === 'inventory').map((c) => c.name)
  } catch { remoteFetchFailed = true }

  if (remoteFetchFailed) {
    throw new Error('家庭数据暂时无法完整刷新')
  }
  return partial
}

export function StoreProvider({ children }: PropsWithChildren) {
  const [state, localDispatch] = useReducer(appReducer, initialState, (seed) => loadState(seed))
  const stateRef = useRef<AppState>(initialState)
  const hydrated = useRef(false)
  const sessionGeneration = useRef(0)
  const lastRefreshAt = useRef(0)
  stateRef.current = state

  useEffect(() => onSessionCleared(() => {
    sessionGeneration.current += 1
    clearStateStorage()
    localDispatch({ type: 'hydrate', state: initialState })
  }), [])

  /**
   * Pulls the full family dataset from the API and replaces local state.
   * No-op when the user has no family yet (nothing to fetch).
   * Callable at any time — e.g. right after the user creates or joins a
   * family from the family-setup sheet, so pages refresh without a restart.
   */
  const refresh = useCallback(async () => {
    if (!isLoggedIn() || !hasFamily()) return
    const generation = sessionGeneration.current
    const remote = await fetchRemoteState()
    if (generation !== sessionGeneration.current || !isLoggedIn() || !hasFamily()) return

    const familyId = remote.familyId
    if (!familyId || getUserInfo()?.familyId !== familyId) {
      throw new Error('家庭身份已变化，请重新进入')
    }

    // A successful refresh is a complete replacement of family data. Never
    // merge old-family arrays with a partial or newly joined family snapshot.
    const merged: AppState = {
      ...initialState,
      ...remote,
      onboardingCompleted: stateRef.current.onboardingCompleted,
      settings: stateRef.current.settings,
      ledger: (remote.ledger ?? []).map((entry) => ({ ...entry, familyId })),
      inventory: (remote.inventory ?? []).map((item) => ({ ...item, familyId })),
      dishes: (remote.dishes ?? []).map((dish) => ({ ...dish, familyId })),
      orders: (remote.orders ?? []).map((order) => ({ ...order, familyId }))
    }
    localDispatch({ type: 'hydrate', state: merged })
    saveState(merged)
    lastRefreshAt.current = Date.now()
  }, [])

  // Throttled refresh for tab re-entry (useDidShow). Switching tabs should pull
  // fresh family data so one member sees another's edits without restarting the
  // app, but without hammering the API on every quick tab toggle. Failures are
  // swallowed so cached content stays visible.
  const REFRESH_MIN_INTERVAL_MS = 8000
  const maybeRefresh = useCallback(async () => {
    if (!isLoggedIn() || !hasFamily()) return
    if (Date.now() - lastRefreshAt.current < REFRESH_MIN_INTERVAL_MS) return
    try {
      await refresh()
    } catch {
      // Keep showing cached data; the next tab switch will retry.
    }
  }, [refresh])

  // Authenticate and refresh in the background. Pages render from cache (or
  // the empty first-run state) immediately so a delayed real-device callback
  // can never leave the entire tab page blank.
  useEffect(() => {
    const bootstrap = async () => {
      try {
        await api.ensureLoggedIn()
        await refresh()
      } catch {
        // Offline failures keep cached content visible and can retry next launch.
      }
    }

    void bootstrap()
  }, [refresh])

  // Save to local cache on state change
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    saveState(state)
  }, [state])

  // Remote-first dispatch. The API may replace client-generated IDs with the
  // canonical server ID before the reducer updates local state.
  const dispatch: AppDispatch = useCallback(async (action: AppAction) => {
    try {
      const syncedAction = await syncActionToAPI(action)
      localDispatch(syncedAction)
      return true
    } catch (error: any) {
      Taro.showToast({ title: error.message || '操作失败', icon: 'none' })
      return false
    }
  }, [])

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        <RefreshContext.Provider value={refresh}>
          <MaybeRefreshContext.Provider value={maybeRefresh}>
            {children}
          </MaybeRefreshContext.Provider>
        </RefreshContext.Provider>
      </DispatchContext.Provider>
    </StateContext.Provider>
  )
}

/** Re-fetches all family data from the API (always). */
export function useRefreshStore(): () => Promise<void> {
  return useContext(RefreshContext)
}

/**
 * Throttled refresh for tab re-entry. Call from a tab page's `useDidShow` so
 * members see each other's edits when switching tabs, without an API call on
 * every quick toggle. Skips if refreshed within the last few seconds.
 */
export function useMaybeRefreshStore(): () => Promise<void> {
  return useContext(MaybeRefreshContext)
}

export function useStore(): AppState {
  return useContext(StateContext)
}

export function useDispatch(): AppDispatch {
  return useContext(DispatchContext)
}

/**
 * Maps local actions to API calls and returns the canonical action that should
 * be committed to local state. Create operations replace temporary client IDs
 * with the IDs assigned by the server.
 */
async function syncActionToAPI(action: AppAction): Promise<AppAction> {
  switch (action.type) {
    case 'ledger/add': {
      const created = await api.createLedgerEntry({
        type: action.entry.type,
        amount_cents: action.entry.amountCents,
        purpose: action.entry.purpose,
        member_name: action.entry.memberName,
        date: action.entry.date,
        time_label: action.entry.timeLabel,
        note: action.entry.note ?? null,
        note_visibility: action.entry.noteVisibility
      })
      return { ...action, entry: { ...action.entry, id: created.id } }
    }
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
      return action
    case 'ledger/delete':
      await api.deleteLedgerEntry(action.id)
      return action

    case 'dish/add': {
      const created = await api.createDish({
        name: action.dish.name,
        category: action.dish.category,
        method: action.dish.method,
        ingredients: action.dish.ingredients,
        photo_url: getPortableImageUrl(action.dish.photo) || null
      })
      return { ...action, dish: { ...action.dish, id: created.id } }
    }
    case 'dish/update':
      await api.updateDish(action.dish.id, {
        name: action.dish.name,
        category: action.dish.category,
        method: action.dish.method,
        ingredients: action.dish.ingredients,
        photo_url: getPortableImageUrl(action.dish.photo) || null
      })
      return action
    case 'dish/delete':
      await api.deleteDish(action.id)
      return action
    case 'dish/toggleAvailable':
      await api.toggleDishAvailable(action.id)
      return action

    case 'order/create': {
      const created = await api.createOrder(action.order.items.map((item) => ({
        dish_id: item.dishId,
        dish_name: item.name,
        quantity: item.quantity,
        photo_url: getPortableImageUrl(item.photo) || null
      })))
      return { ...action, order: { ...action.order, id: created.id } }
    }
    case 'order/complete':
      await api.updateOrderStatus(action.id, 'completed')
      return action
    case 'order/cancel':
      await api.updateOrderStatus(action.id, 'cancelled')
      return action
    case 'order/delete':
      await api.deleteOrder(action.id)
      return action

    case 'inventory/add': {
      const created = await api.createInventoryItem({
        name: action.item.name,
        category: action.item.category,
        location: action.item.location,
        quantity_label: action.item.quantityLabel,
        expiry_date: action.item.expiryDate || null,
        status: action.item.status,
        photo_url: getPortableImageUrl(action.item.photo) || null
      })
      return { ...action, item: { ...action.item, id: created.id } }
    }
    case 'inventory/update':
      await api.updateInventoryItem(action.item.id, {
        name: action.item.name,
        category: action.item.category,
        location: action.item.location,
        quantity_label: action.item.quantityLabel,
        expiry_date: action.item.expiryDate || null,
        status: action.item.status,
        photo_url: getPortableImageUrl(action.item.photo) || null
      })
      return action
    case 'inventory/delete':
      await api.updateInventoryStatus(action.id, 'deleted')
      return action
    case 'inventory/permanentDelete':
      await api.deleteInventoryItem(action.id)
      return action
    case 'inventory/permanentDeleteAll':
      await api.deleteInventoryItems(action.ids)
      return action
    case 'inventory/markStatus':
      await api.updateInventoryStatus(action.id, action.status)
      return action

    case 'location/add':
      await api.createLocation(action.name)
      return action
    case 'location/delete': {
      const locations = await api.listLocations()
      const location = locations.find((item) => item.name === action.name)
      if (!location) throw new Error('位置不存在或已被删除')
      await api.deleteLocation(location.id)
      return action
    }

    case 'family/rename':
      await api.renameFamily(action.name)
      return action
    case 'member/remove':
      await api.removeMember(action.id)
      return action
    case 'member/updateRole':
      await api.updateMemberRole(action.id, action.roleLabel === '家庭管理员' ? 'owner' : 'member')
      return action

    case 'category/addDish':
      await api.createCategory('dish', action.name)
      return action
    case 'category/removeDish': {
      const categories = await api.listCategories('dish')
      const category = categories.find((item) => item.name === action.name)
      if (!category) throw new Error('分类不存在或已被删除')
      await api.deleteCategory(category.id)
      return action
    }
    case 'category/addInventory':
      await api.createCategory('inventory', action.name)
      return action
    case 'category/removeInventory': {
      const categories = await api.listCategories('inventory')
      const category = categories.find((item) => item.name === action.name)
      if (!category) throw new Error('分类不存在或已被删除')
      await api.deleteCategory(category.id)
      return action
    }

    // Local-only actions.
    case 'settings/toggleExpiryReminder':
    case 'settings/toggleMealReminder':
    case 'onboarding/complete':
    case 'hydrate':
      return action
  }
}
