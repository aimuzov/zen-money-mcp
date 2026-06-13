import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from './db.js'
import { applyDiff } from './applyDiff.js'
import {
  AccountType,
  DataEntity,
  type ZmDiff,
  type ZmTransaction,
} from '../api/types.js'

function makeTx(partial: Partial<ZmTransaction>): ZmTransaction {
  return {
    id: 'tx',
    changed: 1000,
    created: 1000,
    user: 1,
    deleted: false,
    hold: null,
    qrCode: null,
    incomeBankID: null,
    incomeInstrument: 2,
    incomeAccount: 'acc',
    income: 0,
    outcomeBankID: null,
    outcomeInstrument: 2,
    outcomeAccount: 'acc',
    outcome: 0,
    tag: null,
    merchant: null,
    payee: null,
    originalPayee: null,
    comment: null,
    date: '2026-01-01',
    mcc: null,
    reminderMarker: null,
    opIncome: null,
    opIncomeInstrument: null,
    opOutcome: null,
    opOutcomeInstrument: null,
    latitude: null,
    longitude: null,
    ...partial,
  }
}

const baseDiff: ZmDiff = {
  serverTimestamp: 5000,
  instrument: [
    { id: 2, changed: 1, title: 'Ruble', shortTitle: 'RUB', symbol: '₽', rate: 1 },
  ],
  account: [
    {
      id: 'acc',
      changed: 1,
      user: 1,
      instrument: 2,
      title: 'Card',
      role: null,
      company: null,
      type: AccountType.Ccard,
      syncID: null,
      balance: 0,
      startBalance: 0,
      creditLimit: 0,
      inBalance: true,
      savings: false,
      enableCorrection: false,
      enableSMS: false,
      archive: false,
      private: false,
      capitalization: null,
      percent: null,
      startDate: null,
      endDateOffset: null,
      endDateOffsetInterval: null,
      payoffStep: null,
      payoffInterval: null,
    },
  ],
  tag: [
    {
      id: 'tag-groceries',
      changed: 1,
      user: 1,
      title: 'Groceries',
      parent: null,
      icon: null,
      staticId: null,
      picture: null,
      color: null,
      showIncome: false,
      showOutcome: true,
      budgetIncome: false,
      budgetOutcome: true,
      required: null,
    },
  ],
  merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка 1234' }],
  transaction: [
    makeTx({
      id: 'tx-cat',
      outcome: 500,
      tag: ['tag-groceries'],
      merchant: 'm1',
      payee: 'Пятёрочка 1234',
    }),
    makeTx({ id: 'tx-uncat', outcome: 99, tag: null, payee: 'Kiosk' }),
  ],
}

let db: Db

beforeEach(() => {
  db = openDb(':memory:')
})

describe('applyDiff', () => {
  it('upserts entities and advances the server timestamp', () => {
    const result = applyDiff(db, baseDiff)

    expect(result.serverTimestamp).toBe(5000)
    expect(
      db.prepare('select value from meta where key = ?').get('serverTimestamp')
    ).toEqual({ value: '5000' })

    const count = db
      .prepare('select count(*) as n from "transaction"')
      .get() as { n: number }
    expect(count.n).toBe(2)
  })

  it('derives tag0, tag_json and payee_norm for transactions', () => {
    applyDiff(db, baseDiff)

    const cat = db
      .prepare('select tag0, tag_json, payee_norm from "transaction" where id = ?')
      .get('tx-cat') as { tag0: string; tag_json: string; payee_norm: string }
    expect(cat.tag0).toBe('tag-groceries')
    expect(JSON.parse(cat.tag_json)).toEqual(['tag-groceries'])
    expect(cat.payee_norm).toBe('пятёрочка')

    const uncat = db
      .prepare('select tag0, tag_json from "transaction" where id = ?')
      .get('tx-uncat') as { tag0: string | null; tag_json: string | null }
    expect(uncat.tag0).toBeNull()
    expect(uncat.tag_json).toBeNull()
  })

  it('is idempotent when the same diff is applied twice', () => {
    applyDiff(db, baseDiff)
    applyDiff(db, baseDiff)

    const count = db
      .prepare('select count(*) as n from "transaction"')
      .get() as { n: number }
    expect(count.n).toBe(2)
    expect(
      db.prepare('select value from meta where key = ?').get('serverTimestamp')
    ).toEqual({ value: '5000' })
  })

  it('soft-deletes transactions but hard-deletes reference entities via deletion[]', () => {
    applyDiff(db, baseDiff)

    const result = applyDiff(db, {
      serverTimestamp: 6000,
      deletion: [
        { id: 'tx-uncat', object: DataEntity.Transaction, stamp: 5500, user: 1 },
        { id: 'tag-groceries', object: DataEntity.Tag, stamp: 5500, user: 1 },
      ],
    })

    expect(result.deletions).toBe(2)
    expect(result.serverTimestamp).toBe(6000)

    const tx = db
      .prepare('select deleted from "transaction" where id = ?')
      .get('tx-uncat') as { deleted: number }
    expect(tx.deleted).toBe(1)

    const tag = db.prepare('select * from tag where id = ?').get('tag-groceries')
    expect(tag).toBeUndefined()
  })

  it('updates existing transactions on re-upsert', () => {
    applyDiff(db, baseDiff)
    applyDiff(db, {
      serverTimestamp: 7000,
      transaction: [makeTx({ id: 'tx-cat', outcome: 750, tag: ['tag-x'] })],
    })

    const tx = db
      .prepare('select outcome, tag0 from "transaction" where id = ?')
      .get('tx-cat') as { outcome: number; tag0: string }
    expect(tx.outcome).toBe(750)
    expect(tx.tag0).toBe('tag-x')
  })
})
