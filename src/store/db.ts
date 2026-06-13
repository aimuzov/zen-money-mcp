import { DatabaseSync } from 'node:sqlite'

export type Db = DatabaseSync

// SQLite schema for the local ZenMoney cache. Every table keeps a `raw` column
// with the full original entity JSON so the write path can push entities back
// without losing any fields. The "transaction" table name is a SQL keyword and
// must always be quoted.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS instrument (
  id INTEGER PRIMARY KEY, short_title TEXT, symbol TEXT, rate REAL, raw TEXT
);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY, title TEXT, type TEXT, instrument INTEGER,
  in_balance INTEGER, archive INTEGER, raw TEXT
);

CREATE TABLE IF NOT EXISTS tag (
  id TEXT PRIMARY KEY, title TEXT, parent TEXT,
  show_income INTEGER, show_outcome INTEGER, icon TEXT, color INTEGER, raw TEXT
);

CREATE TABLE IF NOT EXISTS merchant (
  id TEXT PRIMARY KEY, title TEXT, raw TEXT
);

CREATE TABLE IF NOT EXISTS budget (
  id TEXT PRIMARY KEY, tag TEXT, date TEXT, income REAL, outcome REAL, raw TEXT
);

CREATE TABLE IF NOT EXISTS "transaction" (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  income REAL, outcome REAL,
  income_account TEXT, outcome_account TEXT,
  income_instrument INTEGER, outcome_instrument INTEGER,
  tag0 TEXT,
  tag_json TEXT,
  merchant TEXT,
  payee TEXT,
  payee_norm TEXT,
  original_payee TEXT,
  mcc INTEGER,
  comment TEXT,
  deleted INTEGER DEFAULT 0,
  hold INTEGER,
  changed INTEGER,
  created INTEGER,
  raw TEXT
);

CREATE INDEX IF NOT EXISTS ix_tx_date         ON "transaction"(date);
CREATE INDEX IF NOT EXISTS ix_tx_merchant     ON "transaction"(merchant);
CREATE INDEX IF NOT EXISTS ix_tx_payee_norm   ON "transaction"(payee_norm);
CREATE INDEX IF NOT EXISTS ix_tx_mcc          ON "transaction"(mcc);
CREATE INDEX IF NOT EXISTS ix_tx_tag0         ON "transaction"(tag0);
CREATE INDEX IF NOT EXISTS ix_tx_outcome_acct ON "transaction"(outcome_account);
CREATE INDEX IF NOT EXISTS ix_tx_date_outcome ON "transaction"(date, outcome);
`

/** Open (or create) the cache database and ensure the schema exists. */
export function openDb(path: string): Db {
  const db = new DatabaseSync(path)
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

/** Read a value from the meta key/value table. */
export function getMeta(db: Db, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

/** Write a value into the meta key/value table. */
export function setMeta(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}
