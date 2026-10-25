import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import type { ZmDiff } from '#zen/api/types'
import { makeTx } from '#zen/testing/fixtures'

import { applyDiff } from './apply-diff.ts'
import { getMeta, openDb, type Db } from './db.ts'
import { sync } from './sync.ts'

let db: Db

beforeEach(() => {
	db = openDb(':memory:')
	applyDiff(db, { serverTimestamp: 100 })
})

function fetchReturning(diff: ZmDiff) {
	const calls: Array<{ body: any }> = []
	const fakeFetch = async (_url: string | URL, init?: RequestInit) => {
		calls.push({ body: JSON.parse(init!.body as string) })

		return Response.json(diff)
	}

	return { fakeFetch: fakeFetch as unknown as typeof fetch, calls }
}

describe('sync', () => {
	it('sends the stored serverTimestamp and applies the returned diff', async () => {
		const { fakeFetch, calls } = fetchReturning({
			serverTimestamp: 200,
			transaction: [makeTx({ id: 'fresh', outcome: 50 })],
		})

		const result = await sync(db, 'tok', 'ru', { fetchImpl: fakeFetch })

		assert.equal(calls[0]!.body.serverTimestamp, 100)
		assert.equal(result.from, 100)
		assert.equal(result.to, 200)
		assert.equal(result.added, 1)
		assert.equal(getMeta(db, 'serverTimestamp'), '200')
		assert.notEqual(getMeta(db, 'lastSyncAt'), undefined)
	})

	it('full sync resets the cursor to 0', async () => {
		const { fakeFetch, calls } = fetchReturning({ serverTimestamp: 300 })

		await sync(db, 'tok', 'ru', { full: true, fetchImpl: fakeFetch })
		assert.equal(calls[0]!.body.serverTimestamp, 0)
	})

	it('на пустом кэше начинает с нуля', async () => {
		const empty = openDb(':memory:')
		const { fakeFetch, calls } = fetchReturning({ serverTimestamp: 10 })
		const result = await sync(empty, 'tok', 'ru', { fetchImpl: fakeFetch })

		assert.equal(calls[0]!.body.serverTimestamp, 0)
		assert.deepEqual(result, { added: 0, deletions: 0, from: 0, to: 10 })
	})

	it('ошибка ZenMoney не сдвигает курсор и время синхронизации', async () => {
		const fakeFetch = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch

		await assert.rejects(sync(db, 'tok', 'ru', { fetchImpl: fakeFetch }), /HTTP 503: down/)
		assert.equal(getMeta(db, 'serverTimestamp'), '100')
		assert.equal(getMeta(db, 'lastSyncAt'), undefined)
	})
})
