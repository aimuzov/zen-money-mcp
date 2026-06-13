import type { StatementSync } from 'node:sqlite'
import type { Db } from './db.js'
import { setMeta } from './db.js'
import { normalizePayee } from '../analytics/grouping.js'
import {
  DataEntity,
  globalBudgetTagId,
  type ZmAccount,
  type ZmBudget,
  type ZmDeletion,
  type ZmDiff,
  type ZmInstrument,
  type ZmMerchant,
  type ZmTag,
  type ZmTransaction,
} from '../api/types.js'

export interface ApplyResult {
  upserts: number
  deletions: number
  serverTimestamp: number
}

const bit = (v: boolean): number => (v ? 1 : 0)
const bitOrNull = (v: boolean | null | undefined): number | null =>
  v == null ? null : v ? 1 : 0

// Real ZenMoney payloads omit absent optional fields, so values arrive as
// `undefined`. node:sqlite only binds null/number/bigint/string/Uint8Array, so
// coerce undefined -> null at the binding boundary.
function runRow(stmt: StatementSync, values: ReadonlyArray<unknown>): void {
  const params = values.map(v => (v === undefined ? null : v))
  stmt.run(...(params as Array<null | number | bigint | string | Uint8Array>))
}

/** Run a fn inside a SQLite transaction, rolling back on error. */
function inTransaction<T>(db: Db, fn: () => T): T {
  db.prepare('BEGIN').run()
  try {
    const result = fn()
    db.prepare('COMMIT').run()
    return result
  } catch (err) {
    db.prepare('ROLLBACK').run()
    throw err
  }
}

/**
 * Apply a ZenMoney diff to the local cache in a single SQLite transaction.
 *
 * Upserts every entity by id, processes `deletion[]` tombstones (transactions
 * are soft-deleted; reference entities are removed), and advances the stored
 * serverTimestamp. Idempotent: applying the same diff twice is a no-op.
 */
export function applyDiff(db: Db, diff: ZmDiff): ApplyResult {
  return inTransaction(db, () => {
    let upserts = 0
    let deletions = 0

    if (diff.instrument) upserts += upsertInstruments(db, diff.instrument)
    if (diff.account) upserts += upsertAccounts(db, diff.account)
    if (diff.tag) upserts += upsertTags(db, diff.tag)
    if (diff.merchant) upserts += upsertMerchants(db, diff.merchant)
    if (diff.budget) upserts += upsertBudgets(db, diff.budget)
    if (diff.transaction) upserts += upsertTransactions(db, diff.transaction)
    if (diff.deletion) deletions += applyDeletions(db, diff.deletion)

    setMeta(db, 'serverTimestamp', String(diff.serverTimestamp))

    return { upserts, deletions, serverTimestamp: diff.serverTimestamp }
  })
}

function upsertInstruments(db: Db, rows: ZmInstrument[]): number {
  const stmt = db.prepare(
    `INSERT INTO instrument(id, short_title, symbol, rate, raw)
     VALUES(?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       short_title = excluded.short_title, symbol = excluded.symbol,
       rate = excluded.rate, raw = excluded.raw`
  )
  for (const r of rows) {
    runRow(stmt, [r.id, r.shortTitle, r.symbol, r.rate, JSON.stringify(r)])
  }
  return rows.length
}

function upsertAccounts(db: Db, rows: ZmAccount[]): number {
  const stmt = db.prepare(
    `INSERT INTO account(id, title, type, instrument, in_balance, archive, raw)
     VALUES(?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, type = excluded.type,
       instrument = excluded.instrument, in_balance = excluded.in_balance,
       archive = excluded.archive, raw = excluded.raw`
  )
  for (const r of rows) {
    runRow(stmt, [
      r.id,
      r.title,
      r.type,
      r.instrument,
      bit(r.inBalance),
      bit(r.archive),
      JSON.stringify(r),
    ])
  }
  return rows.length
}

