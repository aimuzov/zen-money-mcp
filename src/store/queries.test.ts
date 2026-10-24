import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'

import { applyDiff } from './apply-diff.ts'
import { openDb, type Db } from './db.ts'
import {
	countTransactions,
	findTransactions,
	getAccount,
	getInstrumentCode,
	getRawTransaction,
	getTagTree,
	txByMerchant,
} from './queries.ts'

let db: Db

beforeEach(() => {
	db = openDb(':memory:')

	applyDiff(db, {
		serverTimestamp: 100,
		instrument: [RUB],
		account: [cardAccount],
		tag: [
			makeTag('food', 'Food'),
			makeTag('groceries', 'Groceries', { parent: 'food' }),
			makeTag('beer', 'Beer'),
			makeTag('salary', 'Salary', { showIncome: true, showOutcome: false }),
		],
		merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
		transaction: [
			makeTx({
				id: 't1',
				date: '2026-01-05',
				outcome: 500,
				tag: ['groceries'],
				merchant: 'm1',
				payee: 'Пятёрочка 1',
			}),
			makeTx({ id: 't2', date: '2026-01-06', outcome: 300, tag: ['beer'], merchant: 'm1', payee: 'Пятёрочка 2' }),
			makeTx({ id: 't3', date: '2026-01-07', outcome: 99, tag: null, payee: 'Kiosk' }),
			makeTx({ id: 't4', date: '2026-02-01', outcome: 1000, tag: ['groceries'], merchant: 'm1' }),
			makeTx({ id: 't5', date: '2026-01-08', outcome: 1, tag: ['beer'], merchant: 'm1', deleted: true }),
		],
	})
})

describe('findTransactions', () => {
	it('filters by date range and excludes deleted, newest first', () => {
		const rows = findTransactions(db, { from: '2026-01-01', to: '2026-01-31' })

		assert.deepEqual(
			rows.map((r) => r.id),
			['t3', 't2', 't1'],
		)
	})

	it('filters uncategorized only', () => {
		const rows = findTransactions(db, { uncategorizedOnly: true })

		assert.deepEqual(
			rows.map((r) => r.id),
			['t3'],
		)
	})

	it('filters by merchant', () => {
		const rows = findTransactions(db, { merchant: 'm1' })

		assert.deepEqual(rows.map((r) => r.id).sort(), ['t1', 't2', 't4'])
	})

	it('respects limit', () => {
		const rows = findTransactions(db, { limit: 2 })

		assert.equal(rows.length, 2)
	})

	it('parses the tag array', () => {
		const [t3, t2] = findTransactions(db, { from: '2026-01-06', to: '2026-01-07' })

		assert.equal(t3!.tag, null)
		assert.deepEqual(t2!.tag, ['beer'])
	})
})

describe('txByMerchant', () => {
	it('returns categorized, non-deleted expenses for the merchant', () => {
		const rows = txByMerchant(db, 'm1')

		assert.deepEqual(rows.map((r) => r.id).sort(), ['t1', 't2', 't4'])
	})
})

describe('getTagTree', () => {
	it('nests children under parents and builds a path for outcome tags', () => {
		const tree = getTagTree(db, 'outcome')
		const titles = tree.map((t) => t.title).sort()

		assert.deepEqual(titles, ['Beer', 'Food'])
		const food = tree.find((t) => t.id === 'food')!

		assert.deepEqual(
			food.children.map((c) => c.id),
			['groceries'],
		)

		assert.equal(food.children[0]!.path, 'Food / Groceries')
	})

	it('filters income vs outcome', () => {
		const income = getTagTree(db, 'income')

		assert.deepEqual(
			income.map((t) => t.id),
			['salary'],
		)
	})
})

describe('getRawTransaction', () => {
	it('returns the full original entity for write-back', () => {
		const raw = getRawTransaction(db, 't1')

		assert.equal(raw?.id, 't1')
		assert.equal(raw?.outcome, 500)
		assert.deepEqual(raw?.tag, ['groceries'])
	})

	it('returns undefined for unknown id', () => {
		assert.equal(getRawTransaction(db, 'nope'), undefined)
	})
})

describe('getAccount', () => {
	it('returns account info including instrument and user', () => {
		assert.partialDeepStrictEqual(getAccount(db, 'acc'), {
			id: 'acc',
			title: 'Card',
			instrument: 2,
			user: 1,
		})
	})

	it('returns undefined for unknown id', () => {
		assert.equal(getAccount(db, 'nope'), undefined)
	})
})

describe('getInstrumentCode / countTransactions', () => {
	it('resolves the currency short code', () => {
		assert.equal(getInstrumentCode(db, 2), 'RUB')
	})

	it('counts non-deleted transactions', () => {
		assert.equal(countTransactions(db), 4)
	})
})
