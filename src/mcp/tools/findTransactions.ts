import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { findTransactions } from '../../store/queries.js'
import { getCategoryHistoryFor } from '../../analytics/history.js'
import { reviewTransaction } from '../../analytics/review.js'
import { Presenter, jsonResult } from '../format.js'
import type { ToolContext } from '../context.js'

const DEFAULT_LIMIT = 100

interface FindInput {
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
      const { needsReviewOnly, ...filter } = args
      let rows = findTransactions(ctx.db, {
        ...filter,
        limit: filter.limit ?? DEFAULT_LIMIT,
      })
      if (needsReviewOnly) {
        rows = rows.filter(
          tx =>
            reviewTransaction(tx, getCategoryHistoryFor(ctx.db, tx)).status !==
            'ok'
        )
      }
      const presenter = new Presenter(ctx.db)
      return jsonResult({
        count: rows.length,
        transactions: rows.map(r => presenter.present(r)),
      })
    }
  )
}
