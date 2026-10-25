import { NotAuthenticatedError } from '#zen/auth/errors'

import type { EndpointPreference } from './endpoints.ts'
import { endpoints } from './endpoints.ts'
import { bodySnippet, parseJsonObject } from './http.ts'
import type { ZmDiff, ZmDiffRequest } from './types.ts'

/** A diff to send: at minimum a serverTimestamp, plus any entity arrays to push. */
export type DiffInput = Partial<ZmDiff> & { serverTimestamp: number }

/**
 * Post a diff to ZenMoney's /v8/diff/ endpoint.
 *
 * Ported from zerro's fetchDiff.ts. Adds `currentClientTimestamp` (Unix seconds)
 * to the body, sends the Bearer token, and throws on a non-2xx status, a non-JSON
 * body or a server `error` field. HTTP 401 throws NotAuthenticatedError.
 *
 * `fetchImpl` is injectable for testing; defaults to the global fetch.
 */
export async function fetchDiff(
	token: string,
	endpoint: EndpointPreference,
	diff: DiffInput,
	fetchImpl: typeof fetch = fetch,
): Promise<ZmDiff> {
	if (!token) throw new Error('No token')

	const url = endpoints[endpoint].diff
	const body: ZmDiffRequest = {
		...diff,
		currentClientTimestamp: Math.floor(Date.now() / 1000),
	}

	const response = await fetchImpl(url, {
		method: 'POST',
		body: JSON.stringify(body),
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
	})

	const text = await response.text()

	if (response.status === 401) {
		throw new NotAuthenticatedError(
			'ZenMoney rejected the access token (HTTP 401). Run `zen-money-mcp auth` in your terminal, then retry.',
		)
	}

	const json = response.ok ? parseJsonObject(text) : undefined

	if (!json) {
		throw new Error(`ZenMoney diff request failed: HTTP ${response.status}: ${bodySnippet(text)}`)
	}

	if (json.error) throw new Error(JSON.stringify(json.error))

	return json as ZmDiff
}
