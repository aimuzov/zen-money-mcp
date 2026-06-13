import type { Db } from './db.js'
import { getMeta, setMeta } from './db.js'
import { applyDiff } from './applyDiff.js'
import { fetchDiff } from '../api/fetchDiff.js'
import type { EndpointPreference } from '../api/endpoints.js'

export interface SyncResult {
  added: number
  deletions: number
  from: number
  to: number
}

export interface SyncOptions {
  /** Reset the cursor to 0 and re-fetch the entire history. */
  full?: boolean
  /** Injectable fetch, for testing. */
  fetchImpl?: typeof fetch
}

/**
 * Pull the incremental diff from ZenMoney and apply it to the local cache.
 *
 * Reads the stored serverTimestamp (or 0 for a full sync), fetches everything
 * changed since, applies it atomically, and records the sync time.
 */
export async function sync(
  db: Db,
  token: string,
  endpoint: EndpointPreference,
  opts: SyncOptions = {}
): Promise<SyncResult> {
  const from = opts.full ? 0 : Number(getMeta(db, 'serverTimestamp') ?? 0)

  const diff = await fetchDiff(
    token,
    endpoint,
    { serverTimestamp: from },
    opts.fetchImpl
  )
  const result = applyDiff(db, diff)

  setMeta(db, 'lastSyncAt', String(Math.floor(Date.now() / 1000)))

  return {
    added: result.upserts,
    deletions: result.deletions,
    from,
    to: result.serverTimestamp,
  }
}
