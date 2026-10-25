import { readFileSync } from 'node:fs'
import { failure, json } from '@aimuzov/infra-mcp-kit'
import type { McpServer } from '@aimuzov/infra-mcp-kit'
import { z } from 'zod'

import { getValidAccessToken, NotAuthenticatedError } from '#zen/auth/index'
import { buildImportPlan, type ImportPlan } from '#zen/import/build-import'
import { extractPdfText } from '#zen/import/extract-pdf-text'
import { parseOzonStatement } from '#zen/import/ozon-statement'
import type { ToolContext } from '#zen/mcp/context'
import { pushDiff } from '#zen/mcp/push-diff'
import { getMeta } from '#zen/store/db'
import { getAccount, type AccountInfo } from '#zen/store/queries'

export type ImportExample = {
	date: string
	income: number
	outcome: number
	payee: string | null
}

export type ImportSummary = {
	account: { id: string; title: string }
	toCreate: number
	duplicates: number
	repaymentsSkipped: number
	byKind: { purchases: number; refunds: number }
	totalOutcome: number
	totalIncome: number
	examples: ImportExample[]
}

const EXAMPLE_LIMIT = 15

/** Human-facing rollup of an import plan (counts, totals, sample rows). */
export function summarizeImport(plan: ImportPlan, account: AccountInfo): ImportSummary {
	const purchases = plan.create.filter((t) => t.outcome > 0)
	const refunds = plan.create.filter((t) => t.income > 0)

	return {
		account: { id: account.id, title: account.title },
		toCreate: plan.create.length,
		duplicates: plan.skippedDuplicates.length,
		repaymentsSkipped: plan.skippedRepayments.length,
		byKind: { purchases: purchases.length, refunds: refunds.length },
		totalOutcome: Math.round(purchases.reduce((s, t) => s + t.outcome, 0) * 100) / 100,
		totalIncome: Math.round(refunds.reduce((s, t) => s + t.income, 0) * 100) / 100,
		examples: plan.create.slice(0, EXAMPLE_LIMIT).map((t) => ({
			date: t.date,
			income: t.income,
			outcome: t.outcome,
			payee: t.payee,
		})),
	}
}

export function registerImportStatement(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'zen_import_statement',
		{
			title: 'Import bank statement',
			description:
				'Import missing transactions from an Ozon-bank PDF statement into a ZenMoney ' +
				'account. Deduplicates against existing transactions by date + amount; credit ' +
				'repayments (transfers) are never created. ALWAYS call with dryRun:true first ' +
				'(the default) to preview the plan, present it to the user, and only call again ' +
				'with dryRun:false after explicit confirmation. New transactions are created ' +
				'without a category (run zen_review_expenses afterwards).',
			inputSchema: {
				filePath: z.string().describe('Absolute path to the PDF statement'),
				account: z.string().describe('Target account id (exact)'),
				dryRun: z.boolean().optional().describe('Preview only (default true). Set false to actually write.'),
			},
		},
		async (args: { filePath: string; account: string; dryRun?: boolean }) => {
			const account = getAccount(ctx.db, args.account)

			if (!account) return failure(`Account not found: ${args.account}`)

			let ops

			try {
				const data = new Uint8Array(readFileSync(args.filePath))
				const text = await extractPdfText(data)

				ops = parseOzonStatement(text)
			} catch (err) {
				return failure(`Failed to read statement: ${err instanceof Error ? err.message : String(err)}`)
			}

			if (ops.length === 0) {
				return failure('No operations parsed from the statement.')
			}

			const plan = buildImportPlan(ctx.db, ops, {
				accountId: account.id,
				instrument: account.instrument,
				user: account.user,
				now: Math.floor(Date.now() / 1000),
			})
			const summary = summarizeImport(plan, account)

			if (args.dryRun !== false) {
				return json({
					dryRun: true,
					confirmationRequired: true,
					parsed: ops.length,
					...summary,
				})
			}

			if (plan.create.length === 0) {
				return json({ dryRun: false, applied: 0, ...summary })
			}

			let token: string

			try {
				token = await getValidAccessToken(ctx.cfg)
			} catch (err) {
				if (err instanceof NotAuthenticatedError) return failure(err.message)

				throw err
			}

			const serverTimestamp = Number(getMeta(ctx.db, 'serverTimestamp') ?? 0)
			const pushed = await pushDiff(ctx.db, token, ctx.cfg.endpoint, {
				serverTimestamp,
				transaction: plan.create,
			})

			return json({
				dryRun: false,
				applied: plan.create.length,
				...pushed,
				...summary,
			})
		},
	)
}
