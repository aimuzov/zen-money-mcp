import { chmodSync, readFileSync, writeFileSync } from 'node:fs'

import type { EndpointPreference } from '#zen/api/endpoints'
import { ensureDataDir, type Config } from '#zen/config'

export type StoredToken = {
	access_token: string
	refresh_token: string
	/** Unix seconds after which the access token should be refreshed. */
	expires_at: number
	endpoint: EndpointPreference
}

/** Read the persisted token, or undefined if the file does not exist. */
export function readToken(cfg: Config): StoredToken | undefined {
	try {
		return JSON.parse(readFileSync(cfg.authPath, 'utf8')) as StoredToken
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined

		const reason = err instanceof Error ? err.message : String(err)

		throw new Error(`Cannot read token file ${cfg.authPath}: ${reason}`, { cause: err })
	}
}

/** Persist the token with owner-only (0600) permissions. */
export function writeToken(cfg: Config, token: StoredToken): void {
	ensureDataDir(cfg)
	writeFileSync(cfg.authPath, JSON.stringify(token, null, 2), { mode: 0o600 })
	chmodSync(cfg.authPath, 0o600) // ensure perms even when overwriting
}
