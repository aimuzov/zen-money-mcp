import { bodySnippet, parseJsonObject } from '#zen/api/http'

import { NotAuthenticatedError } from './errors.ts'

export type TokenResponse = {
	access_token: string
	refresh_token?: string
	expires_in?: number
}

/**
 * Перелогин нужен, только если сервер отказал в гранте. 5xx, HTML и ответ
 * без access_token -- временный сбой, его отдаём со статусом и телом.
 */
export async function readTokenResponse(response: Response, what: string): Promise<TokenResponse> {
	const text = await response.text()
	const data = parseJsonObject(text)

	if (response.ok && typeof data?.access_token === 'string' && data.access_token) {
		return data as TokenResponse
	}

	const detail = `HTTP ${response.status}: ${bodySnippet(text)}`

	// Прочие 400 -- это ключи приложения или кривой запрос, их перелогин не починит.
	if (data?.error === 'invalid_grant' || response.status === 401) {
		throw new NotAuthenticatedError(
			`${what} rejected (${detail}). Run \`zen-money-mcp auth\` again to re-authorize.`,
		)
	}

	throw new Error(`${what} failed: ${detail}`)
}
