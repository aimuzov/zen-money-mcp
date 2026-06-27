import type { Db } from './db.js'
import type { ZmAccount, ZmTransaction } from '../api/types.js'

/** A transaction as used by analytics and tools (camelCase, tags parsed). */
export interface TxRow {
  id: string
  date: string
  income: number
  outcome: number
  incomeAccount: string | null
  outcomeAccount: string | null
  incomeInstrument: number | null
  outcomeInstrument: number | null
  tag0: string | null
  tag: string[] | null
  merchant: string | null
  payee: string | null
  payeeNorm: string | null
  originalPayee: string | null
  mcc: number | null
  comment: string | null
  deleted: boolean
  changed: number
  created: number
}

export interface TagRow {
  id: string
  title: string
  parent: string | null
  showIncome: boolean
  showOutcome: boolean
}

export interface TagNode extends TagRow {
  path: string
  children: TagNode[]
}

export interface TxFilter {
  from?: string
  to?: string
  account?: string
  uncategorizedOnly?: boolean
  merchant?: string
  payee?: string
  mcc?: number
  minOutcome?: number
  includeDeleted?: boolean
  limit?: number
}

export type TagKind = 'income' | 'outcome' | 'all'

interface RawTxDbRow {
  id: string
  date: string
  income: number
  outcome: number
  income_account: string | null
  outcome_account: string | null
  income_instrument: number | null
  outcome_instrument: number | null
  tag0: string | null
  tag_json: string | null
  merchant: string | null
  payee: string | null
  payee_norm: string | null
  original_payee: string | null
  mcc: number | null
  comment: string | null
  deleted: number
  changed: number
  created: number
}

const TX_COLUMNS = `id, date, income, outcome, income_account, outcome_account,
  income_instrument, outcome_instrument, tag0, tag_json, merchant, payee,
  payee_norm, original_payee, mcc, comment, deleted, changed, created`

function mapTxRow(r: RawTxDbRow): TxRow {
  return {
    id: r.id,
    date: r.date,
    income: r.income,
    outcome: r.outcome,
    incomeAccount: r.income_account,
    outcomeAccount: r.outcome_account,
    incomeInstrument: r.income_instrument,
    outcomeInstrument: r.outcome_instrument,
    tag0: r.tag0,
    tag: r.tag_json ? (JSON.parse(r.tag_json) as string[]) : null,
    merchant: r.merchant,
    payee: r.payee,
    payeeNorm: r.payee_norm,
    originalPayee: r.original_payee,
    mcc: r.mcc,
    comment: r.comment,
    deleted: r.deleted === 1,
    changed: r.changed,
    created: r.created,
  }
}

const DEFAULT_LIMIT = 1000

/** Flexible filtered transaction lookup, newest first. */
export function findTransactions(db: Db, f: TxFilter): TxRow[] {
  const where: string[] = []
  const params: Array<string | number> = []

  if (!f.includeDeleted) where.push('deleted = 0')
  if (f.from) {
    where.push('date >= ?')
    params.push(f.from)
  }
  if (f.to) {
    where.push('date <= ?')
    params.push(f.to)
  }
  if (f.account) {
    where.push('(income_account = ? OR outcome_account = ?)')
    params.push(f.account, f.account)
  }
  if (f.uncategorizedOnly) where.push('tag0 IS NULL')
  if (f.merchant) {
    where.push('merchant = ?')
    params.push(f.merchant)
  }
  if (f.payee) {
    where.push("LOWER(payee) LIKE '%' || LOWER(?) || '%'")
    params.push(f.payee)
  }
  if (f.mcc != null) {
    where.push('mcc = ?')
    params.push(f.mcc)
  }
  if (f.minOutcome != null) {
    where.push('outcome >= ?')
    params.push(f.minOutcome)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = f.limit ?? DEFAULT_LIMIT
  const rows = db
    .prepare(
      `SELECT ${TX_COLUMNS} FROM "transaction" ${whereSql}
       ORDER BY date DESC, changed DESC LIMIT ?`
    )
    .all(...params, limit) as unknown as RawTxDbRow[]
  return rows.map(mapTxRow)
}

/** Categorized, non-deleted expenses for a merchant (for history/candidates). */
export function txByMerchant(db: Db, merchantId: string): TxRow[] {
  return categorizedExpensesWhere(db, 'merchant = ?', [merchantId])
}

/** Categorized, non-deleted expenses for a normalized payee. */
export function txByPayeeNorm(db: Db, payeeNorm: string): TxRow[] {
  return categorizedExpensesWhere(db, 'payee_norm = ?', [payeeNorm])
}

/** Categorized, non-deleted expenses for an MCC code. */
export function txByMcc(db: Db, mcc: number): TxRow[] {
  return categorizedExpensesWhere(db, 'mcc = ?', [mcc])
}

function categorizedExpensesWhere(
  db: Db,
  condition: string,
  params: Array<string | number>
): TxRow[] {
  const rows = db
    .prepare(
      `SELECT ${TX_COLUMNS} FROM "transaction"
       WHERE ${condition} AND deleted = 0 AND tag0 IS NOT NULL AND outcome > 0
       ORDER BY date DESC`
    )
    .all(...params) as unknown as RawTxDbRow[]
  return rows.map(mapTxRow)
}

/** All tags as flat rows. */
export function getAllTags(db: Db): TagRow[] {
  const rows = db
    .prepare(
      'SELECT id, title, parent, show_income, show_outcome FROM tag'
    )
    .all() as unknown as Array<{
    id: string
    title: string
    parent: string | null
    show_income: number
    show_outcome: number
  }>
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    parent: r.parent,
    showIncome: r.show_income === 1,
    showOutcome: r.show_outcome === 1,
  }))
}

