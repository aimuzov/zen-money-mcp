import { describe, it, expect } from 'vitest'
import { rankCandidates } from './candidates.js'
import { makeRow } from '../testing/fixtures.js'

// All history shares one weekday so recency/weekday are neutral and the
// behavior under test (frequency, amount buckets, penalties) is isolated.
const HIST_DATE = '2026-03-02' // Monday
const REVIEW_DATE = '2026-03-09' // Monday, one week later

function hist(tag: string, outcome: number, n: number) {
  return Array.from({ length: n }, (_, i) =>
    makeRow({ id: `${tag}-${i}`, date: HIST_DATE, outcome, tag0: tag, tag: [tag] })
  )
}

describe('rankCandidates', () => {
  it('returns empty when there is no history', () => {
    const tx = makeRow({ date: REVIEW_DATE, outcome: 500 })
    expect(rankCandidates(tx, [])).toEqual([])
  })

  it('ranks a dominant category first with high confidence', () => {
    const tx = makeRow({ date: REVIEW_DATE, outcome: 500 })
    const history = hist('groceries', 500, 10)
    const candidates = rankCandidates(tx, history)

    expect(candidates[0].tagId).toBe('groceries')
    expect(candidates[0].count).toBe(10)
    expect(candidates[0].share).toBe(1)
    expect(candidates[0].confidence).toBeGreaterThan(0.8)
  })

  it('damps confidence for a tiny sample', () => {
    const tx = makeRow({ date: REVIEW_DATE, outcome: 500 })
    const candidates = rankCandidates(tx, hist('groceries', 500, 1))
    expect(candidates[0].share).toBe(1)
    expect(candidates[0].confidence).toBeLessThan(0.5)
  })

  it('uses amount buckets to separate cheap vs expensive purchases at one place', () => {
    const history = [...hist('beer', 300, 4), ...hist('groceries', 1500, 4)]

    const cheap = rankCandidates(makeRow({ date: REVIEW_DATE, outcome: 300 }), history)
    expect(cheap[0].tagId).toBe('beer')

    const pricey = rankCandidates(makeRow({ date: REVIEW_DATE, outcome: 1500 }), history)
    expect(pricey[0].tagId).toBe('groceries')
  })
})
