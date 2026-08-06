/**
 * API client — thin wrappers around HTTP calls matching the Go backend.
 */
import Taro from '@tarojs/taro'

import { API } from './config'
import { del, get, post, put } from './http'
import { setToken, setUserInfo, type UserInfo } from './token'

// ===== Auth =====

interface LoginResponse {
  token: string
  user_id: string
  family_id: string | null
  display_name: string
  role: string
  is_new_user: boolean
}

export async function login(): Promise<LoginResponse & { userInfo: UserInfo }> {
  const { code } = await Taro.login()
  const data = await post<LoginResponse>(API.AUTH_LOGIN, { code }, { noAuth: true })

  setToken(data.token)
  const userInfo: UserInfo = {
    userId: data.user_id,
    familyId: data.family_id,
    displayName: data.display_name,
    role: data.role
  }
  setUserInfo(userInfo)
  return { ...data, userInfo }
}

// ===== Family =====

interface FamilyInfo {
  id: string
  name: string
  members: Array<{
    id: string
    display_name: string
    role: string
    avatar_text: string
  }>
}

export function createFamily(name: string, displayName: string) {
  return post<{ id: string; name: string }>(API.FAMILY, { name, display_name: displayName })
}

export function getFamilyInfo() {
  return get<FamilyInfo>(API.FAMILY_INFO)
}

export function renameFamily(name: string) {
  return put<{ name: string }>(API.FAMILY_RENAME, { name })
}

export function createInvitation() {
  return post<{ code: string; expires_at: string }>(API.FAMILY_INVITE)
}

export function joinFamily(code: string, displayName: string) {
  return post<{ family_id: string; message: string }>(API.FAMILY_JOIN, { code, display_name: displayName })
}

export function leaveFamily() {
  return post<{ message: string }>(API.FAMILY_LEAVE)
}

export function updateMemberRole(memberId: string, role: string) {
  return put<{ message: string }>(API.FAMILY_MEMBER_ROLE, { member_id: memberId, role })
}

export function removeMember(memberId: string) {
  return del<{ message: string }>(API.FAMILY_MEMBER_REMOVE, { member_id: memberId })
}

// ===== Ledger =====

export interface LedgerEntryDTO {
  id: string
  type: string
  amount_cents: number
  purpose: string
  member_name: string
  date: string
  time_label: string
  note?: string | null
  note_visibility: string
}

export function listLedger(month?: string) {
  return get<LedgerEntryDTO[]>(API.LEDGER, { params: month ? { month } : {} })
}

export function createLedgerEntry(entry: Omit<LedgerEntryDTO, 'id'>) {
  return post<{ id: string }>(API.LEDGER, entry)
}

export function updateLedgerEntry(id: string, entry: Omit<LedgerEntryDTO, 'id'>) {
  return put<{ id: string }>(`${API.LEDGER}/${id}`, entry)
}

export function deleteLedgerEntry(id: string) {
  return del<{ message: string }>(`${API.LEDGER}/${id}`)
}

// ===== Inventory =====

export interface InventoryItemDTO {
  id: string
  name: string
  category: string
  location: string
  quantity_label: string
  expiry_date: string | null
  status: string
  photo_url: string | null
}

export function listInventory(status?: string) {
  return get<InventoryItemDTO[]>(API.INVENTORY, { params: status ? { status } : {} })
}

export function createInventoryItem(item: Omit<InventoryItemDTO, 'id'>) {
  return post<{ id: string }>(API.INVENTORY, item)
}

export function updateInventoryItem(id: string, item: Omit<InventoryItemDTO, 'id'>) {
  return put<{ id: string }>(`${API.INVENTORY}/${id}`, item)
}

export function updateInventoryStatus(id: string, status: string) {
  return put<{ id: string; status: string }>(`${API.INVENTORY}/${id}/status`, { status })
}

export function deleteInventoryItem(id: string) {
  return del<{ message: string }>(`${API.INVENTORY}/${id}`)
}

// ===== Dishes =====

export interface DishDTO {
  id: string
  name: string
  category: string
  method: string
  ingredients: string[]
  photo_url: string | null
  available: boolean
}

export function listDishes() {
  return get<DishDTO[]>(API.DISHES)
}

export function createDish(dish: Omit<DishDTO, 'id' | 'available'>) {
  return post<{ id: string }>(API.DISHES, dish)
}

export function updateDish(id: string, dish: Omit<DishDTO, 'id' | 'available'>) {
  return put<{ id: string }>(`${API.DISHES}/${id}`, dish)
}

export function toggleDishAvailable(id: string) {
  return put<{ id: string }>(`${API.DISHES}/${id}/toggle`)
}

export function deleteDish(id: string) {
  return del<{ message: string }>(`${API.DISHES}/${id}`)
}

// ===== Orders =====

export interface OrderItemDTO {
  id: string
  dish_id: string
  dish_name: string
  quantity: number
  photo_url: string | null
}

export interface OrderDTO {
  id: string
  requester_name: string
  status: string
  submitted_at: string
  items: OrderItemDTO[]
}

export function listOrders() {
  return get<OrderDTO[]>(API.ORDERS)
}

export function createOrder(items: Array<{ dish_id: string; dish_name: string; quantity: number; photo_url?: string | null }>) {
  return post<{ id: string }>(API.ORDERS, { items })
}

export function updateOrderStatus(id: string, status: 'completed' | 'cancelled') {
  return put<{ id: string; status: string }>(`${API.ORDERS}/${id}/status`, { status })
}

export function deleteOrder(id: string) {
  return del<{ message: string }>(`${API.ORDERS}/${id}`)
}

// ===== Locations =====

export interface LocationDTO {
  id: string
  name: string
}

export function listLocations() {
  return get<LocationDTO[]>(API.LOCATIONS)
}

export function createLocation(name: string) {
  return post<{ id: string; name: string }>(API.LOCATIONS, { name })
}

export function deleteLocation(id: string) {
  return del<{ message: string }>(`${API.LOCATIONS}/${id}`)
}

// ===== Categories =====

export interface CategoryDTO {
  id: string
  domain: string
  name: string
}

export function listCategories(domain?: 'dish' | 'inventory') {
  return get<CategoryDTO[]>(API.CATEGORIES, { params: domain ? { domain } : {} })
}

export function createCategory(domain: 'dish' | 'inventory', name: string) {
  return post<{ id: string; domain: string; name: string }>(API.CATEGORIES, { domain, name })
}

export function deleteCategory(id: string) {
  return del<{ message: string }>(`${API.CATEGORIES}/${id}`)
}

// ===== Upload =====

export interface PresignResult {
  url: string
  key: string
  policy: string
  signature: string
  secret_id: string
}

export function getUploadPresign(ext: string) {
  return post<PresignResult>(API.UPLOAD_PRESIGN, { ext })
}
