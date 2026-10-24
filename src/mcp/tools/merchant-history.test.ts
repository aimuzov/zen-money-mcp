import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { applyDiff } from '#zen/store/apply-diff'
import { openDb, type Db } from '#zen/store/db'
import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'

import { buildMerchantHistory } from './merchant-history.ts'

let db: Db

beforeEach(() => {
	db = openDb(':memory:')

	applyDiff(db, {
		serverTimestamp: 1,
		instrument: [RUB],
		account: [cardAccount],
		tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
		merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
		transaction: [
			makeTx({ id: 'a', date: '2026-01-01', outcome: 500, tag: ['groceries'], merchant: 'm1' }),
			makeTx({ id: 'b', date: '2026-01-02', outcome: 500, tag: ['groceries'], merchant: 'm1' }),
			makeTx({ id: 'c', date: '2026-01-03', outcome: 300, tag: ['beer'], merchant: 'm1' }),
		],
	})
})

describe('buildMerchantHistory', () => {
	it('summarizes the category distribution for a merchant', () => {
		const out = buildMerchantHistory(db, { merchant: 'm1' })

		assert.equal(out.totalCount, 3)
		assert.equal(out.totalOutcome, 1300)
		assert.equal(out.currency, 'RUB')

		const groceries = out.distribution.find((d) => d.tagId === 'groceries')!

		assert.equal(groceries.count, 2)
		assert.equal(groceries.tagPath, 'Groceries')
		assert.equal(groceries.sumOutcome, 1000)
		assert.equal(out.distribution[0]!.tagId, 'groceries') // sorted by count desc
		assert.equal(out.recentExamples.length, 3)
	})
})
