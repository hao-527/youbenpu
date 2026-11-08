/**
 * JS-side mirror of the semantic color tokens in `app.scss`.
 *
 * Icons are rendered as inline SVG data URIs (see `components/app-icon`), so
 * their stroke color cannot inherit a CSS variable and has to be passed in.
 * Keep these values in sync with the `page { ... }` token block.
 *
 * Warm paper surfaces and coral define the current visual system.
 *
 * Dark mode: `app.scss` ships a `prefers-color-scheme: dark` block, but WeChat
 * only honors it when `"darkmode": true` is declared in the app config. That
 * flag is intentionally off today, so only these light values are ever used.
 */
export const palette = {
  primary: '#FF634A',
  /** Deeper coral for interactive text. */
  primaryText: '#DF422B',
  /** Solid filled controls with white labels. */
  primarySurface: '#FF634A',
  primaryLight: '#FFF0EB',
  onPrimary: '#FFFFFF',
  foreground: '#11110F',
  muted: '#EFEBE3',
  mutedForeground: '#514941',
  subtleForeground: '#746A5F',
  /** Decorative separators only — never use for glyphs. */
  border: '#DED7CC',
  /** Disabled controls, where the 3:1 minimum does not apply. */
  disabledForeground: '#9B9082',
  accent: '#FF634A',
  destructive: '#DC2626',
  /** Success feedback remains green. */
  success: '#2AA617',
  income: '#FF634A',
  expense: '#2AA617',
  background: '#FFFDF3'
} as const
