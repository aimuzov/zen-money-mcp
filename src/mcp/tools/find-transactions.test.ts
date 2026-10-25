import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import type { Config } from '#zen/config'
import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'
import { connect, dataOf, forbidFetch, seedCache, tempConfig } from '#zen/testing/mcp'

let cfg: Config

const find = async (args: Record<string, unknown> = {}) =>
	(await connect(cfg)).callTool({ name: 'zen_find_transactions', arguments: args }) as any

const ids = async (args: Record<string, unknown> = {}) => dataOf(await find(args)).transactions.map((t: any) => t.id)

beforeEach(() => {
	cfg = tempConfig()
	forbidFetch()

	seedCache(cfg, {
		serverTimestamp: 1,
		instrument: [RUB],
		account: [cardAccount, { ...cardAccount, id: 'cash', title: 'Cash' }],
		tag: [makeTag('food', 'Food'), makeTag('groceries', 'Groceries', { parent: 'food' }), makeTag('beer', 'Beer')],
		merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
		transaction: [
			...Array.from({ length: 6 }, (_, i) =>
				makeTx({ id: `g${i}`, date: `2026-05-0${i + 1}`, outcome: 500, tag: ['groceries'], merchant: 'm1' }),
			),
			makeTx({ id: 'bad', date: '2026-05-20', outcome: 480, tag: ['beer'], merchant: 'm1' }),
			makeTx({ id: 'uncat', date: '2026-05-21', outcome: 99, payee: 'Kiosk Na Uglu', mcc: 5411 }),
			makeTx({
				id: 'cash1',
				date: '2026-04-10',
				outcome: 2000,
				incomeAccount: 'cash',
				outcomeAccount: 'cash',
				tag: ['beer'],
			}),
			makeTx({ id: 'gone', date: '2026-05-22', outcome: 1, deleted: true }),
		],
	})
})

afterEach(() => mock.restoreAll())

describe('zen_find_transactions', () => {
	it('без фильтров: все неудалённые, новые сверху, в виде для модели', async () => {
		const data = dataOf(await find())

		assert.equal(data.count, 9)

		assert.deepEqual(
			data.transactions.map((t: any) => t.id),
			['uncat', 'bad', 'g5', 'g4', 'g3', 'g2', 'g1', 'g0', 'cash1'],
		)

		assert.deepEqual(
			data.transactions.find((t: any) => t.id === 'g0'),
			{
				id: 'g0',
				date: '2026-05-01',
				outcome: 500,
				income: 0,
				currency: 'RUB',
				tag: ['groceries'],
				tagPath: 'Food / Groceries',
				merchant: 'm1',
				merchantTitle: 'Пятёрочка',
				payee: null,
				mcc: null,
				comment: null,
			},
		)
	})

	it('диапазон дат включает границы', async () => {
		assert.deepEqual(await ids({ from: '2026-05-05', to: '2026-05-20' }), ['bad', 'g5', 'g4'])
	})

	it('фильтр по счёту', async () => {
		assert.deepEqual(await ids({ account: 'cash' }), ['cash1'])
	})

	it('только без категории', async () => {
		assert.deepEqual(await ids({ uncategorizedOnly: true }), ['uncat'])
	})

	it('по merchant, payee (подстрока без учёта регистра), mcc и minOutcome', async () => {
		assert.equal((await ids({ merchant: 'm1' })).length, 7)
		assert.deepEqual(await ids({ payee: 'na ugl' }), ['uncat'])
		assert.deepEqual(await ids({ mcc: 5411 }), ['uncat'])
		assert.deepEqual(await ids({ minOutcome: 500 }), ['g5', 'g4', 'g3', 'g2', 'g1', 'g0', 'cash1'])
	})

	it('фильтры складываются по И', async () => {
		assert.deepEqual(await ids({ merchant: 'm1', minOutcome: 490, from: '2026-05-06' }), ['g5'])
	})

	it('limit режет выдачу с самых новых', async () => {
		const data = dataOf(await find({ limit: 2 }))

		assert.equal(data.count, 2)

		assert.deepEqual(
			data.transactions.map((t: any) => t.id),
			['uncat', 'bad'],
		)
	})

	it('needsReviewOnly оставляет без категории и вероятные ошибки категории', async () => {
		assert.deepEqual(await ids({ needsReviewOnly: true }), ['uncat', 'bad'])
	})

	it('needsReviewOnly с limit ищет среди всех, а не среди первых limit', async () => {
		// свежая покупка с верной категорией заслоняет более старую ошибочную
		seedCache(cfg, {
			serverTimestamp: 2,
			transaction: [
				makeTx({ id: 'g-new', date: '2026-05-30', outcome: 500, tag: ['groceries'], merchant: 'm1' }),
			],
		})

		assert.deepEqual(await ids({ needsReviewOnly: true, merchant: 'm1', limit: 1 }), ['bad'])
	})

	it('пустой результат -- count 0, а не ошибка', async () => {
		const data = dataOf(await find({ from: '2030-01-01' }))

		assert.deepEqual(data, { count: 0, transactions: [] })

		assert.deepEqual(dataOf(await find({ merchant: 'nope', needsReviewOnly: true })), {
			count: 0,
			transactions: [],
		})
	})

	for (const limit of [0, 501, 1.5]) {
		it(`limit=${limit} отклоняется валидацией`, async () => {
			const res = await find({ limit })

			assert.equal(res.isError, true)
			assert.match(res.content[0].text, /limit/)
		})
	}
})
