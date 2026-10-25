import { McpServer, readVersion } from '@aimuzov/infra-mcp-kit'

import { ensureDataDir, type Config } from '#zen/config'
import { openDb } from '#zen/store/db'

import type { ToolContext } from './context.ts'
import { registerApplyCategories } from './tools/apply-categories.ts'
import { registerFindTransactions } from './tools/find-transactions.ts'
import { registerImportStatement } from './tools/import-statement.ts'
import { registerListCategories } from './tools/list-categories.ts'
import { registerMerchantHistory } from './tools/merchant-history.ts'
import { registerReviewExpenses } from './tools/review-expenses.ts'
import { registerSync } from './tools/sync.ts'

/** Build a fully-wired MCP server (opens the cache DB and registers all tools). */
export function createServer(cfg: Config): McpServer {
	ensureDataDir(cfg)
	const db = openDb(cfg.dbPath)
	const ctx: ToolContext = { db, cfg }

	const server = new McpServer({ name: 'zen-money-mcp', version: readVersion(import.meta.url) })

	registerSync(server, ctx)
	registerListCategories(server, ctx)
	registerFindTransactions(server, ctx)
	registerMerchantHistory(server, ctx)
	registerReviewExpenses(server, ctx)
	registerApplyCategories(server, ctx)
	registerImportStatement(server, ctx)

	return server
}
