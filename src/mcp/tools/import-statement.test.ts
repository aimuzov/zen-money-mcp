import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { ImportPlan } from '#zen/import/build-import'
import type { StatementOp } from '#zen/import/ozon-statement'
import { makeTx } from '#zen/testing/fixtures'

import { summarizeImport } from './import-statement.ts'

const repayment: StatementOp = {
	date: '2026-06-03',
	documentId: 'R1',
	signed: 3000,
	amount: 3000,
	kind: 'repayment',
	payee: null,
	comment: null,
}

describe('summarizeImport', () => {
	it('aggregates counts, totals and examples', () => {
		const plan: ImportPlan = {
			create: [
				makeTx({ id: 'a', date: '2026-06-03', outcome: 100, payee: 'A' }),
				makeTx({ id: 'b', date: '2026-06-04', outcome: 200, payee: 'B' }),
				makeTx({ id: 'c', date: '2026-06-05', income: 50, outcome: 0, payee: 'C' }),
			],
			skippedDuplicates: [repayment, repayment, repayment],
			skippedRepayments: [repayment, repayment],
		}
		const summary = summarizeImport(plan, {
			id: 'acc',
			title: 'Озон: Кредитная Карта',
			instrument: 2,
			user: 1,
		})

		assert.partialDeepStrictEqual(summary, {
			account: { id: 'acc', title: 'Озон: Кредитная Карта' },
			toCreate: 3,
			duplicates: 3,
			repaymentsSkipped: 2,
			byKind: { purchases: 2, refunds: 1 },
			totalOutcome: 300,
			totalIncome: 50,
		})

		assert.equal(summary.examples.length, 3)
		assert.partialDeepStrictEqual(summary.examples[0], { date: '2026-06-03', outcome: 100, payee: 'A' })
	})

	it('caps examples at 15', () => {
		const create = Array.from({ length: 20 }, (_, i) => makeTx({ id: `x${i}`, outcome: 10 }))
		const summary = summarizeImport(
			{ create, skippedDuplicates: [], skippedRepayments: [] },
			{ id: 'acc', title: 'A', instrument: 2, user: 1 },
		)

		assert.equal(summary.examples.length, 15)
		assert.equal(summary.toCreate, 20)
	})
})
