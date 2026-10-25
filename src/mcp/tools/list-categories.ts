import { json } from '@aimuzov/infra-mcp-kit'
import type { McpServer } from '@aimuzov/infra-mcp-kit'
import { z } from 'zod'

import type { ToolContext } from '#zen/mcp/context'
import { getTagTree, type TagKind, type TagNode } from '#zen/store/queries'

type FlatTag = {
	id: string
	title: string
	parent: string | null
	path: string
	depth: number
	showIncome: boolean
	showOutcome: boolean
}

function flatten(nodes: TagNode[], depth = 0, acc: FlatTag[] = []): FlatTag[] {
	for (const n of nodes) {
		acc.push({
			id: n.id,
			title: n.title,
			parent: n.parent,
			path: n.path,
			depth,
			showIncome: n.showIncome,
			showOutcome: n.showOutcome,
		})

		flatten(n.children, depth + 1, acc)
	}

	return acc
}

export function registerListCategories(server: McpServer, ctx: ToolContext) {
	server.registerTool(
		'zen_list_categories',
		{
			title: 'List categories',
			description:
				'The category (tag) vocabulary with hierarchy and human-readable paths. ' +
				'Use the ids when proposing category changes.',
			inputSchema: {
				kind: z
					.enum(['outcome', 'income', 'all'])
					.optional()
					.describe('Filter by category kind (default outcome)'),
			},
		},
		async (args: { kind?: TagKind }) => {
			const tree = getTagTree(ctx.db, args.kind ?? 'outcome')

			return json({ categories: flatten(tree) })
		},
	)
}
