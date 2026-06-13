import type { Db } from '../store/db.js'
import {
  txByMcc,
  txByMerchant,
  txByPayeeNorm,
  type TxRow,
} from '../store/queries.js'
import { resolveGroupKey, type GroupKey } from './grouping.js'

/** Fetch categorized expenses for a group key. */
function historyForKey(db: Db, key: GroupKey): TxRow[] {
  switch (key.kind) {
    case 'merchant':
      return txByMerchant(db, key.value)
    case 'payee':
      return txByPayeeNorm(db, key.value)
    case 'mcc':
      return txByMcc(db, Number(key.value))
  }
}

/**
 * The history of past categorized purchases at the same place as `tx`,
 * excluding `tx` itself. Feeds candidate ranking and review.
 */
export function getCategoryHistoryFor(db: Db, tx: TxRow): TxRow[] {
  const key = resolveGroupKey(tx)
  if (!key) return []
  return historyForKey(db, key).filter(r => r.id !== tx.id)
}
