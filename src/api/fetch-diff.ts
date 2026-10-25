import type { EndpointPreference } from './endpoints.ts'
import { endpoints } from './endpoints.ts'
import type { ZmDiff, ZmDiffRequest } from './types.ts'

/** A diff to send: at minimum a serverTimestamp, plus any entity arrays to push. */
export type DiffInput = Partial<ZmDiff> & { serverTimestamp: number }

/**
 * Post a diff to ZenMoney's /v8/diff/ endpoint.
 *
 * Ported from zerro's fetchDiff.ts. Adds `currentClientTimestamp` (Unix seconds)
 * to the body, sends the Bearer token, and throws on a server `error` field.
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

	const json = (await response.json()) as ZmDiff & { error?: unknown }

	if (json.error) throw new Error(JSON.stringify(json.error))

	return json
}
