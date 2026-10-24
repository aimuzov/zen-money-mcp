import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import type { ZmDiff } from '#zen/api/types'
import { applyDiff } from '#zen/store/apply-diff'
import { openDb, type Db } from '#zen/store/db'
import { getTransaction } from '#zen/store/queries'
import { cardAccount, makeTag, makeTx, RUB } from '#zen/testing/fixtures'

import { applyChanges, buildApplyPreview } from './apply-categories.ts'

let db: Db

beforeEach(() => {
	db = openDb(':memory:')

	applyDiff(db, {
		serverTimestamp: 50,
		instrument: [RUB],
		account: [cardAccount],
		tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
		transaction: [makeTx({ id: 't1', outcome: 500, tag: ['groceries'] })],
	})
})

describe('buildApplyPreview', () => {
	it('shows before -> after without touching the cache', () => {
		const out = buildApplyPreview(db, [{ transactionId: 't1', tagId: 'beer' }])

		assert.equal(out.dryRun, true)
		assert.equal(out.confirmationRequired, true)
		const [p] = out.preview

		assert.equal(p!.found, true)
		assert.deepEqual(p!.before, { tag: ['groceries'], tagPath: 'Groceries' })
		assert.deepEqual(p!.after, { tag: ['beer'], tagPath: 'Beer' })
		// cache unchanged
		assert.equal(getTransaction(db, 't1')!.tag0, 'groceries')
	})

	it('represents uncategorizing (tagId null)', () => {
		const out = buildApplyPreview(db, [{ transactionId: 't1', tagId: null }])

		assert.deepEqual(out.preview[0]!.after, { tag: null, tagPath: null })
	})

	it('marks unknown transactions as not found', () => {
		const out = buildApplyPreview(db, [{ transactionId: 'nope', tagId: 'beer' }])

		assert.equal(out.preview[0]!.found, false)
	})
})

describe('applyChanges', () => {
	it('pushes a minimal diff and refreshes the cache from the response', async () => {
		let body: any
		const fakeFetch = (async (_url: string, init: RequestInit) => {
			body = JSON.parse(init.body as string)
			// Echo the pushed transactions back as the server would, with a new stamp.
			const echo: ZmDiff = {
				serverTimestamp: 99,
				transaction: body.transaction,
			}

			return { json: async () => echo }
		}) as unknown as typeof fetch

		const result = await applyChanges(db, 'ru', [{ transactionId: 't1', tagId: 'beer' }], 'tok', fakeFetch)

		assert.equal(body.transaction[0].id, 't1')
		assert.deepEqual(body.transaction[0].tag, ['beer'])
		assert.equal(typeof body.transaction[0].changed, 'number')
		assert.equal(result.applied, 1)
		assert.equal(result.serverTimestamp, 99)
		// cache reflects the change
		assert.equal(getTransaction(db, 't1')!.tag0, 'beer')
	})

	it('skips unknown transactions', async () => {
		const fakeFetch = (async (_url: string, init: RequestInit) => {
			const body = JSON.parse(init.body as string)

			return { json: async () => ({ serverTimestamp: 99, transaction: body.transaction }) }
		}) as unknown as typeof fetch

		const result = await applyChanges(db, 'ru', [{ transactionId: 'nope', tagId: 'beer' }], 'tok', fakeFetch)

		assert.equal(result.applied, 0)
		assert.deepEqual(result.skipped, ['nope'])
	})
})
