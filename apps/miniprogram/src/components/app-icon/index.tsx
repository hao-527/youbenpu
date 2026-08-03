import { Image } from '@tarojs/components'
import type { IconNode } from 'lucide'
import { useMemo } from 'react'

interface AppIconProps {
  icon: IconNode
  size?: number
  color?: string
  strokeWidth?: number
  label?: string
  className?: string
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
const cache = new Map<string, string>()

function encodeBase64(value: string): string {
  let output = ''
  let index = 0

  while (index < value.length) {
    const first = value.charCodeAt(index++)
    const second = value.charCodeAt(index++)
    const third = value.charCodeAt(index++)
    const bitmap = (first << 16) | ((Number.isNaN(second) ? 0 : second) << 8) | (Number.isNaN(third) ? 0 : third)

    output += alphabet.charAt((bitmap >> 18) & 63)
    output += alphabet.charAt((bitmap >> 12) & 63)
    output += Number.isNaN(second) ? '=' : alphabet.charAt((bitmap >> 6) & 63)
    output += Number.isNaN(third) ? '=' : alphabet.charAt(bitmap & 63)
  }

  return output
}

function toSvgAttribute(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function escapeAttribute(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function iconToDataUri(icon: IconNode, size: number, color: string, strokeWidth: number): string {
  const key = `${JSON.stringify(icon)}:${size}:${color}:${strokeWidth}`
  const existing = cache.get(key)
  if (existing) return existing

  const nodes = icon.map(([tag, attributes]) => {
    const serialized = Object.entries(attributes)
      .filter(([name]) => name !== 'key')
      .map(([name, value]) => `${toSvgAttribute(name)}="${escapeAttribute(value)}"`)
      .join(' ')

    return `<${tag} ${serialized}/>`
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${nodes}</svg>`
  const dataUri = `data:image/svg+xml;base64,${encodeBase64(svg)}`
  cache.set(key, dataUri)
  return dataUri
}

export function AppIcon({
  icon,
  size = 24,
  color = '#0F172A',
  strokeWidth = 1.8,
  label,
  className
}: AppIconProps) {
  const source = useMemo(
    () => iconToDataUri(icon, size, color, strokeWidth),
    [icon, size, color, strokeWidth]
  )

  return (
    <Image
      className={className}
      style={{ width: `${size}px`, height: `${size}px` }}
      src={source}
      mode='aspectFit'
      aria-label={label}
    />
  )
}
