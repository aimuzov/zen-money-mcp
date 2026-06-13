import type { TxRow } from '../store/queries.js'

/**
 * Normalize a free-text payee string so that visits to the same place group
 * together. Lowercases, collapses whitespace, and strips trailing
 * store/terminal numbers (e.g. "Пятёрочка 1234" -> "пятёрочка").
 *
 * Conservative on purpose: only strips numbers that are separated by
 * whitespace, so real names like "store5" are left intact.
 */
export function normalizePayee(s: string): string {
  const collapsed = s.toLowerCase().replace(/\s+/g, ' ').trim()
  return collapsed.replace(/(\s+#?\d+)+$/, '').trim()
}

/** Identifies the "place" a transaction belongs to, for grouping its history. */
export type GroupKey = {
  kind: 'merchant' | 'payee' | 'mcc'
  value: string
}

/**
 * Pick the most stable grouping key for a transaction, in priority order:
 * merchant id > normalized payee (which already folds in originalPayee) > mcc.
 * Returns null when nothing identifies the place.
 */
export function resolveGroupKey(tx: TxRow): GroupKey | null {
  if (tx.merchant) return { kind: 'merchant', value: tx.merchant }
  if (tx.payeeNorm) return { kind: 'payee', value: tx.payeeNorm }
  if (tx.mcc != null) return { kind: 'mcc', value: String(tx.mcc) }
  return null
}
