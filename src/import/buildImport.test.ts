import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../store/db.js'
import { applyDiff } from '../store/applyDiff.js'
import { makeTx, RUB, cardAccount } from '../testing/fixtures.js'
import { buildImportPlan, type BuildImportInput } from './buildImport.js'
import type { StatementOp } from './ozonStatement.js'

let db: Db
let n: number

beforeEach(() => {
  n = 0
  db = openDb(':memory:')
  applyDiff(db, {
    serverTimestamp: 100,
    instrument: [RUB],
    account: [cardAccount],
    merchant: [{ id: 'm-fasol', changed: 1, user: 1, title: 'FASOL' }],
    transaction: [
      // existing purchase that the statement also contains (duplicate)
      makeTx({ id: 'e1', date: '2026-06-02', outcome: 1065, payee: 'TARELKI_1' }),
      // a place->merchant mapping the importer can reuse
      makeTx({ id: 'e2', date: '2026-05-10', outcome: 200, payee: 'FASOL', merchant: 'm-fasol' }),
    ],
  })
})

const input = (): BuildImportInput => ({
  accountId: 'acc',
  instrument: 2,
  user: 1,
  now: 5000,
  newId: () => `new${n++}`,
})

const op = (partial: Partial<StatementOp>): StatementOp => ({
  date: '2026-06-03',
  documentId: 'D0',
  signed: -100,
  amount: 100,
  kind: 'purchase',
  payee: 'SHOP',
  comment: null,
  ...partial,
})

describe('buildImportPlan', () => {
  it('builds a purchase transaction with the reference field shape', () => {
    const plan = buildImportPlan(
      db,
      [op({ date: '2026-06-03', documentId: 'D1', signed: -545, amount: 545, payee: 'STORE' })],
      input()
    )
    expect(plan.create).toHaveLength(1)
    expect(plan.create[0]).toMatchObject({
      id: 'new0',
      user: 1,
      date: '2026-06-03',
      income: 0,
      outcome: 545,
      incomeAccount: 'acc',
      outcomeAccount: 'acc',
      incomeInstrument: 2,
      outcomeInstrument: 2,
      outcomeBankID: '[ozon-stmt]-D1',
      incomeBankID: null,
      tag: null,
      payee: 'STORE',
      originalPayee: 'STORE',
      comment: null,
      merchant: null,
      deleted: false,
      created: 5000,
      changed: 5000,
    })
  })

  it('builds a refund as money in (income set, outcome zero)', () => {
    const plan = buildImportPlan(
      db,
      [op({ documentId: 'D2', signed: 620, amount: 620, kind: 'refund', payee: 'DUT' })],
      input()
    )
    expect(plan.create[0]).toMatchObject({
      income: 620,
      outcome: 0,
      incomeBankID: '[ozon-stmt]-D2',
      outcomeBankID: null,
    })
  })

  it('skips operations already present (match on date + signed amount)', () => {
    const plan = buildImportPlan(
      db,
      [op({ date: '2026-06-02', signed: -1065, amount: 1065, payee: 'TARELKI_1' })],
      input()
    )
    expect(plan.create).toHaveLength(0)
    expect(plan.skippedDuplicates).toHaveLength(1)
  })

  it('creates only the surplus when the statement has more copies than the cache', () => {
    const dup = op({ date: '2026-06-02', signed: -1065, amount: 1065, payee: 'TARELKI_1' })
    const plan = buildImportPlan(db, [dup, { ...dup, documentId: 'D9' }], input())
    expect(plan.create).toHaveLength(1)
    expect(plan.skippedDuplicates).toHaveLength(1)
  })

  it('never creates repayments — they go to skippedRepayments', () => {
    const plan = buildImportPlan(
      db,
      [op({ signed: 3000, amount: 3000, kind: 'repayment', payee: null })],
      input()
    )
    expect(plan.create).toHaveLength(0)
    expect(plan.skippedRepayments).toHaveLength(1)
  })

  it('reuses an existing merchant for a matching payee', () => {
    const plan = buildImportPlan(
      db,
      [op({ documentId: 'D3', payee: 'FASOL', signed: -50, amount: 50 })],
      input()
    )
    expect(plan.create[0].merchant).toBe('m-fasol')
  })
})
