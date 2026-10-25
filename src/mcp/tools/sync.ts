import { failure, json } from '@aimuzov/infra-mcp-kit'
import type { McpServer } from '@aimuzov/infra-mcp-kit'
import { z } from 'zod'

import { getValidAccessToken, NotAuthenticatedError } from '#zen/auth/index'
import type { ToolContext } from '#zen/mcp/context'
import { getMeta } from '#zen/store/db'
import { countTransactions } from '#zen/store/queries'
import { sync } from '#zen/store/sync'

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
				if (err instanceof NotAuthenticatedError) return failure(err.message)

				throw err
			}

			const result = await sync(ctx.db, token, ctx.cfg.endpoint, {
				full: args.full,
			})

			return json({
				...result,
				lastSyncAt: Number(getMeta(ctx.db, 'lastSyncAt') ?? 0),
				totalTransactions: countTransactions(ctx.db),
			})
		},
	)
}
