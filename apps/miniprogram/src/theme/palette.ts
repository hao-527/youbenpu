/**
 * JS-side mirror of the semantic color tokens in `app.scss`.
 *
 * Icons are rendered as inline SVG data URIs (see `components/app-icon`), so
 * their stroke color cannot inherit a CSS variable and has to be passed in.
 * Keep these values in sync with the `page { ... }` token block.
 *
 * Dark mode: `app.scss` already ships a `prefers-color-scheme: dark` block, but
 * WeChat only honors it when `"darkmode": true` is declared in the app config.
 * That flag is intentionally off today, so only the light values below are ever
 * used. If dark mode is switched on, this file needs a matching dark set.
 */
export const palette = {
  primary: '#E8530E',
  primaryLight: '#FFF1EB',
  onPrimary: '#FFFFFF',
  foreground: '#0F172A',
  muted: '#F1F5F9',
  mutedForeground: '#475569',
  subtleForeground: '#64748B',
  /** Decorative separators only — 1.5:1 on white, never use for glyphs. */
  border: '#E2E8F0',
  /** Disabled controls, where the 3:1 minimum does not apply. */
  disabledForeground: '#94A3B8',
  accent: '#E8530E',
  warning: '#B45309',
  destructive: '#DC2626',
  success: '#059669',
  background: '#F8FAFC'
} as const
