import { endpoints } from '#zen/api/endpoints'
import type { Config } from '#zen/config'

import { NotAuthenticatedError } from './errors.ts'
import { readToken, writeToken, type StoredToken } from './store.ts'
import { readTokenResponse } from './token-response.ts'

export { NotAuthenticatedError }

const SKEW_SECONDS = 60

export type TokenOptions = {
	/** Current time in Unix seconds (injectable for testing). */
	now?: number
	/** Injectable fetch, for testing. */
	fetchImpl?: typeof fetch
}

/**
 * Return a valid access token, refreshing it transparently if expired.
 * Throws NotAuthenticatedError if there is no token or the server rejects the
 * refresh; a transient refresh failure throws a plain Error with the status.
 */
export async function getValidAccessToken(cfg: Config, opts: TokenOptions = {}): Promise<string> {
	const token = readToken(cfg)

	if (!token) throw new NotAuthenticatedError()

	const now = opts.now ?? Math.floor(Date.now() / 1000)

	if (now < token.expires_at) return token.access_token

	return refreshToken(cfg, token, now, opts.fetchImpl ?? fetch)
}

async function refreshToken(cfg: Config, token: StoredToken, now: number, fetchImpl: typeof fetch): Promise<string> {
	const response = await fetchImpl(endpoints[token.endpoint].token, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			grant_type: 'refresh_token',
			refresh_token: token.refresh_token,
			client_id: cfg.clientId,
			client_secret: cfg.clientSecret,
		}),
	})
	const data = await readTokenResponse(response, 'Token refresh')

	const updated: StoredToken = {
		access_token: data.access_token,
		refresh_token: data.refresh_token ?? token.refresh_token,
		expires_at: now + (data.expires_in ?? 3600) - SKEW_SECONDS,
		endpoint: token.endpoint,
	}

	writeToken(cfg, updated)

	return updated.access_token
}
