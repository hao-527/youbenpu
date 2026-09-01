/**
 * JS-side mirror of the semantic color tokens in `app.scss`.
 *
 * Icons are rendered as inline SVG data URIs (see `components/app-icon`), so
 * their stroke color cannot inherit a CSS variable and has to be passed in.
 * Keep these values in sync with the `page { ... }` token block.
 *
 * Neutrals are warm (hue ~30) to sit with the red-orange brand — a cool slate
 * ramp against a warm primary is what made the UI read muddy.
 *
 * Dark mode: `app.scss` ships a `prefers-color-scheme: dark` block, but WeChat
 * only honors it when `"darkmode": true` is declared in the app config. That
 * flag is intentionally off today, so only these light values are ever used.
 */
export const palette = {
  primary: '#E8530E',
  /** Brand orange is 3.7:1 on white — use this darker step for small text. */
  primaryText: '#BE4009',
  /** Filled controls that carry white label text (4.87:1). */
  primarySurface: '#C9440A',
  primaryLight: '#FFF1EB',
  onPrimary: '#FFFFFF',
  foreground: '#29241F',
  muted: '#EFEBE3',
  mutedForeground: '#514941',
  subtleForeground: '#746A5F',
  /** Decorative separators only — never use for glyphs. */
  border: '#DED7CC',
  /** Disabled controls, where the 3:1 minimum does not apply. */
  disabledForeground: '#9B9082',
  accent: '#E8530E',
  destructive: '#DC2626',
  /** Deepened from #059669 (3.77:1) so income amounts clear 4.5:1. */
  success: '#047F5A',
  background: '#F7F4EE'
} as const
