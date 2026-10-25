import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { Config } from '#zen/config'
import { openDb } from '#zen/store/db'
import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'
import { connect, dataOf, forbidFetch, seedCache, tempConfig } from '#zen/testing/mcp'

import { buildMerchantHistory } from './merchant-history.ts'

let cfg: Config

const history = async (args: Record<string, unknown>) =>
	(await connect(cfg)).callTool({ name: 'zen_merchant_history', arguments: args }) as any

beforeEach(() => {
	cfg = tempConfig()
	forbidFetch()

	seedCache(cfg, {
		serverTimestamp: 1,
		instrument: [RUB],
		account: [cardAccount],
		tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
		merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
		transaction: [
			// 2026-01-05 -- понедельник
			makeTx({ id: 'a', date: '2026-01-05', outcome: 500, tag: ['groceries'], merchant: 'm1' }),
			makeTx({ id: 'b', date: '2026-01-06', outcome: 500, tag: ['groceries'], merchant: 'm1' }),
			makeTx({ id: 'c', date: '2026-02-02', outcome: 300, tag: ['beer'], merchant: 'm1' }),
			// не попадают в историю: без категории, доход, удалённая
			makeTx({ id: 'd', date: '2026-02-03', outcome: 100, merchant: 'm1' }),
			makeTx({ id: 'e', date: '2026-02-04', income: 50, tag: ['groceries'], merchant: 'm1' }),
			makeTx({ id: 'f', date: '2026-02-05', outcome: 70, tag: ['beer'], merchant: 'm1', deleted: true }),
			makeTx({ id: 'p1', date: '2026-03-01', outcome: 120, tag: ['beer'], payee: 'Kiosk 12' }),
			makeTx({ id: 'p2', date: '2026-03-02', outcome: 80, tag: ['beer'], payee: 'KIOSK  #7', mcc: 5921 }),
		],
	})
})

afterEach(() => mock.restoreAll())

describe('zen_merchant_history', () => {
	it('по merchant: только категоризированные расходы, распределение и дни недели', async () => {
		const data = dataOf(await history({ merchant: 'm1' }))

		assert.deepEqual(data.groupKey, { kind: 'merchant', value: 'm1' })
		assert.equal(data.totalCount, 3)
		assert.equal(data.totalOutcome, 1300)
		assert.equal(data.currency, 'RUB')

		assert.deepEqual(data.distribution, [
			{
				tagId: 'groceries',
				tagPath: 'Groceries',
				count: 2,
				share: 0.667,
				sumOutcome: 1000,
				lastSeen: '2026-01-06',
			},
			{ tagId: 'beer', tagPath: 'Beer', count: 1, share: 0.333, sumOutcome: 300, lastSeen: '2026-02-02' },
		])

		// пн, вт, пн
		assert.deepEqual(data.byWeekday, { '1': 2, '2': 1 })

		assert.deepEqual(
			data.recentExamples.map((t: any) => t.id),
			['c', 'b', 'a'],
		)

		assert.equal(data.recentExamples[0].merchantTitle, 'Пятёрочка')
	})

	it('по payee: текст нормализуется, номер точки отбрасывается', async () => {
		const data = dataOf(await history({ payee: '  KIOSK 99 ' }))

		assert.deepEqual(data.groupKey, { kind: 'payee', value: 'kiosk' })
		assert.equal(data.totalCount, 2)
	})

	it('по mcc', async () => {
		const data = dataOf(await history({ mcc: 5921 }))

		assert.deepEqual(data.groupKey, { kind: 'mcc', value: '5921' })

		assert.deepEqual(
			data.recentExamples.map((t: any) => t.id),
			['p2'],
		)
	})

	it('merchant важнее payee и mcc', async () => {
		const data = dataOf(await history({ merchant: 'm1', payee: 'kiosk', mcc: 5921 }))

		assert.equal(data.groupKey.kind, 'merchant')
	})

	it('from/to ограничивают период включительно', async () => {
		const data = dataOf(await history({ merchant: 'm1', from: '2026-01-06', to: '2026-02-02' }))

		assert.equal(data.totalCount, 2)

		assert.deepEqual(
			// при равном счёте порядок не задан
			data.distribution.map((d: any) => [d.tagId, d.count, d.share]).sort(),
			[
				['beer', 1, 0.5],
				['groceries', 1, 0.5],
			],
		)
	})

	it('пустая история -- нули, а не ошибка', async () => {
		const data = dataOf(await history({ merchant: 'nope' }))

		assert.deepEqual(data, {
			groupKey: { kind: 'merchant', value: 'nope' },
			totalCount: 0,
			totalOutcome: 0,
			currency: null,
			distribution: [],
			byWeekday: {},
			recentExamples: [],
		})

		assert.equal(dataOf(await history({ merchant: 'm1', from: '2030-01-01' })).totalCount, 0)
	})

	it('без merchant, payee и mcc -- ошибка инструмента', async () => {
		const res = await history({ from: '2026-01-01' })

		assert.equal(res.isError, true)
		assert.equal(res.content[0].text, 'Provide one of merchant, payee or mcc.')
	})

	it('buildMerchantHistory без ключа бросает', () => {
		const db = openDb(cfg.dbPath)

		try {
			assert.throws(() => buildMerchantHistory(db, {}), /Provide one of merchant, payee or mcc/)
		} finally {
			db.close()
		}
	})
})
