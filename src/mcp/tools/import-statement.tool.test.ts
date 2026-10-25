import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { Config } from '#zen/config'
import { cardAccount, makeTx, RUB } from '#zen/testing/fixtures'
import { connect, dataOf, forbidFetch, mockFetch, seedCache, tempConfig, writeValidToken } from '#zen/testing/mcp'
import { makePdf } from '#zen/testing/pdf'

// Те же ряды, что в ozon-statement.test.ts, разложенные по строкам PDF.
const PURCHASE = [
	'25.06.2026 18:13:50 11430204419 Оплата товаров по кредитной карте 2296',
	'сумма 129.98 в KRASNOE I BELOE Moscow RU дата 2026- 06-25 время 18:13:50',
	'- 129.98 ₽ - 129.98 ₽',
]
const OZON_ORDER = [
	'20.06.2026 13:45:19 11312870163 Оплата товаров/услуг на Платформе Ozon,',
	'заказ № 1629682992. Без НДС. - 1 608.00 ₽ - 1 608.00 ₽',
]
const REFUND = [
	'17.06.2026 14:38:12 11244708121 Возврат оплаты товаров по кредитной карте',
	'2296 сумма 620.00 в DUT MOSCOW Moscow RU дата 2026- 06-17 время 14:38:12',
	'+ 620.00 ₽ + 620.00 ₽',
]
const REPAYMENT = [
	'25.06.2026 07:34:34 11413668483 Погашение кредита по договору №2026-01-01-',
	'KK-0000000000000000000 0, Иванов Иван Иванович + 3 000.00 ₽ + 3 000.00 ₽',
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

let cfg: Config

function statement(pages: string[][]): string {
	const path = join(cfg.dataDir, 'statement.pdf')

	writeFileSync(path, makePdf(pages))

	return path
}

const importStatement = async (args: Record<string, unknown>) =>
	(await connect(cfg)).callTool({ name: 'zen_import_statement', arguments: { account: 'acc', ...args } }) as any

/** ZenMoney принимает diff и отдаёт присланные операции обратно. */
const echo = () =>
	mockFetch(({ body }) => Response.json({ serverTimestamp: body.serverTimestamp + 1, transaction: body.transaction }))

beforeEach(() => {
	cfg = tempConfig()

	seedCache(cfg, {
		serverTimestamp: 100,
		instrument: [RUB],
		account: [cardAccount],
		transaction: [
			// покупка из выписки уже есть в кэше
			makeTx({ id: 'e1', date: '2026-06-20', outcome: 1608, payee: 'Ozon' }),
		],
	})
})

afterEach(() => mock.restoreAll())

describe('zen_import_statement', () => {
	it('dry run по умолчанию: план без записи и без сети', async () => {
		const calls = forbidFetch()
		const filePath = statement([
			[...PURCHASE, ...OZON_ORDER],
			[...REFUND, ...REPAYMENT],
		])
		const data = dataOf(await importStatement({ filePath }))

		assert.equal(calls.length, 0)

		assert.deepEqual(data, {
			dryRun: true,
			confirmationRequired: true,
			parsed: 4,
			account: { id: 'acc', title: 'Card' },
			toCreate: 2,
			duplicates: 1,
			repaymentsSkipped: 1,
			byKind: { purchases: 1, refunds: 1 },
			totalOutcome: 129.98,
			totalIncome: 620,
			examples: [
				{ date: '2026-06-25', income: 0, outcome: 129.98, payee: 'KRASNOE I BELOE Moscow RU' },
				{ date: '2026-06-17', income: 620, outcome: 0, payee: 'DUT MOSCOW Moscow RU' },
			],
		})
	})

	it('dryRun:false пишет только недостающие операции с детерминированными id', async () => {
		writeValidToken(cfg)
		const calls = echo()
		const filePath = statement([[...PURCHASE, ...OZON_ORDER, ...REFUND, ...REPAYMENT]])
		const data = dataOf(await importStatement({ filePath, dryRun: false }))

		assert.equal(calls.length, 1)
		assert.equal(calls[0]!.url, 'https://api.zenmoney.ru/v8/diff/')
		assert.equal(calls[0]!.headers.Authorization, 'Bearer test-access')
		assert.equal(calls[0]!.body.serverTimestamp, 100)

		const sent = calls[0]!.body.transaction

		assert.deepEqual(
			sent.map((t: any) => [t.date, t.income, t.outcome, t.outcomeBankID ?? t.incomeBankID]),
			[
				['2026-06-25', 0, 129.98, '[ozon-stmt]-11430204419'],
				['2026-06-17', 620, 0, '[ozon-stmt]-11244708121'],
			],
		)

		for (const t of sent) assert.match(t.id, UUID)

		assert.partialDeepStrictEqual(data, { dryRun: false, applied: 2, serverTimestamp: 101, toCreate: 2 })
		assert.equal(data.warning, undefined)
	})

	it('повтор после успешного импорта ничего не создаёт: операции уже в кэше', async () => {
		writeValidToken(cfg)
		const calls = echo()
		const filePath = statement([[...PURCHASE, ...REFUND]])

		dataOf(await importStatement({ filePath, dryRun: false }))
		const again = dataOf(await importStatement({ filePath, dryRun: false }))

		assert.equal(calls.length, 1)
		assert.partialDeepStrictEqual(again, { dryRun: false, applied: 0, toCreate: 0, duplicates: 2 })
	})

	it('повтор после сбоя отправляет те же id: ZenMoney обновит операции, а не задвоит', async () => {
		writeValidToken(cfg)
		let fail = true
		const calls = mockFetch(({ body }) =>
			fail
				? new Response('<html>Bad Gateway</html>', { status: 502 })
				: Response.json({ serverTimestamp: 200, transaction: body.transaction }),
		)
		const filePath = statement([[...PURCHASE, ...REFUND]])
		const failed = await importStatement({ filePath, dryRun: false })

		assert.equal(failed.isError, true)
		assert.match(failed.content[0].text, /HTTP 502/)

		fail = false
		dataOf(await importStatement({ filePath, dryRun: false }))

		const ids = calls.map((c) => c.body.transaction.map((t: any) => t.id))

		assert.equal(ids.length, 2)
		assert.deepEqual(ids[1], ids[0])
	})

	it('запись прошла, а кэш не обновился: успех с warning про zen_sync', async () => {
		writeValidToken(cfg)

		// ZenMoney принял, но вернул операцию без даты: в кэш её не положить (date NOT NULL)
		mockFetch(({ body }) =>
			Response.json({
				serverTimestamp: 300,
				transaction: body.transaction.map((t: any) => ({ ...t, date: undefined })),
			}),
		)

		const res = await importStatement({ filePath: statement([PURCHASE]), dryRun: false })

		assert.ok(!res.isError)
		assert.partialDeepStrictEqual(res.structuredContent, { dryRun: false, applied: 1, serverTimestamp: 300 })
		assert.match(res.structuredContent.warning, /Saved to ZenMoney.*Do not repeat.*zen_sync/)
	})

	it('всё уже импортировано: dryRun:false не ходит в сеть и не требует токена', async () => {
		const calls = forbidFetch()
		const data = dataOf(await importStatement({ filePath: statement([OZON_ORDER]), dryRun: false }))

		assert.equal(calls.length, 0)
		assert.partialDeepStrictEqual(data, { dryRun: false, applied: 0, toCreate: 0, duplicates: 1 })
	})

	it('без токена запись отвечает ошибкой со ссылкой на auth', async () => {
		forbidFetch()
		const res = await importStatement({ filePath: statement([PURCHASE]), dryRun: false })

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /zen-money-mcp auth/)
	})

	it('битый файл токена -- ошибка с путём, а не просьба войти', async () => {
		forbidFetch()
		writeFileSync(cfg.authPath, '{not json')
		const res = await importStatement({ filePath: statement([PURCHASE]), dryRun: false })

		assert.equal(res.isError, true)
		assert.ok(res.content[0].text.includes(cfg.authPath), res.content[0].text)
		assert.doesNotMatch(res.content[0].text, /zen-money-mcp auth/)
	})

	it('неизвестный счёт -- ошибка инструмента', async () => {
		const res = await importStatement({ filePath: statement([PURCHASE]), account: 'nope' })

		assert.equal(res.isError, true)
		assert.equal(res.content[0].text, 'Account not found: nope')
	})

	it('пустая выписка: в PDF нет ни одной операции', async () => {
		const res = await importStatement({ filePath: statement([[]]) })

		assert.equal(res.isError, true)
		assert.equal(res.content[0].text, 'No operations parsed from the statement.')
	})

	it('PDF другого банка: текст есть, операций Ozon нет', async () => {
		const res = await importStatement({
			filePath: statement([['Выписка по счёту', '01.06.2026 Перевод 100,00 RUB']]),
		})

		assert.equal(res.isError, true)
		assert.equal(res.content[0].text, 'No operations parsed from the statement.')
	})

	it('файл не PDF -- ошибка чтения выписки', async () => {
		const filePath = join(cfg.dataDir, 'statement.csv')

		writeFileSync(filePath, 'date,amount\n2026-06-01,100\n')
		const res = await importStatement({ filePath })

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /^Failed to read statement: /)
	})

	it('нет файла -- ошибка чтения с причиной', async () => {
		const res = await importStatement({ filePath: join(cfg.dataDir, 'missing.pdf') })

		assert.equal(res.isError, true)
		assert.match(res.content[0].text, /^Failed to read statement: .*ENOENT/)
	})
})
