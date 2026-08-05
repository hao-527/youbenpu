import Taro from '@tarojs/taro'

import type {
  Dish,
  DishCategory,
  FamilyMember,
  FamilyRole,
  InventoryCategory,
  InventoryItem,
  InventoryStatus,
  LedgerEntry,
  MealOrder,
  MealOrderItem,
  MealOrderStatus,
  TransactionType
} from '../types/domain'
import { dishCategories, inventoryCategories } from '../types/domain'
import { formatLocalDate, getInventoryExpiry, inferExpiryDate, parseLocalDate } from '../utils/date'
import type { AppState } from './reducer'

const STORAGE_KEY = 'youbenpu_state'
const SCHEMA_VERSION = 2

/**
 * Matches the ledger form's own limit of 99,999,999.99. Without a ceiling,
 * readInteger would accept up to MAX_SAFE_INTEGER, and summing a few such
 * entries overflows past it — at which point formatYuan throws inside render
 * and blanks the page. Capping here keeps that unreachable.
 */
const MAX_AMOUNT_CENTS = 9_999_999_999

let storageWritesEnabled = true

type UnknownRecord = Record<string, unknown>

const orderStatuses: MealOrderStatus[] = ['pending', 'completed', 'cancelled']
const terminalInventoryStatuses: InventoryStatus[] = ['finished', 'discarded']

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function hasRequiredStateShape(source: UnknownRecord, version: number): boolean {
  const hasValidMember = Array.isArray(source.members) && source.members.some((member) => (
    isRecord(member) && Boolean(readString(member.id)) && Boolean(readString(member.displayName))
  ))
  const hasBaseCollections = Array.isArray(source.ledger)
    && Array.isArray(source.dishes)
    && Array.isArray(source.inventory)
    && Array.isArray(source.locations)

  if (!readString(source.familyId) || typeof source.familyName !== 'string' || !hasValidMember || !hasBaseCollections) {
    return false
  }
  if (version === 2) return Array.isArray(source.orders)
  if (version === 1) {
    return Object.prototype.hasOwnProperty.call(source, 'mealOrder')
      && (source.mealOrder === null || isRecord(source.mealOrder))
  }
  return false
}

function readLimitedString(value: unknown, maxLength: number, fallback = ''): string {
  return (readString(value) || fallback).slice(0, maxLength)
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readInteger(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function normalizeRole(value: unknown): FamilyRole {
  const role = readString(value).toLowerCase()
  return role === '家庭管理员' || role === '管理员' || role === 'admin' || role === 'owner'
    ? '家庭管理员'
    : '家庭成员'
}

function normalizeMembers(value: unknown, fallback: FamilyMember[], familyId: string): FamilyMember[] {
  const candidates = Array.isArray(value) ? value : fallback
  const usedIds = new Set<string>()
  const usedNames = new Set<string>()
  const members: FamilyMember[] = []

  candidates.forEach((candidate, index) => {
    if (!isRecord(candidate)) return
    const displayName = readLimitedString(candidate.displayName, 20)
    if (!displayName) return

    const id = readLimitedString(candidate.id, 80, `member-migrated-${index + 1}`)
    const normalizedName = displayName.toLowerCase()
    if (usedIds.has(id) || usedNames.has(normalizedName)) return

    usedIds.add(id)
    usedNames.add(normalizedName)
    members.push({
      id,
      familyId,
      displayName,
      roleLabel: normalizeRole(candidate.roleLabel),
      avatarText: readLimitedString(candidate.avatarText, 2, displayName.slice(0, 1))
    })
  })

  if (members.length === 0) {
    members.push({
      id: readString(fallback[0]?.id) || 'member-local-owner',
      familyId,
      displayName: readLimitedString(fallback[0]?.displayName, 20, '我'),
      roleLabel: '家庭管理员',
      avatarText: readLimitedString(fallback[0]?.avatarText, 2, '我')
    })
  }

  if (!members.some((member) => member.roleLabel === '家庭管理员')) {
    members[0] = { ...members[0], roleLabel: '家庭管理员' }
  }

  return members
}

function normalizeLedger(value: unknown, familyId: string, defaultMemberName: string): LedgerEntry[] {
  if (!Array.isArray(value)) return []
  const usedIds = new Set<string>()
  const entries: LedgerEntry[] = []

  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) return
    const id = readLimitedString(candidate.id, 80, `ledger-migrated-${index + 1}`)
    const purpose = readLimitedString(candidate.purpose, 50)
    const amountCents = readInteger(candidate.amountCents, 0, 0, MAX_AMOUNT_CENTS)
    if (!purpose || amountCents <= 0 || usedIds.has(id)) return

    const type: TransactionType = candidate.type === 'income' ? 'income' : 'expense'
    const rawDate = readString(candidate.date)
    const date = parseLocalDate(rawDate) ? rawDate : formatLocalDate()
    const note = readLimitedString(candidate.note, 300)
    usedIds.add(id)
    entries.push({
      id,
      familyId,
      type,
      amountCents,
      purpose,
      memberName: readLimitedString(candidate.memberName, 20, defaultMemberName),
      date,
      timeLabel: readLimitedString(candidate.timeLabel, 40, date),
      ...(note ? { note } : {}),
      noteVisibility: candidate.noteVisibility === 'private' ? 'private' : 'shared'
    })
  })

  return entries
}

