import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, type Db } from '../../store/db.js'
import { applyDiff } from '../../store/applyDiff.js'
import { getTransaction } from '../../store/queries.js'
import { buildApplyPreview, applyChanges } from './applyCategories.js'
import { makeTx, makeTag, RUB, cardAccount } from '../../testing/fixtures.js'
import type { ZmDiff } from '../../api/types.js'

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
    expect(out.dryRun).toBe(true)
    expect(out.confirmationRequired).toBe(true)
    const [p] = out.preview
    expect(p.found).toBe(true)
    expect(p.before).toEqual({ tag: ['groceries'], tagPath: 'Groceries' })
    expect(p.after).toEqual({ tag: ['beer'], tagPath: 'Beer' })
    // cache unchanged
    expect(getTransaction(db, 't1')!.tag0).toBe('groceries')
  })

  it('represents uncategorizing (tagId null)', () => {
    const out = buildApplyPreview(db, [{ transactionId: 't1', tagId: null }])
    expect(out.preview[0].after).toEqual({ tag: null, tagPath: null })
  })

  it('marks unknown transactions as not found', () => {
    const out = buildApplyPreview(db, [{ transactionId: 'nope', tagId: 'beer' }])
    expect(out.preview[0].found).toBe(false)
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

    const result = await applyChanges(
      db,
      'ru',
      [{ transactionId: 't1', tagId: 'beer' }],
      'tok',
      fakeFetch
    )

    expect(body.transaction[0].id).toBe('t1')
    expect(body.transaction[0].tag).toEqual(['beer'])
    expect(typeof body.transaction[0].changed).toBe('number')
    expect(result.applied).toBe(1)
    expect(result.serverTimestamp).toBe(99)
    // cache reflects the change
    expect(getTransaction(db, 't1')!.tag0).toBe('beer')
  })

  it('skips unknown transactions', async () => {
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string)
      return { json: async () => ({ serverTimestamp: 99, transaction: body.transaction }) }
    }) as unknown as typeof fetch

    const result = await applyChanges(
      db,
      'ru',
      [{ transactionId: 'nope', tagId: 'beer' }],
      'tok',
      fakeFetch
    )
    expect(result.applied).toBe(0)
    expect(result.skipped).toEqual(['nope'])
  })
})
