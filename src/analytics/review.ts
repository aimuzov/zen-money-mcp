import type { TxRow } from '../store/queries.js'
import { rankCandidates, type Candidate } from './candidates.js'

export type ReviewStatus = 'uncategorized' | 'likely_miscategorized' | 'ok'

export interface ReviewVerdict {
  status: ReviewStatus
  currentTag: string[] | null
  candidates: Candidate[]
  reason: string
}

// A transaction is flagged as likely mis-categorized only when a clear winner
// dominates AND the current category is a weak choice in this context. High
// merchant entropy alone never triggers a flag (no crying wolf).
const TOP_CONFIDENCE_MIN = 0.6
const CURRENT_CONFIDENCE_MAX = 0.25

/**
 * Judge a single transaction against the history of its place. Produces a
 * status, the ranked candidates, and a human-readable reason — but never picks
 * the final category itself (that is the caller's / LLM's job).
 */
export function reviewTransaction(
  tx: TxRow,
  history: TxRow[]
): ReviewVerdict {
  const candidates = rankCandidates(tx, history)
  const current = tx.tag0

  if (!current) {
    return {
      status: 'uncategorized',
      currentTag: tx.tag,
      candidates,
      reason: candidates.length
        ? 'No category set; history suggests likely options.'
        : 'No category set and no history for this place.',
    }
  }

  if (candidates.length === 0) {
    return {
      status: 'ok',
      currentTag: tx.tag,
      candidates,
      reason: 'No history to compare against.',
    }
  }

  const top = candidates[0]
  if (top.tagId === current) {
    return {
      status: 'ok',
      currentTag: tx.tag,
      candidates,
      reason: 'Current category is the most likely one here.',
    }
  }

  const currentConfidence =
    candidates.find(c => c.tagId === current)?.confidence ?? 0

  if (
    top.confidence >= TOP_CONFIDENCE_MIN &&
    currentConfidence <= CURRENT_CONFIDENCE_MAX
  ) {
    return {
      status: 'likely_miscategorized',
      currentTag: tx.tag,
      candidates,
      reason: `Current category is a weak choice here (${fmtPct(currentConfidence)}); a different category dominates (${fmtPct(top.confidence)}).`,
    }
  }

  return {
    status: 'ok',
    currentTag: tx.tag,
    candidates,
    reason: 'Current category is plausible given the mixed history here.',
  }
}

function fmtPct(x: number): string {
  return `${Math.round(x * 100)}%`
}