function upsertTags(db: Db, rows: ZmTag[]): number {
  const stmt = db.prepare(
    `INSERT INTO tag(id, title, parent, show_income, show_outcome, icon, color, raw)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title, parent = excluded.parent,
       show_income = excluded.show_income, show_outcome = excluded.show_outcome,
       icon = excluded.icon, color = excluded.color, raw = excluded.raw`
  )
  for (const r of rows) {
    runRow(stmt, [
      r.id,
      r.title,
      r.parent,
      bit(r.showIncome),
      bit(r.showOutcome),
      r.icon,
      r.color,
      JSON.stringify(r),
    ])
  }
  return rows.length
}

function upsertMerchants(db: Db, rows: ZmMerchant[]): number {
  const stmt = db.prepare(
    `INSERT INTO merchant(id, title, raw) VALUES(?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, raw = excluded.raw`
  )
  for (const r of rows) runRow(stmt, [r.id, r.title, JSON.stringify(r)])
  return rows.length
}

function upsertBudgets(db: Db, rows: ZmBudget[]): number {
  const stmt = db.prepare(
    `INSERT INTO budget(id, tag, date, income, outcome, raw)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       tag = excluded.tag, date = excluded.date, income = excluded.income,
       outcome = excluded.outcome, raw = excluded.raw`
  )
  for (const r of rows) {
    const id = `${r.date}#${r.tag ?? globalBudgetTagId}`
    runRow(stmt, [id, r.tag, r.date, r.income, r.outcome, JSON.stringify(r)])
  }
  return rows.length
}

function upsertTransactions(db: Db, rows: ZmTransaction[]): number {
  const stmt = db.prepare(
    `INSERT INTO "transaction"(
       id, date, income, outcome, income_account, outcome_account,
       income_instrument, outcome_instrument, tag0, tag_json, merchant,
       payee, payee_norm, original_payee, mcc, comment, deleted, hold,
       changed, created, raw
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       date = excluded.date, income = excluded.income, outcome = excluded.outcome,
       income_account = excluded.income_account,
       outcome_account = excluded.outcome_account,
       income_instrument = excluded.income_instrument,
       outcome_instrument = excluded.outcome_instrument,
       tag0 = excluded.tag0, tag_json = excluded.tag_json,
       merchant = excluded.merchant, payee = excluded.payee,
       payee_norm = excluded.payee_norm, original_payee = excluded.original_payee,
       mcc = excluded.mcc, comment = excluded.comment, deleted = excluded.deleted,
       hold = excluded.hold, changed = excluded.changed, created = excluded.created,
       raw = excluded.raw`
  )
  for (const r of rows) {
    const tag0 = r.tag && r.tag.length > 0 ? r.tag[0] : null
    const tagJson = r.tag ? JSON.stringify(r.tag) : null
    // Fold originalPayee into the same grouping value, so a transaction with
    // only a raw bank string still groups with its peers.
    const payeeNorm = normalizePayee(r.payee ?? r.originalPayee ?? '') || null
    runRow(stmt, [
      r.id,
      r.date,
      r.income,
      r.outcome,
      r.incomeAccount,
      r.outcomeAccount,
      r.incomeInstrument,
      r.outcomeInstrument,
      tag0,
      tagJson,
      r.merchant,
      r.payee,
      payeeNorm,
      r.originalPayee,
      r.mcc,
      r.comment,
      bit(r.deleted),
      bitOrNull(r.hold),
      r.changed,
      r.created,
      JSON.stringify(r),
    ])
  }
  return rows.length
}

const DELETE_TABLE: Partial<Record<DataEntity, string>> = {
  [DataEntity.Tag]: 'tag',
  [DataEntity.Merchant]: 'merchant',
  [DataEntity.Account]: 'account',
  [DataEntity.Instrument]: 'instrument',
  [DataEntity.Budget]: 'budget',
}

function applyDeletions(db: Db, rows: ZmDeletion[]): number {
  const softDelTx = db.prepare(
    'UPDATE "transaction" SET deleted = 1 WHERE id = ?'
  )
  let count = 0
  for (const d of rows) {
    if (d.object === DataEntity.Transaction) {
      softDelTx.run(String(d.id))
      count++
      continue
    }
    const table = DELETE_TABLE[d.object]
    if (table) {
      db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(d.id)
      count++
    }
  }
  return count
}
