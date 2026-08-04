import type { InventoryStatus } from '../types/domain'

const DAY_MS = 24 * 60 * 60 * 1000

export function formatLocalDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return formatLocalDate(date) === value ? date : null
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function daysBetween(from: Date, to: Date): number {
  const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const toDay = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((toDay - fromDay) / DAY_MS)
}

export function getPreviousDate(value: string): string {
  const date = parseLocalDate(value) ?? new Date()
  return formatLocalDate(addDays(date, -1))
}

export function getNaturalMonthStart(months: number, now = new Date()): string {
  return formatLocalDate(new Date(now.getFullYear(), now.getMonth() - Math.max(0, months - 1), 1))
}

export function getInventoryExpiry(expiryDate: string, now = new Date()): {
  status: Extract<InventoryStatus, 'normal' | 'expiring' | 'expired'>
  label: string
  days: number | null
} {
  const expiry = parseLocalDate(expiryDate)
  if (!expiry) return { status: 'normal', label: '无需提醒', days: null }

  const days = daysBetween(now, expiry)
  if (days < 0) return { status: 'expired', label: `已过期 ${Math.abs(days)} 天`, days }
  if (days === 0) return { status: 'expiring', label: '今天到期', days }
  if (days === 1) return { status: 'expiring', label: '明天到期', days }
  return {
    status: days <= 7 ? 'expiring' : 'normal',
    label: `还有 ${days} 天`,
    days
  }
}

export function inferExpiryDate(label: string, now = new Date()): string {
  const absolute = label.match(/^(\d{4}-\d{2}-\d{2})/)
  if (absolute && parseLocalDate(absolute[1])) return absolute[1]
  if (label.includes('今天')) return formatLocalDate(now)
  if (label.includes('明天')) return formatLocalDate(addDays(now, 1))

  const future = label.match(/还有\s*(\d+)\s*天/)
  if (future) return formatLocalDate(addDays(now, Number(future[1])))
  const expired = label.match(/已过期\s*(\d+)\s*天/)
  if (expired) return formatLocalDate(addDays(now, -Number(expired[1])))
  return ''
}
