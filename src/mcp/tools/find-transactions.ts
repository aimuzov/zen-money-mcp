import { json } from '@aimuzov/infra-mcp-kit'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { getCategoryHistoryFor } from '#zen/analytics/history'
import { reviewTransaction } from '#zen/analytics/review'
import type { ToolContext } from '#zen/mcp/context'
import { Presenter } from '#zen/mcp/format'
import { findTransactions } from '#zen/store/queries'

const DEFAULT_LIMIT = 100

type FindInput = {
	from?: string
	to?: string
	account?: string
	uncategorizedOnly?: boolean
	needsReviewOnly?: boolean
	merchant?: string
	payee?: string
	mcc?: number
	minOutcome?: number
	limit?: number
}

export function registerFindTransactions(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'zen_find_transactions',
		{
			title: 'Find transactions',
			description:
				'Flexible filtered transaction lookup (newest first). Filter by date range, ' +
				'account, merchant/payee/mcc, uncategorized-only, or needs-review-only.',
			inputSchema: {
				from: z.string().optional(),
				to: z.string().optional(),
				account: z.string().optional(),
				uncategorizedOnly: z.boolean().optional(),
				needsReviewOnly: z.boolean().optional(),
				merchant: z.string().optional(),
				payee: z.string().optional(),
				mcc: z.number().optional(),
				minOutcome: z.number().optional(),
				limit: z.number().int().min(1).max(500).optional(),
			},
		},
		async (args: FindInput) => {
			const { needsReviewOnly, limit = DEFAULT_LIMIT, ...filter } = args
			// Фильтр по разбору идёт в коде, а не в SQL: с лимитом в запросе свежие верные
			// покупки вытесняли бы более старые ошибки. -1 -- это LIMIT без ограничения в SQLite.
			let rows = findTransactions(ctx.db, { ...filter, limit: needsReviewOnly ? -1 : limit })

			if (needsReviewOnly) {
				rows = rows
					.filter((tx) => reviewTransaction(tx, getCategoryHistoryFor(ctx.db, tx)).status !== 'ok')
					.slice(0, limit)
			}

			const presenter = new Presenter(ctx.db)

			return json({
				count: rows.length,
				transactions: rows.map((r) => presenter.present(r)),
			})
		},
	)
}
