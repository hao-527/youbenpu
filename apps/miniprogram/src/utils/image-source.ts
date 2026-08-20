/**
 * A `wxfile://` path only exists in the current WeChat process. It must never
 * be treated as shared data: after a restart or on another family member's
 * phone it can be invalid, or even resolve to an unrelated local image.
 *
 * Shared dish, inventory, and order images must therefore use a portable HTTP
 * URL returned by the upload service. Other values safely render as a normal
 * in-app placeholder.
 */
export function getPortableImageUrl(value?: string | null): string {
  const url = value?.trim() ?? ''
  return /^https?:\/\//i.test(url) ? url : ''
}
