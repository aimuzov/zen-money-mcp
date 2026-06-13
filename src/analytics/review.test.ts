import { describe, it, expect } from 'vitest'
import { reviewTransaction } from './review.js'
import { makeRow } from '../testing/fixtures.js'

const HIST_DATE = '2026-03-02'
const REVIEW_DATE = '2026-03-09'

function hist(tag: string, n: number, outcome = 500) {
  return Array.from({ length: n }, (_, i) =>
    makeRow({ id: `${tag}-${i}`, date: HIST_DATE, outcome, tag0: tag, tag: [tag] })
  )
}

describe('reviewTransaction', () => {
  it('flags an uncategorized transaction', () => {
    const tx = makeRow({ date: REVIEW_DATE, outcome: 500, tag: null, tag0: null })
    const v = reviewTransaction(tx, hist('groceries', 10))
    expect(v.status).toBe('uncategorized')
    expect(v.candidates[0].tagId).toBe('groceries')
  })

  it('flags a minority category against a dominant history', () => {
    const tx = makeRow({ date: REVIEW_DATE, outcome: 500, tag: ['beer'], tag0: 'beer' })
    const v = reviewTransaction(tx, hist('groceries', 10))
    expect(v.status).toBe('likely_miscategorized')
    expect(v.candidates[0].tagId).toBe('groceries')
  })

  it('accepts the current category when it is the most likely one', () => {
    const tx = makeRow({ date: REVIEW_DATE, outcome: 500, tag: ['groceries'], tag0: 'groceries' })
    const v = reviewTransaction(tx, hist('groceries', 10))
    expect(v.status).toBe('ok')
  })

  it('does not cry wolf on a genuinely mixed merchant', () => {
    const tx = makeRow({ date: REVIEW_DATE, outcome: 500, tag: ['beer'], tag0: 'beer' })
    const history = [...hist('groceries', 5), ...hist('beer', 5)]
    const v = reviewTransaction(tx, history)
    expect(v.status).toBe('ok')
  })

  it('stays ok when there is no history to judge against', () => {
    const tx = makeRow({ date: REVIEW_DATE, outcome: 500, tag: ['x'], tag0: 'x' })
    const v = reviewTransaction(tx, [])
    expect(v.status).toBe('ok')
  })
})
