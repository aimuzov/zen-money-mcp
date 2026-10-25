import { failure, json } from '@aimuzov/infra-mcp-kit'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { normalizePayee, type GroupKey } from '#zen/analytics/grouping'
import type { ToolContext } from '#zen/mcp/context'
import { Presenter } from '#zen/mcp/format'
import type { Db } from '#zen/store/db'
import { txByMcc, txByMerchant, txByPayeeNorm, type TxRow } from '#zen/store/queries'

export type MerchantHistoryInput = {
	merchant?: string
	payee?: string
	mcc?: number
	from?: string
	to?: string
}

function resolve(db: Db, input: MerchantHistoryInput): { key: GroupKey; rows: TxRow[] } | null {
	if (input.merchant)
		return { key: { kind: 'merchant', value: input.merchant }, rows: txByMerchant(db, input.merchant) }

	if (input.payee) {
		const norm = normalizePayee(input.payee)

		return { key: { kind: 'payee', value: norm }, rows: txByPayeeNorm(db, norm) }
	}

	if (input.mcc != null) return { key: { kind: 'mcc', value: String(input.mcc) }, rows: txByMcc(db, input.mcc) }

	return null
}

const weekdayOf = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay()

/** Full historical category breakdown for a merchant / payee / mcc. */
export function buildMerchantHistory(db: Db, input: MerchantHistoryInput) {
	const resolved = resolve(db, input)

	if (!resolved) throw new Error('Provide one of merchant, payee or mcc.')

	const presenter = new Presenter(db)
	let rows = resolved.rows

	if (input.from) rows = rows.filter((r) => r.date >= input.from!)

	if (input.to) rows = rows.filter((r) => r.date <= input.to!)

	const total = rows.length
	const totalOutcome = rows.reduce((s, r) => s + r.outcome, 0)
	const currency = rows[0] ? presenter.currency(rows[0].outcomeInstrument) : null

	const byTag = new Map<string, { count: number; sumOutcome: number; lastSeen: string }>()
	const byWeekday: Record<number, number> = {}

	for (const r of rows) {
		const tag = r.tag0!
		const e = byTag.get(tag) ?? { count: 0, sumOutcome: 0, lastSeen: r.date }

		e.count++
		e.sumOutcome += r.outcome

		if (r.date > e.lastSeen) e.lastSeen = r.date

		byTag.set(tag, e)
		const wd = weekdayOf(r.date)

		byWeekday[wd] = (byWeekday[wd] ?? 0) + 1
	}

	const distribution = [...byTag.entries()]
		.map(([tagId, e]) => ({
			tagId,
			tagPath: presenter.tagPath(tagId),
			count: e.count,
			share: total ? Math.round((e.count / total) * 1000) / 1000 : 0,
			sumOutcome: e.sumOutcome,
			lastSeen: e.lastSeen,
		}))
		.sort((a, b) => b.count - a.count)

	const recentExamples = [...rows]
		.sort((a, b) => (a.date < b.date ? 1 : -1))
		.slice(0, 10)
		.map((r) => presenter.present(r))

	return {
		groupKey: resolved.key,
		totalCount: total,
		totalOutcome,
		currency,
		distribution,
		byWeekday,
		recentExamples,
	}
}

export function registerMerchantHistory(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'zen_merchant_history',
		{
			title: 'Merchant history',
			description:
				'Full historical category breakdown for a place (by merchant id, payee text, ' +
				'or mcc): how often each category was used, totals, and recent examples. ' +
				'Use to dig deeper when a review row is ambiguous.',
			inputSchema: {
				merchant: z.string().optional(),
				payee: z.string().optional(),
				mcc: z.number().optional(),
				from: z.string().optional(),
				to: z.string().optional(),
			},
		},
		async (args: MerchantHistoryInput) => {
			if (!args.merchant && !args.payee && args.mcc == null) {
				return failure('Provide one of merchant, payee or mcc.')
			}

			return json(buildMerchantHistory(ctx.db, args))
		},
	)
}
