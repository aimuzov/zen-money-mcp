import { endpoints } from '#zen/api/endpoints'
import type { Config } from '#zen/config'

import { readToken, writeToken, type StoredToken } from './store.ts'

/** Thrown when there is no usable token and the user must run `auth`. */
export class NotAuthenticatedError extends Error {
	constructor(message = 'Not authenticated. Run `zen-money-mcp auth` in your terminal once, then retry.') {
		super(message)
		this.name = 'NotAuthenticatedError'
	}
}

const SKEW_SECONDS = 60

export type TokenOptions = {
	/** Current time in Unix seconds (injectable for testing). */
	now?: number
	/** Injectable fetch, for testing. */
	fetchImpl?: typeof fetch
}

/**
 * Return a valid access token, refreshing it transparently if expired.
 * Throws NotAuthenticatedError if there is no token or the refresh fails.
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
	const data = (await response.json()) as {
		access_token?: string
		refresh_token?: string
		expires_in?: number
	}

	if (!data.access_token) {
		throw new NotAuthenticatedError('Token refresh failed. Run `zen-money-mcp auth` again to re-authorize.')
	}

	const updated: StoredToken = {
		access_token: data.access_token,
		refresh_token: data.refresh_token ?? token.refresh_token,
		expires_at: now + (data.expires_in ?? 3600) - SKEW_SECONDS,
		endpoint: token.endpoint,
	}

	writeToken(cfg, updated)

	return updated.access_token
}
