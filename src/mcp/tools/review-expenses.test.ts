import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { applyDiff } from '#zen/store/apply-diff'
import { openDb, type Db } from '#zen/store/db'
import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'

import { buildReviewExpenses } from './review-expenses.ts'

let db: Db

beforeEach(() => {
	db = openDb(':memory:')
	const groceries = Array.from({ length: 10 }, (_, i) =>
		makeTx({
			id: `g${i}`,
			date: `2026-04-${String(i + 1).padStart(2, '0')}`,
			outcome: 500,
			tag: ['groceries'],
			merchant: 'm1',
		}),
	)

	applyDiff(db, {
		serverTimestamp: 1,
		instrument: [RUB],
		account: [cardAccount],
		tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
		merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
		transaction: [
			...groceries,
			makeTx({ id: 'bad', date: '2026-04-20', outcome: 480, tag: ['beer'], merchant: 'm1' }),
			makeTx({ id: 'uncat', date: '2026-04-21', outcome: 99, tag: null, payee: 'Kiosk' }),
		],
	})
})

describe('buildReviewExpenses', () => {
	it('flags the miscategorized expense and suggests the dominant category', () => {
		const out = buildReviewExpenses(db, { from: '2026-04-01', to: '2026-04-30' })

		const bad = out.expenses.find((e) => e.transactionId === 'bad')!

		assert.equal(bad.status, 'likely_miscategorized')
		assert.equal(bad.currentTagPath, 'Beer')
		assert.equal(bad.candidates[0]!.tagPath, 'Groceries')
		assert.ok(bad.candidates[0]!.confidence > 0.6)
	})

	it('flags the uncategorized expense', () => {
		const out = buildReviewExpenses(db, { from: '2026-04-01', to: '2026-04-30' })
		const uncat = out.expenses.find((e) => e.transactionId === 'uncat')!

		assert.equal(uncat.status, 'uncategorized')
	})

	it('excludes transfers (income > 0) from the expense audit', () => {
		// A transfer between own accounts (e.g. a cash withdrawal): both income and
		// outcome are set, no category — it is not a categorizable expense.
		applyDiff(db, {
			serverTimestamp: 2,
			transaction: [
				makeTx({
					id: 'transfer',
					date: '2026-04-22',
					outcome: 5000,
					income: 5000,
					incomeAccount: 'cash',
					outcomeAccount: 'acc',
					tag: null,
				}),
			],
		})

		const out = buildReviewExpenses(db, { from: '2026-04-01', to: '2026-04-30' })

		assert.equal(
			out.expenses.some((e) => e.transactionId === 'transfer'),
			false,
		)
	})

	it('hides ok expenses by default but includes them on request', () => {
		const def = buildReviewExpenses(db, { from: '2026-04-01', to: '2026-04-30' })

		assert.equal(
			def.expenses.some((e) => e.status === 'ok'),
			false,
		)

		const all = buildReviewExpenses(db, {
			from: '2026-04-01',
			to: '2026-04-30',
			includeOk: true,
		})

		assert.equal(
			all.expenses.some((e) => e.status === 'ok'),
			true,
		)
	})
})
