import { failure, json } from '@aimuzov/infra-mcp-kit'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type { EndpointPreference } from '#zen/api/endpoints'
import { fetchDiff } from '#zen/api/fetch-diff'
import { getValidAccessToken, NotAuthenticatedError } from '#zen/auth/index'
import type { ToolContext } from '#zen/mcp/context'
import { Presenter } from '#zen/mcp/format'
import { applyDiff } from '#zen/store/apply-diff'
import type { Db } from '#zen/store/db'
import { getMeta } from '#zen/store/db'
import { getRawTransaction, getTransaction } from '#zen/store/queries'

export type Change = {
	transactionId: string
	tagId: string | null
}

const tagArray = (tagId: string | null): string[] | null => (tagId === null ? null : [tagId])

/** Build a no-network preview of category changes (before -> after). */
export function buildApplyPreview(db: Db, changes: Change[]) {
	const presenter = new Presenter(db)
	const preview = changes.map((c) => {
		const tx = getTransaction(db, c.transactionId)

		if (!tx) return { transactionId: c.transactionId, found: false }

		return {
			transactionId: c.transactionId,
			found: true,
			date: tx.date,
			outcome: tx.outcome,
			currency: presenter.currency(tx.outcomeInstrument),
			merchant: tx.merchant,
			merchantTitle: presenter.merchantTitle(tx.merchant),
			payee: tx.payee,
			before: { tag: tx.tag, tagPath: presenter.tagPath(tx.tag0) },
			after: {
				tag: tagArray(c.tagId),
				tagPath: presenter.tagPath(c.tagId),
			},
		}
	})

	return { dryRun: true as const, confirmationRequired: true as const, preview }
}

export type ApplyOutcome = {
	applied: number
	serverTimestamp: number
	skipped: string[]
}

/** Push category changes to ZenMoney and refresh the cache from the response. */
export async function applyChanges(
	db: Db,
	endpoint: EndpointPreference,
	changes: Change[],
	token: string,
	fetchImpl?: typeof fetch,
): Promise<ApplyOutcome> {
	const now = Math.floor(Date.now() / 1000)
	const mutated = []
	const skipped: string[] = []

	for (const c of changes) {
		const raw = getRawTransaction(db, c.transactionId)

		if (!raw) {
			skipped.push(c.transactionId)
			continue
		}

		raw.tag = tagArray(c.tagId)
		raw.changed = now
		mutated.push(raw)
	}

	const currentStamp = Number(getMeta(db, 'serverTimestamp') ?? 0)

	if (mutated.length === 0) {
		return { applied: 0, serverTimestamp: currentStamp, skipped }
	}

	const diff = await fetchDiff(token, endpoint, { serverTimestamp: currentStamp, transaction: mutated }, fetchImpl)

	applyDiff(db, diff)

	return {
		applied: mutated.length,
		serverTimestamp: diff.serverTimestamp,
		skipped,
	}
}

export function registerApplyCategories(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'zen_apply_categories',
		{
			title: 'Apply category changes',
			description:
				'Write category changes back to ZenMoney. ALWAYS call with dryRun:true first ' +
				'(the default) to preview before -> after, present that list to the user, and ' +
				'only call again with dryRun:false after the user explicitly confirms. ' +
				'tagId null clears the category.',
			inputSchema: {
				changes: z
					.array(
						z.object({
							transactionId: z.string(),
							tagId: z.string().nullable(),
						}),
					)
					.min(1),
				dryRun: z.boolean().optional().describe('Preview only (default true). Set false to actually write.'),
			},
		},
		async (args: { changes: Change[]; dryRun?: boolean }) => {
			if (args.dryRun !== false) {
				return json(buildApplyPreview(ctx.db, args.changes))
			}

			let token: string

			try {
				token = await getValidAccessToken(ctx.cfg)
			} catch (err) {
				if (err instanceof NotAuthenticatedError) return failure(err.message)

				throw err
			}

			const result = await applyChanges(ctx.db, ctx.cfg.endpoint, args.changes, token)

			return json({ dryRun: false, ...result })
		},
	)
}
