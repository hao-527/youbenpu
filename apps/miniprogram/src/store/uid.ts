/** Simple unique ID generator for local-only data. */
let counter = Date.now()

export function uid(prefix = ''): string {
  counter += 1
  return `${prefix}${counter.toString(36)}`
}
