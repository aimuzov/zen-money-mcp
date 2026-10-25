#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { loadEnvFile, readVersion, runCli } from '@aimuzov/infra-mcp-kit'

import { runAuthFlow } from './auth/flow.ts'
import { getValidAccessToken } from './auth/index.ts'
import { ensureDataDir, loadConfig } from './config.ts'
import { createServer } from './mcp/server.ts'
import { openDb } from './store/db.ts'
import { sync } from './store/sync.ts'

// Load .env from the package root, not the cwd: MCP hosts launch the server from anywhere.
// Both src/ and build/ sit one level below the root.
loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))

await runCli({
	name: 'zen-money-mcp',
	version: readVersion(import.meta.url),
	usage: `Usage: zen-money-mcp [serve|auth|sync [--full]|--help|--version]

  serve   run the MCP server over stdio (default)
  auth    sign in to ZenMoney in the browser and save the token
  sync    pull changes from ZenMoney into the local cache, --full refetches everything

Environment:
  ZEN_CLIENT_ID, ZEN_CLIENT_SECRET  OAuth app from developers.zenmoney.ru
  ZEN_ENDPOINT                      ru (default) or app
  ZEN_REDIRECT_PORT                 OAuth callback port, default 53682
  ZEN_REDIRECT_URI                  full callback URI when the app registers another one
  ZEN_DATA_DIR                      cache and token, default ~/.config/zen-money-mcp`,
	stdio: () => createServer(loadConfig()),
	commands: {
		auth: async () => {
			await runAuthFlow(loadConfig())
		},
		sync: async (args) => {
			const cfg = loadConfig()

			ensureDataDir(cfg)

			const db = openDb(cfg.dbPath)
			const token = await getValidAccessToken(cfg)
			const result = await sync(db, token, cfg.endpoint, { full: args.includes('--full') })

			console.error(
				`Synced: +${result.added} entities, ${result.deletions} deletions, serverTimestamp ${result.to}`,
			)
		},
	},
})
