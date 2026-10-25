/**
 * Контракт протокола глазами клиента: что видит MCP-клиент, а не как это
 * устроено в SDK. Должен пережить смену SDK без правок; если упал -- клиент
 * увидит другое поведение.
 *
 * Список инструментов сверяется с contract.tools.json. Намеренно поменяли
 * инструмент -- перепишите фикстуру: UPDATE_CONTRACT=1 npm test, затем
 * npm run format и посмотрите diff.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { fileURLToPath } from 'node:url'
import { textOf } from '@aimuzov/infra-mcp-kit/testing'

import type { Config } from '#zen/config'
import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'
import { connect, forbidFetch, seedCache, tempConfig } from '#zen/testing/mcp'

const FIXTURE = fileURLToPath(new URL('contract.tools.json', import.meta.url))

let cfg: Config

beforeEach(() => {
	cfg = tempConfig({ clientId: '', clientSecret: '' })
	forbidFetch()

	seedCache(cfg, {
		serverTimestamp: 1,
		instrument: [RUB],
		account: [cardAccount],
		tag: [makeTag('groceries', 'Groceries')],
		transaction: [makeTx({ id: 't1', date: '2026-05-01', outcome: 500, tag: ['groceries'] })],
	})
})

afterEach(() => mock.restoreAll())

describe('контракт MCP', () => {
	it('сервер представляется своим именем и версией пакета и умеет tools', async () => {
		const client = await connect(cfg)
		const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))

		assert.deepEqual(client.getServerVersion(), { name: 'zen-money-mcp', version: pkg.version })
		assert.ok(client.getServerCapabilities()?.tools)
	})

	it('tools/list совпадает с фикстурой: имена, заголовки, описания, inputSchema', async () => {
		const { tools } = await (await connect(cfg)).listTools()
		const actual = tools
			.map((t) => {
				// $schema -- пометка диалекта, которую SDK добавляет от себя; клиенту важна сама схема
				const { $schema: _, ...inputSchema } = t.inputSchema as Record<string, unknown>

				return { name: t.name, title: t.title, description: t.description, inputSchema }
			})
			.sort((a, b) => a.name.localeCompare(b.name))

		if (process.env.UPDATE_CONTRACT) writeFileSync(FIXTURE, `${JSON.stringify(actual, null, '\t')}\n`)

		assert.deepEqual(actual, JSON.parse(readFileSync(FIXTURE, 'utf8')))
	})

	it('успех: текст с JSON и тот же объект в structuredContent', async () => {
		const res: any = await (await connect(cfg)).callTool({ name: 'zen_list_categories', arguments: {} })

		assert.equal(res.isError ?? false, false)
		assert.equal(res.content.length, 1)
		assert.equal(res.content[0].type, 'text')
		assert.deepEqual(JSON.parse(res.content[0].text), res.structuredContent)

		assert.deepEqual(res.structuredContent, {
			categories: [
				{
					id: 'groceries',
					title: 'Groceries',
					parent: null,
					path: 'Groceries',
					depth: 0,
					showIncome: false,
					showOutcome: true,
				},
			],
		})
	})

	it('ошибка инструмента: isError и текст, без structuredContent', async () => {
		const res: any = await (await connect(cfg)).callTool({ name: 'zen_merchant_history', arguments: {} })

		assert.equal(res.isError, true)
		assert.equal(res.structuredContent, undefined)
		assert.equal(textOf(res), 'Provide one of merchant, payee or mcc.')
	})

	it('исключение в обработчике тоже приходит ответом с isError, а не обрывом', async () => {
		writeFileSync(cfg.authPath, '{not json')
		const res: any = await (await connect(cfg)).callTool({ name: 'zen_sync', arguments: {} })

		assert.equal(res.isError, true)
		assert.match(textOf(res), /Cannot read token file/)
	})

	const invalid: [string, Record<string, unknown>, RegExp][] = [
		['zen_find_transactions', { limit: 0 }, /limit/],
		['zen_find_transactions', { mcc: 'abc' }, /mcc/],
		['zen_list_categories', { kind: 'spending' }, /kind/],
		['zen_apply_categories', { changes: [{ transactionId: 't1' }] }, /tagId/],
		['zen_import_statement', { filePath: '/tmp/x.pdf' }, /account/],
	]

	for (const [name, args, field] of invalid) {
		it(`ошибка валидации ${name} ${JSON.stringify(args)}: isError с именем поля`, async () => {
			const res: any = await (await connect(cfg)).callTool({ name, arguments: args })

			assert.equal(res.isError, true)
			assert.equal(res.structuredContent, undefined)
			assert.match(textOf(res), field)
		})
	}

	it('неизвестный инструмент -- ошибка с его именем', async () => {
		const client = await connect(cfg)

		// SDK вправе ответить и протокольной ошибкой, и результатом с isError: клиент видит отказ в обоих случаях
		await client.callTool({ name: 'zen_nope', arguments: {} }).then(
			(res: any) => {
				assert.equal(res.isError, true)
				assert.match(textOf(res), /zen_nope/)
			},
			(err: Error) => assert.match(err.message, /zen_nope/),
		)
	})
})
