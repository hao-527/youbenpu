/**
 * Unique ID generator for local-only data.
 *
 * The counter alone is not enough: it starts at Date.now() on every launch, so
 * a session that generates N ids leaves the counter N milliseconds ahead of the
 * wall clock. Restarting inside that window could reissue an existing id, and
 * storage.ts drops duplicate ids on load — meaning silent record loss. The
 * random suffix removes that whole class of failure.
 */
let counter = Date.now()

export function uid(prefix = ''): string {
  counter += 1
  const entropy = Math.random().toString(36).slice(2, 6)
  return `${prefix}${counter.toString(36)}${entropy}`
}