function normalizeDishes(value: unknown, familyId: string): Dish[] {
  if (!Array.isArray(value)) return []
  const usedIds = new Set<string>()
  const dishes: Dish[] = []

  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) return
    const id = readLimitedString(candidate.id, 80, `dish-migrated-${index + 1}`)
    const name = readLimitedString(candidate.name, 40)
    if (!name || usedIds.has(id)) return

    const ingredients = Array.isArray(candidate.ingredients)
      ? Array.from(new Set(candidate.ingredients.map((item) => readLimitedString(item, 30)).filter(Boolean)))
      : []
    const category = (dishCategories as readonly string[]).includes(candidate.category as string)
      ? candidate.category as string
      : readString(candidate.category) || '其他'

    usedIds.add(id)
    dishes.push({
      id,
      familyId,
      name,
      category,
      method: readLimitedString(candidate.method, 500),
      ingredients,
      photo: readString(candidate.photo),
      available: readBoolean(candidate.available, true)
    })
  })

  return dishes
}

function normalizeOrderItems(value: unknown, orderId: string, usedItemIds: Set<string>): MealOrderItem[] {
  if (!Array.isArray(value)) return []
  const items: MealOrderItem[] = []

  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) return
    const id = readLimitedString(candidate.id, 80, `${orderId}-item-${index + 1}`)
    const name = readLimitedString(candidate.name, 40)
    if (!name || usedItemIds.has(id)) return

    usedItemIds.add(id)
    items.push({
      id,
      dishId: readLimitedString(candidate.dishId, 80, `dish-snapshot-${index + 1}`),
      name,
      quantity: readInteger(candidate.quantity, 1, 1, 99),
      photo: readString(candidate.photo)
    })
  })

  return items
}

function normalizeOrders(source: UnknownRecord, familyId: string, defaultMemberName: string): MealOrder[] {
  const candidates = Array.isArray(source.orders)
    ? source.orders
    : isRecord(source.mealOrder)
      ? [source.mealOrder]
      : []
  const usedIds = new Set<string>()
  const usedItemIds = new Set<string>()
  const orders: MealOrder[] = []
  let hasPendingOrder = false

  candidates.forEach((candidate, index) => {
    if (!isRecord(candidate)) return
    const id = readLimitedString(candidate.id, 80, `order-migrated-${index + 1}`)
    if (usedIds.has(id)) return
    const items = normalizeOrderItems(candidate.items, id, usedItemIds)
    if (items.length === 0) return

    const rawStatus = orderStatuses.includes(candidate.status as MealOrderStatus)
      ? candidate.status as MealOrderStatus
      : 'pending'
    const status: MealOrderStatus = rawStatus === 'pending' && hasPendingOrder ? 'cancelled' : rawStatus
    if (status === 'pending') hasPendingOrder = true

    usedIds.add(id)
    orders.push({
      id,
      familyId,
      status,
      requesterName: readLimitedString(candidate.requesterName, 20, defaultMemberName),
      submittedAt: readLimitedString(candidate.submittedAt, 50, '历史记录'),
      items
    })
  })

  return orders
}

function normalizeExpiryDate(candidate: UnknownRecord): string {
  const explicitDate = readString(candidate.expiryDate)
  if (parseLocalDate(explicitDate)) return explicitDate

  const inferredDate = inferExpiryDate(readString(candidate.expiryLabel))
  return parseLocalDate(inferredDate) ? inferredDate : ''
}

function normalizeInventory(value: unknown, familyId: string): InventoryItem[] {
  if (!Array.isArray(value)) return []
  const usedIds = new Set<string>()
  const items: InventoryItem[] = []

  value.forEach((candidate, index) => {
    if (!isRecord(candidate)) return
    const id = readLimitedString(candidate.id, 80, `inventory-migrated-${index + 1}`)
    const name = readLimitedString(candidate.name, 40)
    const location = readLimitedString(candidate.location, 20)
    if (!name || !location || usedIds.has(id)) return

    const expiryDate = normalizeExpiryDate(candidate)
    const expiry = getInventoryExpiry(expiryDate)
    const storedStatus = terminalInventoryStatuses.includes(candidate.status as InventoryStatus)
      ? candidate.status as Extract<InventoryStatus, 'finished' | 'discarded'>
      : null
    const category = (inventoryCategories as readonly string[]).includes(candidate.category as string)
      ? candidate.category as string
      : readString(candidate.category) || '日用品'

    usedIds.add(id)
    items.push({
      id,
      familyId,
      name,
      category,
      location,
      quantityLabel: readLimitedString(candidate.quantityLabel, 30, '1 件'),
      expiryDate,
      expiryLabel: storedStatus === 'finished'
        ? '已用完'
        : storedStatus === 'discarded'
          ? '已丢弃'
          : expiry.label,
      status: storedStatus ?? expiry.status,
      photo: readString(candidate.photo)
    })
  })

  return items
}

