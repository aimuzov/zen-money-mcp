#!/usr/bin/env node
import 'dotenv/config'
import { ensureDataDir, loadConfig } from './config.js'
import { serve } from './mcp/server.js'
import { runAuthFlow } from './auth/flow.js'
import { getValidAccessToken } from './auth/index.js'
import { openDb } from './store/db.js'
import { sync } from './store/sync.js'

async function main() {
  const cfg = loadConfig()
  const cmd = process.argv[2]

  switch (cmd) {
    case 'auth':
      await runAuthFlow(cfg)
      return

    case 'sync': {
      ensureDataDir(cfg)
      const db = openDb(cfg.dbPath)
      const token = await getValidAccessToken(cfg)
      const result = await sync(db, token, cfg.endpoint, {
        full: process.argv.includes('--full'),
      })
      console.error(
        `Synced: +${result.added} entities, ${result.deletions} deletions, serverTimestamp ${result.to}`
      )
      return
    }

    case undefined:
    case 'serve':
      await serve(cfg)
      return

    default:
      console.error(`Unknown command: ${cmd}`)
      console.error('Usage: zen-money-mcp [serve|auth|sync]')
      process.exit(1)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
