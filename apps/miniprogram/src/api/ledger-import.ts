/**
 * Bill import API — WeChat/Alipay statement files chosen from a chat via
 * wx.chooseMessageFile are uploaded here for parsing, previewed, then the
 * selected drafts are confirmed into the ledger.
 */
import Taro from '@tarojs/taro'

import { API } from './config'
import { post } from './http'
import { getToken } from './token'

export interface ImportDraft {
  fingerprint: string
  type: 'income' | 'expense'
  amount_cents: number
  purpose: string
  date: string
  time_label: string
  note: string
  counts_toward_total: boolean
  duplicate: boolean
}

export interface ImportPreview {
  source: 'wechat' | 'alipay'
  invalid: number
  total: number
  counted: number
  neutral: number
  drafts: ImportDraft[]
}

/**
 * Uploads a bill file (temp path from wx.chooseMessageFile) for parsing.
 * Uses Taro.uploadFile because the payload is multipart, not JSON. The auth
 * token is attached manually since uploadFile bypasses the http.ts wrapper.
 */
export async function importBill(filePath: string): Promise<ImportPreview> {
  const token = getToken()
  const response = await Taro.uploadFile({
    url: API.LEDGER_IMPORT,
    filePath,
    name: 'file',
    header: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 30000
  })

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(parseUploadError(response.data))
  }
  return JSON.parse(response.data) as ImportPreview
}

function parseUploadError(raw: string): string {
  try {
    const payload = JSON.parse(raw)
    return payload?.error?.message || '账单解析失败'
  } catch {
    return '账单解析失败'
  }
}

export interface ConfirmImportEntry {
  fingerprint: string
  type: 'income' | 'expense'
  amount_cents: number
  purpose: string
  date: string
  time_label: string
  note: string
  counts_toward_total: boolean
}

export interface ConfirmImportResult {
  imported: number
  skipped: number
}

/** Persists the user-selected drafts to the ledger (server dedupes again). */
export function confirmImport(entries: ConfirmImportEntry[]) {
  return post<ConfirmImportResult>(API.LEDGER_IMPORT_CONFIRM, { entries })
}
