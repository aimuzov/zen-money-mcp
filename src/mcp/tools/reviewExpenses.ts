import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Db } from '../../store/db.js'
import { findTransactions } from '../../store/queries.js'
import { getCategoryHistoryFor } from '../../analytics/history.js'
import { reviewTransaction, type ReviewVerdict } from '../../analytics/review.js'
import type { TxRow } from '../../store/queries.js'
import { Presenter, jsonResult } from '../format.js'
import type { ToolContext } from '../context.js'

const DEFAULT_LIMIT = 100

export interface ReviewInput {
  from: string
  to: string
  account?: string
  includeOk?: boolean
  limit?: number
}

const round = (x: number) => Math.round(x * 1000) / 1000

function toReviewOut(presenter: Presenter, tx: TxRow, v: ReviewVerdict) {
  return {
    transactionId: tx.id,
    date: tx.date,
    outcome: tx.outcome,
    currency: presenter.currency(tx.outcomeInstrument),
    merchant: tx.merchant,
    merchantTitle: presenter.merchantTitle(tx.merchant),
    payee: tx.payee,
    mcc: tx.mcc,
    currentTag: v.currentTag,
    currentTagPath: presenter.tagPath(tx.tag0),
    status: v.status,
    reason: v.reason,
    candidates: v.candidates.slice(0, 5).map(c => ({
      tagId: c.tagId,
      tagPath: presenter.tagPath(c.tagId),
      confidence: round(c.confidence),
      share: round(c.share),
      count: c.count,
      reason: c.reason,
    })),
  }
}

/**
 * The audit: scan expenses in a window and return those that are uncategorized
 * or likely mis-categorized, each enriched with ranked candidate categories.
 */
export function buildReviewExpenses(db: Db, input: ReviewInput) {
  const presenter = new Presenter(db)
  const expenses = findTransactions(db, {
    from: input.from,
    to: input.to,
    account: input.account,
    // Real expenses only: a transfer between own accounts (incl. cash
    // withdrawals) has income > 0 too and is not a categorizable expense.
  }).filter(t => t.outcome > 0 && t.income === 0)

  const limit = input.limit ?? DEFAULT_LIMIT
  const out: ReturnType<typeof toReviewOut>[] = []
  for (const tx of expenses) {
    const verdict = reviewTransaction(tx, getCategoryHistoryFor(db, tx))
    if (verdict.status === 'ok' && !input.includeOk) continue
    out.push(toReviewOut(presenter, tx, verdict))
    if (out.length >= limit) break
  }

  return { count: out.length, expenses: out }
}

export function registerReviewExpenses(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    'zen_review_expenses',
    {
      title: 'Review expenses',
      description:
        'Audit expenses in a date range: returns those that are uncategorized or ' +
        'likely mis-categorized, each with the current category and ranked candidate ' +
        'categories (with confidence) inferred from history at the same place. ' +
        'YOU decide the final category from this evidence, then propose changes via ' +
        'zen_apply_categories. Run zen_sync first if the cache may be stale.',
      inputSchema: {
        from: z.string().describe('Start date, inclusive (YYYY-MM-DD)'),
        to: z.string().describe('End date, inclusive (YYYY-MM-DD)'),
        account: z.string().optional().describe('Limit to one account id'),
        includeOk: z
          .boolean()
          .optional()
          .describe('Also include expenses that look fine (default false)'),
        limit: z.number().int().min(1).max(300).optional(),
      },
    },
    async (args: ReviewInput) => jsonResult(buildReviewExpenses(ctx.db, args))
  )
}
