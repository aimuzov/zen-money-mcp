import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../../store/db.js'
import { applyDiff } from '../../store/applyDiff.js'
import { buildReviewExpenses } from './reviewExpenses.js'
import { makeTx, makeTag, RUB, cardAccount } from '../../testing/fixtures.js'

let db: Db

beforeEach(() => {
  db = openDb(':memory:')
  const groceries = Array.from({ length: 10 }, (_, i) =>
    makeTx({
      id: `g${i}`,
      date: `2026-04-${String(i + 1).padStart(2, '0')}`,
      outcome: 500,
      tag: ['groceries'],
      merchant: 'm1',
    })
  )
  applyDiff(db, {
    serverTimestamp: 1,
    instrument: [RUB],
    account: [cardAccount],
    tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
    merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
    transaction: [
      ...groceries,
      makeTx({ id: 'bad', date: '2026-04-20', outcome: 480, tag: ['beer'], merchant: 'm1' }),
      makeTx({ id: 'uncat', date: '2026-04-21', outcome: 99, tag: null, payee: 'Kiosk' }),
    ],
  })
})

describe('buildReviewExpenses', () => {
  it('flags the miscategorized expense and suggests the dominant category', () => {
    const out = buildReviewExpenses(db, { from: '2026-04-01', to: '2026-04-30' })

    const bad = out.expenses.find(e => e.transactionId === 'bad')!
    expect(bad.status).toBe('likely_miscategorized')
    expect(bad.currentTagPath).toBe('Beer')
    expect(bad.candidates[0].tagPath).toBe('Groceries')
    expect(bad.candidates[0].confidence).toBeGreaterThan(0.6)
  })

  it('flags the uncategorized expense', () => {
    const out = buildReviewExpenses(db, { from: '2026-04-01', to: '2026-04-30' })
    const uncat = out.expenses.find(e => e.transactionId === 'uncat')!
    expect(uncat.status).toBe('uncategorized')
  })

  it('excludes transfers (income > 0) from the expense audit', () => {
    // A transfer between own accounts (e.g. a cash withdrawal): both income and
    // outcome are set, no category — it is not a categorizable expense.
    applyDiff(db, {
      serverTimestamp: 2,
      transaction: [
        makeTx({
          id: 'transfer',
          date: '2026-04-22',
          outcome: 5000,
          income: 5000,
          incomeAccount: 'cash',
          outcomeAccount: 'acc',
          tag: null,
        }),
      ],
    })
    const out = buildReviewExpenses(db, { from: '2026-04-01', to: '2026-04-30' })
    expect(out.expenses.some(e => e.transactionId === 'transfer')).toBe(false)
  })

  it('hides ok expenses by default but includes them on request', () => {
    const def = buildReviewExpenses(db, { from: '2026-04-01', to: '2026-04-30' })
    expect(def.expenses.some(e => e.status === 'ok')).toBe(false)

    const all = buildReviewExpenses(db, {
      from: '2026-04-01',
      to: '2026-04-30',
      includeOk: true,
    })
    expect(all.expenses.some(e => e.status === 'ok')).toBe(true)
  })
})
