import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../../store/db.js'
import { applyDiff } from '../../store/applyDiff.js'
import { buildMerchantHistory } from './merchantHistory.js'
import { makeTx, makeTag, RUB, cardAccount } from '../../testing/fixtures.js'

let db: Db

beforeEach(() => {
  db = openDb(':memory:')
  applyDiff(db, {
    serverTimestamp: 1,
    instrument: [RUB],
    account: [cardAccount],
    tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
    merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
    transaction: [
      makeTx({ id: 'a', date: '2026-01-01', outcome: 500, tag: ['groceries'], merchant: 'm1' }),
      makeTx({ id: 'b', date: '2026-01-02', outcome: 500, tag: ['groceries'], merchant: 'm1' }),
      makeTx({ id: 'c', date: '2026-01-03', outcome: 300, tag: ['beer'], merchant: 'm1' }),
    ],
  })
})

describe('buildMerchantHistory', () => {
  it('summarizes the category distribution for a merchant', () => {
    const out = buildMerchantHistory(db, { merchant: 'm1' })
    expect(out.totalCount).toBe(3)
    expect(out.totalOutcome).toBe(1300)
    expect(out.currency).toBe('RUB')

    const groceries = out.distribution.find(d => d.tagId === 'groceries')!
    expect(groceries.count).toBe(2)
    expect(groceries.tagPath).toBe('Groceries')
    expect(groceries.sumOutcome).toBe(1000)
    expect(out.distribution[0].tagId).toBe('groceries') // sorted by count desc
    expect(out.recentExamples).toHaveLength(3)
  })
})
