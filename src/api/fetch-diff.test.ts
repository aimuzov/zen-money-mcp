import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fetchDiff } from './fetch-diff.ts'

describe('fetchDiff', () => {
	it('rejects when token is empty', async () => {
		await assert.rejects(fetchDiff('', 'ru', { serverTimestamp: 0 }), /token/i)
	})

	it('POSTs to the diff endpoint with auth header and currentClientTimestamp', async () => {
		let captured: { url: string; init: RequestInit } | undefined
		const fakeFetch = async (url: string | URL, init?: RequestInit) => {
			captured = { url: String(url), init: init! }

			return { json: async () => ({ serverTimestamp: 123, transaction: [] }) }
		}

		const result = await fetchDiff('my-token', 'ru', { serverTimestamp: 42 }, fakeFetch as unknown as typeof fetch)

		assert.equal(captured!.url, 'https://api.zenmoney.ru/v8/diff/')
		assert.equal(captured!.init.method, 'POST')
		const headers = captured!.init.headers as Record<string, string>

		assert.equal(headers['Authorization'], 'Bearer my-token')
		assert.equal(headers['Content-Type'], 'application/json')

		const body = JSON.parse(captured!.init.body as string)

		assert.equal(body.serverTimestamp, 42)
		assert.equal(typeof body.currentClientTimestamp, 'number')
		assert.ok(body.currentClientTimestamp > 0)

		assert.equal(result.serverTimestamp, 123)
	})

	it('throws when the server returns an error field', async () => {
		const fakeFetch = async () => ({
			json: async () => ({ error: { code: 'bad', message: 'nope' } }),
		})

		await assert.rejects(
			fetchDiff('my-token', 'app', { serverTimestamp: 0 }, fakeFetch as unknown as typeof fetch),
			/nope|bad|error/i,
		)
	})
})
