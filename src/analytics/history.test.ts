import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../store/db.js'
import { applyDiff } from '../store/applyDiff.js'
import { getTransaction } from '../store/queries.js'
import { getCategoryHistoryFor } from './history.js'
import { makeTx, RUB, cardAccount } from '../testing/fixtures.js'

let db: Db

beforeEach(() => {
  db = openDb(':memory:')
  applyDiff(db, {
    serverTimestamp: 1,
    instrument: [RUB],
    account: [cardAccount],
    merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Shop' }],
    transaction: [
      makeTx({ id: 'a', date: '2026-01-01', outcome: 100, tag: ['groceries'], merchant: 'm1' }),
      makeTx({ id: 'b', date: '2026-01-02', outcome: 200, tag: ['beer'], merchant: 'm1' }),
      makeTx({ id: 'self', date: '2026-01-03', outcome: 150, tag: ['beer'], merchant: 'm1' }),
      makeTx({ id: 'other', date: '2026-01-04', outcome: 999, tag: ['x'], merchant: 'm2' }),
    ],
  })
})

describe('getCategoryHistoryFor', () => {
  it('returns same-merchant history excluding the transaction itself', () => {
    const tx = getTransaction(db, 'self')!
    const history = getCategoryHistoryFor(db, tx)
    expect(history.map(r => r.id).sort()).toEqual(['a', 'b'])
  })

  it('returns empty when nothing identifies the place', () => {
    const tx = getTransaction(db, 'self')!
    const orphan = { ...tx, merchant: null, payeeNorm: null, mcc: null }
    expect(getCategoryHistoryFor(db, orphan)).toEqual([])
  })
})
