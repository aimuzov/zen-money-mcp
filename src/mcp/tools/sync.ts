import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { sync } from '../../store/sync.js'
import { getMeta } from '../../store/db.js'
import { countTransactions } from '../../store/queries.js'
import { getValidAccessToken, NotAuthenticatedError } from '../../auth/index.js'
import { jsonResult, errorResult } from '../format.js'
import type { ToolContext } from '../context.js'

export function registerSync(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    'zen_sync',
    {
      title: 'Sync cache',
      description:
        'Pull the latest data from ZenMoney into the local cache. Run this before ' +
        'auditing if the data may be stale. full:true re-fetches the entire history.',
      inputSchema: {
        full: z.boolean().optional().describe('Re-fetch everything from scratch'),
      },
    },
    async (args: { full?: boolean }) => {
      let token: string
      try {
        token = await getValidAccessToken(ctx.cfg)
      } catch (err) {
        if (err instanceof NotAuthenticatedError) return errorResult(err.message)
        throw err
      }
      const result = await sync(ctx.db, token, ctx.cfg.endpoint, {
        full: args.full,
      })
      return jsonResult({
        ...result,
        lastSyncAt: Number(getMeta(ctx.db, 'lastSyncAt') ?? 0),
        totalTransactions: countTransactions(ctx.db),
      })
    }
  )
}
