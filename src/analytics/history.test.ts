import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { applyDiff } from '#zen/store/apply-diff'
import { openDb, type Db } from '#zen/store/db'
import { getTransaction } from '#zen/store/queries'
import { cardAccount, makeTx, RUB } from '#zen/testing/fixtures'

import { getCategoryHistoryFor } from './history.ts'

let db: Db

beforeEach(() => {
	db = openDb(':memory:')

	applyDiff(db, {
		serverTimestamp: 1,
		instrument: [RUB],
		account: [cardAccount],
		merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Shop' }],
		transaction: [
			makeTx({ id: 'a', date: '2026-01-01', outcome: 100, tag: ['groceries'], merchant: 'm1' }),
			makeTx({ id: 'b', date: '2026-01-02', outcome: 200, tag: ['beer'], merchant: 'm1' }),
			makeTx({ id: 'self', date: '2026-01-03', outcome: 150, tag: ['beer'], merchant: 'm1' }),
			makeTx({ id: 'other', date: '2026-01-04', outcome: 999, tag: ['x'], merchant: 'm2' }),
		],
	})
})

describe('getCategoryHistoryFor', () => {
	it('returns same-merchant history excluding the transaction itself', () => {
		const tx = getTransaction(db, 'self')!
		const history = getCategoryHistoryFor(db, tx)

		assert.deepEqual(history.map((r) => r.id).sort(), ['a', 'b'])
	})

	it('returns empty when nothing identifies the place', () => {
		const tx = getTransaction(db, 'self')!
		const orphan = { ...tx, merchant: null, payeeNorm: null, mcc: null }

		assert.deepEqual(getCategoryHistoryFor(db, orphan), [])
	})
})
