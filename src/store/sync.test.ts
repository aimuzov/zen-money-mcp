import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, getMeta, type Db } from './db.js'
import { applyDiff } from './applyDiff.js'
import { sync } from './sync.js'
import { makeTx } from '../testing/fixtures.js'
import type { ZmDiff } from '../api/types.js'

let db: Db

beforeEach(() => {
  db = openDb(':memory:')
  applyDiff(db, { serverTimestamp: 100 })
})

function fetchReturning(diff: ZmDiff) {
  const calls: Array<{ body: any }> = []
  const fakeFetch = async (_url: string | URL, init?: RequestInit) => {
    calls.push({ body: JSON.parse(init!.body as string) })
    return { json: async () => diff }
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

    expect(calls[0].body.serverTimestamp).toBe(100)
    expect(result.from).toBe(100)
    expect(result.to).toBe(200)
    expect(result.added).toBe(1)
    expect(getMeta(db, 'serverTimestamp')).toBe('200')
    expect(getMeta(db, 'lastSyncAt')).toBeDefined()
  })

  it('full sync resets the cursor to 0', async () => {
    const { fakeFetch, calls } = fetchReturning({ serverTimestamp: 300 })
    await sync(db, 'tok', 'ru', { full: true, fetchImpl: fakeFetch })
    expect(calls[0].body.serverTimestamp).toBe(0)
  })
})
