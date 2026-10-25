import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import { readToken, writeToken } from '#zen/auth/store'
import type { Config } from '#zen/config'
import { cardAccount, makeTx, RUB } from '#zen/testing/fixtures'
import { connect, dataOf, forbidFetch, mockFetch, seedCache, tempConfig, writeValidToken } from '#zen/testing/mcp'

let cfg: Config

const callSync = async (args: Record<string, unknown> = {}) =>
	(await connect(cfg)).callTool({ name: 'zen_sync', arguments: args }) as any

beforeEach(() => {
	cfg = tempConfig()

	seedCache(cfg, {
		serverTimestamp: 100,
		instrument: [RUB],
		account: [cardAccount],
		transaction: [makeTx({ id: 'old', outcome: 10 })],
	})
})

afterEach(() => mock.restoreAll())

describe('zen_sync', () => {
	it('тянет diff от сохранённого serverTimestamp и отдаёт сводку', async () => {
		writeValidToken(cfg)
		const calls = mockFetch(() =>
			Response.json({
				serverTimestamp: 200,
				transaction: [makeTx({ id: 'new', outcome: 20 })],
				deletion: [{ id: 'old', object: 'transaction', stamp: 150, user: 1 }],
			}),
		)
		const before = Math.floor(Date.now() / 1000)
		const data = dataOf(await callSync())

		assert.equal(calls.length, 1)
		assert.equal(calls[0]!.url, 'https://api.zenmoney.ru/v8/diff/')
		assert.equal(calls[0]!.body.serverTimestamp, 100)
		assert.partialDeepStrictEqual(data, { added: 1, deletions: 1, from: 100, to: 200, totalTransactions: 1 })
		assert.ok(data.lastSyncAt >= before)
	})

	it('full:true начинает с нуля', async () => {
		writeValidToken(cfg)
		const calls = mockFetch(() => Response.json({ serverTimestamp: 200 }))
		const data = dataOf(await callSync({ full: true }))

		assert.equal(calls[0]!.body.serverTimestamp, 0)
		assert.partialDeepStrictEqual(data, { added: 0, deletions: 0, from: 0, to: 200, totalTransactions: 1 })
	})

	it('ZEN_ENDPOINT=app ходит на zenmoney.app', async () => {
		cfg = { ...cfg, endpoint: 'app' }
		writeValidToken(cfg)
		const calls = mockFetch(() => Response.json({ serverTimestamp: 200 }))

		dataOf(await callSync())
		assert.equal(calls[0]!.url, 'https://api.zenmoney.app/v8/diff/')
	})

	it('истёкший токен обновляется перед синхронизацией', async () => {
		writeToken(cfg, { access_token: 'stale', refresh_token: 'r1', expires_at: 1, endpoint: 'ru' })
		const calls = mockFetch(({ url }) =>
			url.endsWith('/oauth2/token/')
				? Response.json({ access_token: 'fresh', refresh_token: 'r2', expires_in: 3600 })
				: Response.json({ serverTimestamp: 200 }),
		)

		dataOf(await callSync())

		assert.deepEqual(
			calls.map((c) => c.url),
			['https://api.zenmoney.ru/oauth2/token/', 'https://api.zenmoney.ru/v8/diff/'],
		)

		assert.equal(calls[1]!.headers.Authorization, 'Bearer fresh')
		assert.equal(readToken(cfg)!.refresh_token, 'r2')
	})

	it('без токена -- понятная ошибка, сеть не трогается', async () => {
		const calls = forbidFetch()
		const res = await callSync()

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /zen-money-mcp auth/)
		assert.equal(calls.length, 0)
	})

	it('битый файл токена -- ошибка с путём к файлу, а не просьба войти', async () => {
		forbidFetch()
		writeFileSync(cfg.authPath, '{not json')
		const res = await callSync()

		assert.equal(res.isError, true)
		assert.ok(res.content[0].text.includes(cfg.authPath), res.content[0].text)
		assert.doesNotMatch(res.content[0].text, /zen-money-mcp auth/)
	})

	it('5xx от ZenMoney -- ошибка со статусом и телом, кэш не тронут', async () => {
		writeValidToken(cfg)
		mockFetch(() => new Response('<html>Service Unavailable</html>', { status: 503 }))
		const res = await callSync()

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /HTTP 503: <html>Service Unavailable<\/html>/)
		assert.doesNotMatch(res.content[0].text, /zen-money-mcp auth/)

		mock.restoreAll()
		mockFetch(() => Response.json({ serverTimestamp: 300 }))
		assert.equal(dataOf(await callSync()).from, 100)
	})

	it('401 от ZenMoney -- просьба войти заново', async () => {
		writeValidToken(cfg)
		mockFetch(() => new Response('Unauthorized', { status: 401 }))
		const res = await callSync()

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /HTTP 401.*zen-money-mcp auth/)
	})
})