function normalizeLocations(value: unknown, fallback: string[], inventory: InventoryItem[]): {
  locations: string[]
  canonicalNames: Map<string, string>
} {
  const sourceLocations = Array.isArray(value) ? value : fallback
  const candidates = [...sourceLocations, ...inventory.map((item) => item.location)]
  const canonicalNames = new Map<string, string>()
  const locations: string[] = []

  candidates.forEach((candidate) => {
    const location = readLimitedString(candidate, 20)
    const normalized = location.toLowerCase()
    if (!location || canonicalNames.has(normalized)) return
    canonicalNames.set(normalized, location)
    locations.push(location)
  })

  return { locations, canonicalNames }
}

function migrateState(source: UnknownRecord, fallback: AppState): AppState {
  const familyId = readLimitedString(source.familyId, 80, fallback.familyId)
  const familyName = readLimitedString(source.familyName, 20, fallback.familyName)
  const members = normalizeMembers(source.members, fallback.members, familyId)
  const requestedCurrentMemberId = readString(source.currentMemberId)
  const currentMemberId = members.some((member) => member.id === requestedCurrentMemberId)
    ? requestedCurrentMemberId
    : members.some((member) => member.id === fallback.currentMemberId)
      ? fallback.currentMemberId
      : members[0].id
  const currentMemberName = members.find((member) => member.id === currentMemberId)?.displayName ?? members[0].displayName
  const rawInventory = normalizeInventory(source.inventory, familyId)
  const { locations, canonicalNames } = normalizeLocations(source.locations, fallback.locations, rawInventory)
  const inventory = rawInventory.map((item) => ({
    ...item,
    location: canonicalNames.get(item.location.toLowerCase()) ?? item.location
  }))
  const settings = isRecord(source.settings) ? source.settings : {}

  const customDishCategories = Array.isArray(source.customDishCategories)
    ? [...new Set(source.customDishCategories.map((item) => readLimitedString(item, 10)).filter(Boolean))]
    : []
  const customInventoryCategories = Array.isArray(source.customInventoryCategories)
    ? [...new Set(source.customInventoryCategories.map((item) => readLimitedString(item, 10)).filter(Boolean))]
    : []

  return {
    schemaVersion: SCHEMA_VERSION,
    familyId,
    currentMemberId,
    familyName,
    members,
    ledger: normalizeLedger(source.ledger, familyId, currentMemberName),
    dishes: normalizeDishes(source.dishes, familyId),
    orders: normalizeOrders(source, familyId, currentMemberName),
    inventory,
    locations,
    customDishCategories,
    customInventoryCategories,
    settings: {
      expiryReminder: readBoolean(settings.expiryReminder, fallback.settings.expiryReminder),
      mealReminder: readBoolean(settings.mealReminder, fallback.settings.mealReminder)
    },
    onboardingCompleted: readBoolean(source.onboardingCompleted, fallback.onboardingCompleted)
  }
}

export function loadState(fallback: AppState): AppState {
  storageWritesEnabled = true
  try {
    const storedValue: unknown = Taro.getStorageSync(STORAGE_KEY)
    if (storedValue === '' || storedValue === null || storedValue === undefined) return fallback

    const parsed: unknown = typeof storedValue === 'string' ? JSON.parse(storedValue) : storedValue
    if (!isRecord(parsed)) throw new Error('Stored state is not an object')

    const rawVersion = parsed.schemaVersion
    const storedVersion = rawVersion === undefined ? 1 : rawVersion
    if (typeof storedVersion !== 'number' || !Number.isInteger(storedVersion)) {
      throw new Error('Stored schema version is invalid')
    }
    if (storedVersion > SCHEMA_VERSION) {
      storageWritesEnabled = false
      return fallback
    }
    if (!hasRequiredStateShape(parsed, storedVersion)) {
      throw new Error('Stored state is incomplete or unsupported')
    }

    return migrateState(parsed, fallback)
  } catch {
    storageWritesEnabled = true
    try {
      Taro.removeStorageSync(STORAGE_KEY)
    } catch { /* ignore cleanup errors */ }
    return fallback
  }
}

export function saveState(state: AppState): void {
  if (!storageWritesEnabled) return
  try {
    Taro.setStorageSync(STORAGE_KEY, JSON.stringify({ ...state, schemaVersion: SCHEMA_VERSION }))
  } catch { /* ignore storage quota and serialization errors */ }
}
