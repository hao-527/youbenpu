export function formatYuan(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('金额必须使用 JavaScript 安全整数分')
  }

  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  const yuan = Math.floor(absolute / 100)
  const fraction = String(absolute % 100).padStart(2, '0')
  const grouped = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return `${sign}¥${grouped}.${fraction}`
}
