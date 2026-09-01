/** API base URL — injected by Taro defineConstants per environment */
declare const API_BASE_URL: string

const API_BASE = typeof API_BASE_URL !== 'undefined'
  ? API_BASE_URL
  : 'http://127.0.0.1:8080'

export const API = {
  BASE: API_BASE,
  AUTH_LOGIN: `${API_BASE}/api/v1/auth/login`,
  FAMILY: `${API_BASE}/api/v1/family`,
  FAMILY_INFO: `${API_BASE}/api/v1/family/info`,
  FAMILY_RENAME: `${API_BASE}/api/v1/family/rename`,
  FAMILY_INVITE: `${API_BASE}/api/v1/family/invite`,
  FAMILY_JOIN: `${API_BASE}/api/v1/family/join`,
  FAMILY_LEAVE: `${API_BASE}/api/v1/family/leave`,
  FAMILY_MEMBER_ROLE: `${API_BASE}/api/v1/family/member/role`,
  FAMILY_MEMBER_REMOVE: `${API_BASE}/api/v1/family/member`,
  LEDGER: `${API_BASE}/api/v1/ledger`,
  INVENTORY: `${API_BASE}/api/v1/inventory`,
  INVENTORY_BATCH_DELETE: `${API_BASE}/api/v1/inventory/batch`,
  DISHES: `${API_BASE}/api/v1/dishes`,
  ORDERS: `${API_BASE}/api/v1/orders`,
  LOCATIONS: `${API_BASE}/api/v1/locations`,
  CATEGORIES: `${API_BASE}/api/v1/categories`,
  UPLOAD: `${API_BASE}/api/v1/upload`,
  UPLOAD_PRESIGN: `${API_BASE}/api/v1/upload/presign`,
} as const
