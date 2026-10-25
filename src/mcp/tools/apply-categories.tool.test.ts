import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { Config } from '#zen/config'
import { openDb } from '#zen/store/db'
import { getTransaction } from '#zen/store/queries'
import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'
import { connect, dataOf, forbidFetch, mockFetch, seedCache, tempConfig, writeValidToken } from '#zen/testing/mcp'

let cfg: Config

const apply = async (args: Record<string, unknown>) =>
	(await connect(cfg)).callTool({ name: 'zen_apply_categories', arguments: args }) as any

const cachedTag = (id: string) => {
	const db = openDb(cfg.dbPath)

	try {
		return getTransaction(db, id)!.tag0
	} finally {
		db.close()
	}
}

beforeEach(() => {
	cfg = tempConfig()

	seedCache(cfg, {
		serverTimestamp: 50,
		instrument: [RUB],
		account: [cardAccount],
		tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
		transaction: [makeTx({ id: 't1', outcome: 500, tag: ['groceries'] })],
	})
})

afterEach(() => mock.restoreAll())

describe('zen_apply_categories через MCP', () => {
	it('dryRun:false пишет в ZenMoney и обновляет кэш', async () => {
		writeValidToken(cfg)
		const calls = mockFetch(({ body }) => Response.json({ serverTimestamp: 51, transaction: body.transaction }))
		const data = dataOf(
			await apply({
				changes: [
					{ transactionId: 't1', tagId: 'beer' },
					{ transactionId: 'nope', tagId: null },
				],
				dryRun: false,
			}),
		)

		assert.deepEqual(data, { dryRun: false, applied: 1, skipped: ['nope'], serverTimestamp: 51 })
		assert.equal(calls[0]!.body.serverTimestamp, 50)
		assert.deepEqual(calls[0]!.body.transaction[0].tag, ['beer'])
		assert.equal(cachedTag('t1'), 'beer')
	})

	it('запись прошла, а кэш не обновился: успех с warning, а не ошибка', async () => {
		writeValidToken(cfg)

		mockFetch(({ body }) =>
			Response.json({
				serverTimestamp: 51,
				transaction: body.transaction.map((t: any) => ({ ...t, date: undefined })),
			}),
		)

		const res = await apply({ changes: [{ transactionId: 't1', tagId: 'beer' }], dryRun: false })

		assert.ok(!res.isError)
		assert.partialDeepStrictEqual(res.structuredContent, { dryRun: false, applied: 1, serverTimestamp: 51 })
		assert.match(res.structuredContent.warning, /Saved to ZenMoney.*zen_sync/)
		assert.match(res.content[0].text, /zen_sync/)
		// кэш откатился целиком: старая категория на месте
		assert.equal(cachedTag('t1'), 'groceries')
	})

	it('без токена -- ошибка инструмента со ссылкой на auth, сеть не трогается', async () => {
		const calls = forbidFetch()
		const res = await apply({ changes: [{ transactionId: 't1', tagId: 'beer' }], dryRun: false })

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /zen-money-mcp auth/)
		assert.equal(calls.length, 0)
	})

	it('битый файл токена -- ошибка с путём, а не просьба войти', async () => {
		forbidFetch()
		writeFileSync(cfg.authPath, '{not json')
		const res = await apply({ changes: [{ transactionId: 't1', tagId: 'beer' }], dryRun: false })

		assert.equal(res.isError, true)
		assert.ok(res.content[0].text.includes(cfg.authPath), res.content[0].text)
	})

	it('ZenMoney ответил 401 -- ошибка с просьбой войти заново', async () => {
		writeValidToken(cfg)
		mockFetch(() => new Response('Unauthorized', { status: 401 }))
		const res = await apply({ changes: [{ transactionId: 't1', tagId: 'beer' }], dryRun: false })

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /HTTP 401.*zen-money-mcp auth/)
	})

	it('пустой список изменений не проходит валидацию', async () => {
		const res = await apply({ changes: [] })

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /changes/)
	})
})
