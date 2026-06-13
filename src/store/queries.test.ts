import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from './db.js'
import { applyDiff } from './applyDiff.js'
import {
  findTransactions,
  getTagTree,
  txByMerchant,
  getRawTransaction,
  getInstrumentCode,
  countTransactions,
} from './queries.js'
import { makeTx, makeTag, RUB, cardAccount } from '../testing/fixtures.js'

let db: Db

beforeEach(() => {
  db = openDb(':memory:')
  applyDiff(db, {
    serverTimestamp: 100,
    instrument: [RUB],
    account: [cardAccount],
    tag: [
      makeTag('food', 'Food'),
      makeTag('groceries', 'Groceries', { parent: 'food' }),
      makeTag('beer', 'Beer'),
      makeTag('salary', 'Salary', { showIncome: true, showOutcome: false }),
    ],
    merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
    transaction: [
      makeTx({ id: 't1', date: '2026-01-05', outcome: 500, tag: ['groceries'], merchant: 'm1', payee: 'Пятёрочка 1' }),
      makeTx({ id: 't2', date: '2026-01-06', outcome: 300, tag: ['beer'], merchant: 'm1', payee: 'Пятёрочка 2' }),
      makeTx({ id: 't3', date: '2026-01-07', outcome: 99, tag: null, payee: 'Kiosk' }),
      makeTx({ id: 't4', date: '2026-02-01', outcome: 1000, tag: ['groceries'], merchant: 'm1' }),
      makeTx({ id: 't5', date: '2026-01-08', outcome: 1, tag: ['beer'], merchant: 'm1', deleted: true }),
    ],
  })
})

describe('findTransactions', () => {
  it('filters by date range and excludes deleted, newest first', () => {
    const rows = findTransactions(db, { from: '2026-01-01', to: '2026-01-31' })
    expect(rows.map(r => r.id)).toEqual(['t3', 't2', 't1'])
  })

  it('filters uncategorized only', () => {
    const rows = findTransactions(db, { uncategorizedOnly: true })
    expect(rows.map(r => r.id)).toEqual(['t3'])
  })

  it('filters by merchant', () => {
    const rows = findTransactions(db, { merchant: 'm1' })
    expect(rows.map(r => r.id).sort()).toEqual(['t1', 't2', 't4'])
  })

  it('respects limit', () => {
    const rows = findTransactions(db, { limit: 2 })
    expect(rows).toHaveLength(2)
  })

  it('parses the tag array', () => {
    const [t3, t2] = findTransactions(db, { from: '2026-01-06', to: '2026-01-07' })
    expect(t3.tag).toBeNull()
    expect(t2.tag).toEqual(['beer'])
  })
})

describe('txByMerchant', () => {
  it('returns categorized, non-deleted expenses for the merchant', () => {
    const rows = txByMerchant(db, 'm1')
    expect(rows.map(r => r.id).sort()).toEqual(['t1', 't2', 't4'])
  })
})

describe('getTagTree', () => {
  it('nests children under parents and builds a path for outcome tags', () => {
    const tree = getTagTree(db, 'outcome')
    const titles = tree.map(t => t.title).sort()
    expect(titles).toEqual(['Beer', 'Food'])
    const food = tree.find(t => t.id === 'food')!
    expect(food.children.map(c => c.id)).toEqual(['groceries'])
    expect(food.children[0].path).toBe('Food / Groceries')
  })

  it('filters income vs outcome', () => {
    const income = getTagTree(db, 'income')
    expect(income.map(t => t.id)).toEqual(['salary'])
  })
})

describe('getRawTransaction', () => {
  it('returns the full original entity for write-back', () => {
    const raw = getRawTransaction(db, 't1')
    expect(raw?.id).toBe('t1')
    expect(raw?.outcome).toBe(500)
    expect(raw?.tag).toEqual(['groceries'])
  })

  it('returns undefined for unknown id', () => {
    expect(getRawTransaction(db, 'nope')).toBeUndefined()
  })
})

describe('getInstrumentCode / countTransactions', () => {
  it('resolves the currency short code', () => {
    expect(getInstrumentCode(db, 2)).toBe('RUB')
  })

  it('counts non-deleted transactions', () => {
    expect(countTransactions(db)).toBe(4)
  })
})
