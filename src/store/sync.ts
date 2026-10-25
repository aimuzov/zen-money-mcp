import type { EndpointPreference } from '#zen/api/endpoints'
import { fetchDiff } from '#zen/api/fetch-diff'

import { applyDiff } from './apply-diff.ts'
import type { Db } from './db.ts'
import { getMeta, setMeta } from './db.ts'

export type SyncResult = {
	added: number
	deletions: number
	from: number
	to: number
}

export type SyncOptions = {
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
	opts: SyncOptions = {},
): Promise<SyncResult> {
	const from = opts.full ? 0 : Number(getMeta(db, 'serverTimestamp') ?? 0)

	const diff = await fetchDiff(token, endpoint, { serverTimestamp: from }, opts.fetchImpl)
	const result = applyDiff(db, diff)

	setMeta(db, 'lastSyncAt', String(Math.floor(Date.now() / 1000)))

	return {
		added: result.upserts,
		deletions: result.deletions,
		from,
		to: result.serverTimestamp,
	}
}
