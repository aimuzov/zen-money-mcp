import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { applyDiff } from '#zen/store/apply-diff'
import { openDb, type Db } from '#zen/store/db'
import { cardAccount, makeTx, RUB } from '#zen/testing/fixtures'

import { buildImportPlan, type BuildImportInput } from './build-import.ts'
import type { StatementOp } from './ozon-statement.ts'

let db: Db
let n: number

beforeEach(() => {
	n = 0
	db = openDb(':memory:')

	applyDiff(db, {
		serverTimestamp: 100,
		instrument: [RUB],
		account: [cardAccount],
		merchant: [{ id: 'm-fasol', changed: 1, user: 1, title: 'FASOL' }],
		transaction: [
			// existing purchase that the statement also contains (duplicate)
			makeTx({ id: 'e1', date: '2026-06-02', outcome: 1065, payee: 'TARELKI_1' }),
			// a place->merchant mapping the importer can reuse
			makeTx({ id: 'e2', date: '2026-05-10', outcome: 200, payee: 'FASOL', merchant: 'm-fasol' }),
		],
	})
})

const input = (): BuildImportInput => ({
	accountId: 'acc',
	instrument: 2,
	user: 1,
	now: 5000,
	newId: () => `new${n++}`,
})

const op = (partial: Partial<StatementOp>): StatementOp => ({
	date: '2026-06-03',
	documentId: 'D0',
	signed: -100,
	amount: 100,
	kind: 'purchase',
	payee: 'SHOP',
	comment: null,
	...partial,
})

describe('buildImportPlan', () => {
	it('builds a purchase transaction with the reference field shape', () => {
		const plan = buildImportPlan(
			db,
			[op({ date: '2026-06-03', documentId: 'D1', signed: -545, amount: 545, payee: 'STORE' })],
			input(),
		)

		assert.equal(plan.create.length, 1)

		assert.partialDeepStrictEqual(plan.create[0], {
			id: 'new0',
			user: 1,
			date: '2026-06-03',
			income: 0,
			outcome: 545,
			incomeAccount: 'acc',
			outcomeAccount: 'acc',
			incomeInstrument: 2,
			outcomeInstrument: 2,
			outcomeBankID: '[ozon-stmt]-D1',
			incomeBankID: null,
			tag: null,
			payee: 'STORE',
			originalPayee: 'STORE',
			comment: null,
			merchant: null,
			deleted: false,
			created: 5000,
			changed: 5000,
		})
	})

	it('builds a refund as money in (income set, outcome zero)', () => {
		const plan = buildImportPlan(
			db,
			[op({ documentId: 'D2', signed: 620, amount: 620, kind: 'refund', payee: 'DUT' })],
			input(),
		)

		assert.partialDeepStrictEqual(plan.create[0], {
			income: 620,
			outcome: 0,
			incomeBankID: '[ozon-stmt]-D2',
			outcomeBankID: null,
		})
	})

	it('skips operations already present (match on date + signed amount)', () => {
		const plan = buildImportPlan(
			db,
			[op({ date: '2026-06-02', signed: -1065, amount: 1065, payee: 'TARELKI_1' })],
			input(),
		)

		assert.equal(plan.create.length, 0)
		assert.equal(plan.skippedDuplicates.length, 1)
	})

	it('creates only the surplus when the statement has more copies than the cache', () => {
		const dup = op({ date: '2026-06-02', signed: -1065, amount: 1065, payee: 'TARELKI_1' })
		const plan = buildImportPlan(db, [dup, { ...dup, documentId: 'D9' }], input())

		assert.equal(plan.create.length, 1)
		assert.equal(plan.skippedDuplicates.length, 1)
	})

	it('never creates repayments — they go to skippedRepayments', () => {
		const plan = buildImportPlan(db, [op({ signed: 3000, amount: 3000, kind: 'repayment', payee: null })], input())

		assert.equal(plan.create.length, 0)
		assert.equal(plan.skippedRepayments.length, 1)
	})

	it('reuses an existing merchant for a matching payee', () => {
		const plan = buildImportPlan(db, [op({ documentId: 'D3', payee: 'FASOL', signed: -50, amount: 50 })], input())

		assert.equal(plan.create[0]!.merchant, 'm-fasol')
	})

	it('без newId id детерминирован и похож на UUID', () => {
		const { newId: _, ...noId } = input()
		const ops = [op({ documentId: 'D1' }), op({ documentId: 'D1' })]
		const first = buildImportPlan(db, ops, noId).create.map((t) => t.id)
		const again = buildImportPlan(db, ops, noId).create.map((t) => t.id)

		assert.deepEqual(again, first)
		// одинаковые ряды различаются индексом в выписке
		assert.notEqual(first[0], first[1])

		for (const id of first) {
			assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
		}
	})

	it('id зависит от счёта', () => {
		const { newId: _, ...noId } = input()
		const [a] = buildImportPlan(db, [op({})], noId).create
		const [b] = buildImportPlan(db, [op({})], { ...noId, accountId: 'other' }).create

		assert.notEqual(a!.id, b!.id)
	})
})
