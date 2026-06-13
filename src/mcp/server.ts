import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ensureDataDir, type Config } from '../config.js'
import { openDb } from '../store/db.js'
import type { ToolContext } from './context.js'
import { registerSync } from './tools/sync.js'
import { registerListCategories } from './tools/listCategories.js'
import { registerFindTransactions } from './tools/findTransactions.js'
import { registerMerchantHistory } from './tools/merchantHistory.js'
import { registerReviewExpenses } from './tools/reviewExpenses.js'
import { registerApplyCategories } from './tools/applyCategories.js'

/** Build a fully-wired MCP server (opens the cache DB and registers all tools). */
export function createServer(cfg: Config): McpServer {
  ensureDataDir(cfg)
  const db = openDb(cfg.dbPath)
  const ctx: ToolContext = { db, cfg }

  const server = new McpServer({ name: 'zen-money-mcp', version: '0.1.0' })
  registerSync(server, ctx)
  registerListCategories(server, ctx)
  registerFindTransactions(server, ctx)
  registerMerchantHistory(server, ctx)
  registerReviewExpenses(server, ctx)
  registerApplyCategories(server, ctx)
  return server
}

/** Run the MCP server over stdio. */
export async function serve(cfg: Config): Promise<void> {
  const server = createServer(cfg)
  await server.connect(new StdioServerTransport())
  console.error('zen-money-mcp running on stdio')
}
