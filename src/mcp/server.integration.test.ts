import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'
import { connectInMemory, expectTools } from '@aimuzov/infra-mcp-kit/testing'

import type { Config } from '#zen/config'
import { applyDiff } from '#zen/store/apply-diff'
import { openDb } from '#zen/store/db'
import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'

import { createServer } from './server.ts'

function seededConfig(): Config {
	const dir = mkdtempSync(join(tmpdir(), 'zen-mcp-'))
	const cfg: Config = {
		clientId: '',
		clientSecret: '',
		endpoint: 'ru',
		redirectPort: 53682,
		redirectUri: 'http://localhost:53682/callback',
		dataDir: dir,
		dbPath: join(dir, 'cache.sqlite'),
		authPath: join(dir, 'auth.json'),
	}
	const seed = openDb(cfg.dbPath)

	applyDiff(seed, {
		serverTimestamp: 1,
		instrument: [RUB],
		account: [cardAccount],
		tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
		merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
		transaction: [
			...Array.from({ length: 8 }, (_, i) =>
				makeTx({ id: `g${i}`, date: `2026-05-0${i + 1}`, outcome: 500, tag: ['groceries'], merchant: 'm1' }),
			),
			makeTx({ id: 'bad', date: '2026-05-20', outcome: 480, tag: ['beer'], merchant: 'm1' }),
		],
	})

	seed.close()

	return cfg
}

const connect = (cfg: Config) => connectInMemory(createServer(cfg))

let cfg: Config

beforeEach(() => {
	cfg = seededConfig()
})

describe('MCP server (end to end)', () => {
	it('registers all tools', async () => {
		const client = await connect(cfg)

		await expectTools(client, [
			'zen_apply_categories',
			'zen_find_transactions',
			'zen_import_statement',
			'zen_list_categories',
			'zen_merchant_history',
			'zen_review_expenses',
			'zen_sync',
		])
	})

	it('serves zen_list_categories with structured content', async () => {
		const client = await connect(cfg)
		const res: any = await client.callTool({
			name: 'zen_list_categories',
			arguments: {},
		})

		assert.ok(!res.isError)
		const data = res.structuredContent ?? JSON.parse(res.content[0].text)

		assert.deepEqual(data.categories.map((c: any) => c.id).sort(), ['beer', 'groceries'])
	})

	it('audits expenses and flags the miscategorized one', async () => {
		const client = await connect(cfg)
		const res: any = await client.callTool({
			name: 'zen_review_expenses',
			arguments: { from: '2026-05-01', to: '2026-05-31' },
		})
		const data = res.structuredContent ?? JSON.parse(res.content[0].text)
		const bad = data.expenses.find((e: any) => e.transactionId === 'bad')

		assert.equal(bad.status, 'likely_miscategorized')
		assert.equal(bad.candidates[0].tagPath, 'Groceries')
	})

	it('previews category changes by default (dry run)', async () => {
		const client = await connect(cfg)
		const res: any = await client.callTool({
			name: 'zen_apply_categories',
			arguments: { changes: [{ transactionId: 'bad', tagId: 'groceries' }] },
		})
		const data = res.structuredContent ?? JSON.parse(res.content[0].text)

		assert.equal(data.dryRun, true)
		assert.equal(data.preview[0].after.tagPath, 'Groceries')
	})

	it('returns a friendly error from zen_sync when not authenticated', async () => {
		const client = await connect(cfg)
		const res: any = await client.callTool({
			name: 'zen_sync',
			arguments: {},
		})

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /auth/i)
	})
})
