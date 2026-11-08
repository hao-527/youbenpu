import type { LedgerEntry } from '../types/domain'

/** Shared integer-cent accounting rule for home and ledger, including legacy rows. */
export function summarizeLedger(entries: readonly LedgerEntry[]) {
  const result = { incomeCents: 0, expenseCents: 0, balanceCents: 0 }
  for (const entry of entries) {
    if (entry.countsTowardTotal === false) continue
    if (entry.type === 'income') result.incomeCents += entry.amountCents
    else result.expenseCents += entry.amountCents
  }
  result.balanceCents = result.incomeCents - result.expenseCents
  return result
}
