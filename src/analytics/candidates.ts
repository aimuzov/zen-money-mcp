import type { TxRow } from '#zen/store/queries'

export type Candidate = {
	tagId: string
	/** Context-weighted score (0..1) with a small-sample penalty applied. */
	confidence: number
	/** Raw frequency of this category in the history (0..1). */
	share: number
	/** Number of past transactions with this category. */
	count: number
	reason: string
}

// Tunable weights — kept together so the behavior is easy to reason about.
const HALFLIFE_DAYS = 180 // recency half-life
const WEEKDAY_MATCH = 1.0
const WEEKDAY_MISS = 0.4
const AMOUNT_MATCH = 1.0
const AMOUNT_MISS = 0.5
const SAMPLE_K = 2 // small-sample penalty: count / (count + K)
const MIN_SAMPLES_FOR_BUCKETS = 6

type Bucket = 'low' | 'mid' | 'high' | 'all'
type Thresholds = {
	t1: number
	t2: number
}

function weekdayOf(isoDate: string): number {
	return new Date(`${isoDate}T00:00:00Z`).getUTCDay()
}

function daysBetween(a: string, b: string): number {
	const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`))

	return ms / 86_400_000
}

function quantile(sortedAsc: number[], q: number): number {
	if (sortedAsc.length === 0) return 0

	const pos = (sortedAsc.length - 1) * q
	const base = Math.floor(pos)
	const rest = pos - base
	const at = sortedAsc[base] ?? 0
	const next = sortedAsc[base + 1]

	return next !== undefined ? at + rest * (next - at) : at
}

function amountThresholds(history: TxRow[]): Thresholds | null {
	if (history.length < MIN_SAMPLES_FOR_BUCKETS) return null

	const sorted = history.map((h) => h.outcome).sort((a, b) => a - b)
	const t1 = quantile(sorted, 1 / 3)
	const t2 = quantile(sorted, 2 / 3)

	if (t1 === t2) return null // degenerate (all similar) — disable amount weighting

	return { t1, t2 }
}

function bucketOf(outcome: number, thr: Thresholds | null): Bucket {
	if (!thr) return 'all'

	if (outcome <= thr.t1) return 'low'

	if (outcome <= thr.t2) return 'mid'

	return 'high'
}

function pct(x: number): string {
	return `${Math.round(x * 100)}%`
}

/**
 * Rank candidate categories for a transaction from the history of past
 * categorized purchases at the same place. Each past purchase is weighted by
 * recency, matching weekday, and matching amount bucket; a small-sample penalty
 * damps categories backed by little evidence. Returns candidates sorted by
 * confidence (highest first). Pure: no IO.
 */
export function rankCandidates(tx: TxRow, history: TxRow[]): Candidate[] {
	if (history.length === 0) return []

	const reviewWeekday = weekdayOf(tx.date)
	const thresholds = amountThresholds(history)
	const reviewBucket = bucketOf(tx.outcome, thresholds)

	const scoreByTag = new Map<string, number>()
	const countByTag = new Map<string, number>()
	let totalScore = 0

	for (const h of history) {
		const tag = h.tag0

		if (!tag) continue

		const wRecency = Math.exp(-daysBetween(h.date, tx.date) / HALFLIFE_DAYS)
		const wWeekday = weekdayOf(h.date) === reviewWeekday ? WEEKDAY_MATCH : WEEKDAY_MISS
		const wAmount = bucketOf(h.outcome, thresholds) === reviewBucket ? AMOUNT_MATCH : AMOUNT_MISS
		const score = wRecency * wWeekday * wAmount

		scoreByTag.set(tag, (scoreByTag.get(tag) ?? 0) + score)
		countByTag.set(tag, (countByTag.get(tag) ?? 0) + 1)
		totalScore += score
	}

	const total = history.length
	const candidates: Candidate[] = []

	for (const [tagId, score] of scoreByTag) {
		const count = countByTag.get(tagId) ?? 0
		const weighted = totalScore > 0 ? score / totalScore : 0
		const penalty = count / (count + SAMPLE_K)
		const confidence = weighted * penalty
		const share = count / total

		candidates.push({
			tagId,
			confidence,
			share,
			count,
			reason: `${count}/${total} past purchases here (${pct(share)}); weighted confidence ${pct(confidence)}`,
		})
	}

	candidates.sort((a, b) => b.confidence - a.confidence)

	return candidates
}