/** Build a nested tag tree (with human-readable paths) filtered by kind. */
export function getTagTree(db: Db, kind: TagKind): TagNode[] {
  const all = getAllTags(db)
  const included = all.filter(t =>
    kind === 'income'
      ? t.showIncome
      : kind === 'outcome'
        ? t.showOutcome
        : true
  )
  const byId = new Map<string, TagNode>()
  for (const t of included) byId.set(t.id, { ...t, path: t.title, children: [] })

  const roots: TagNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent ? byId.get(node.parent) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const assignPaths = (node: TagNode, prefix: string) => {
    node.path = prefix ? `${prefix} / ${node.title}` : node.title
    for (const child of node.children) assignPaths(child, node.path)
  }
  for (const root of roots) assignPaths(root, '')

  return roots
}

/** Map of tagId -> human path, for rendering tool output. */
export function getTagPathMap(db: Db): Map<string, string> {
  const all = getAllTags(db)
  const byId = new Map(all.map(t => [t.id, t]))
  const cache = new Map<string, string>()
  const resolve = (id: string): string => {
    const cached = cache.get(id)
    if (cached) return cached
    const tag = byId.get(id)
    if (!tag) return id
    const path = tag.parent
      ? `${resolve(tag.parent)} / ${tag.title}`
      : tag.title
    cache.set(id, path)
    return path
  }
  for (const t of all) resolve(t.id)
  return cache
}

/** The full original transaction entity, for write-back. */
export function getRawTransaction(
  db: Db,
  id: string
): ZmTransaction | undefined {
  const row = db
    .prepare('SELECT raw FROM "transaction" WHERE id = ?')
    .get(id) as { raw: string } | undefined
  return row ? (JSON.parse(row.raw) as ZmTransaction) : undefined
}

/** A single transaction as a TxRow. */
export function getTransaction(db: Db, id: string): TxRow | undefined {
  const row = db
    .prepare(`SELECT ${TX_COLUMNS} FROM "transaction" WHERE id = ?`)
    .get(id) as RawTxDbRow | undefined
  return row ? mapTxRow(row) : undefined
}

export interface AccountInfo {
  id: string
  title: string
  instrument: number
  user: number
}

/** Account essentials (incl. currency instrument and owning user) for an id. */
export function getAccount(db: Db, id: string): AccountInfo | undefined {
  const row = db.prepare('SELECT raw FROM account WHERE id = ?').get(id) as
    | { raw: string }
    | undefined
  if (!row) return undefined
  const a = JSON.parse(row.raw) as ZmAccount
  return { id: a.id, title: a.title, instrument: a.instrument, user: a.user }
}

/** Currency short code (e.g. 'RUB') for an instrument id. */
export function getInstrumentCode(db: Db, id: number): string | undefined {
  const row = db
    .prepare('SELECT short_title FROM instrument WHERE id = ?')
    .get(id) as { short_title: string } | undefined
  return row?.short_title
}

/** Merchant title for an id. */
export function getMerchantTitle(db: Db, id: string): string | undefined {
  const row = db.prepare('SELECT title FROM merchant WHERE id = ?').get(id) as
    | { title: string }
    | undefined
  return row?.title
}

/** Count of non-deleted transactions. */
export function countTransactions(db: Db): number {
  const row = db
    .prepare('SELECT count(*) AS n FROM "transaction" WHERE deleted = 0')
    .get() as { n: number }
  return row.n
}
