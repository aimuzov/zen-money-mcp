import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { Config } from '../config.js'
import { openDb } from '../store/db.js'
import { applyDiff } from '../store/applyDiff.js'
import { createServer } from './server.js'
import { makeTx, makeTag, RUB, cardAccount } from '../testing/fixtures.js'

function seededConfig(): Config {
  const dir = mkdtempSync(join(tmpdir(), 'zen-mcp-'))
  const cfg: Config = {
    clientId: '',
    clientSecret: '',
    endpoint: 'ru',
    redirectPort: 53682,
    redirectUri: 'http://localhost:53682/callback',
    dataDir: dir,
    dbPath: join(dir, 'cache.sqlite'),
    authPath: join(dir, 'auth.json'),
  }
  const seed = openDb(cfg.dbPath)
  applyDiff(seed, {
    serverTimestamp: 1,
    instrument: [RUB],
    account: [cardAccount],
    tag: [makeTag('groceries', 'Groceries'), makeTag('beer', 'Beer')],
    merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка' }],
    transaction: [
      ...Array.from({ length: 8 }, (_, i) =>
        makeTx({ id: `g${i}`, date: `2026-05-0${i + 1}`, outcome: 500, tag: ['groceries'], merchant: 'm1' })
      ),
      makeTx({ id: 'bad', date: '2026-05-20', outcome: 480, tag: ['beer'], merchant: 'm1' }),
    ],
  })
  seed.close()
  return cfg
}

async function connect(cfg: Config) {
  const server = createServer(cfg)
  const client = new Client({ name: 'test', version: '0.0.0' })
  const [clientT, serverT] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverT), client.connect(clientT)])
  return client
}

let cfg: Config

beforeEach(() => {
  cfg = seededConfig()
})

describe('MCP server (end to end)', () => {
  it('registers all tools', async () => {
    const client = await connect(cfg)
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name).sort()).toEqual([
      'zen_apply_categories',
      'zen_find_transactions',
      'zen_import_statement',
      'zen_list_categories',
      'zen_merchant_history',
      'zen_review_expenses',
      'zen_sync',
    ])
  })

  it('serves zen_list_categories with structured content', async () => {
    const client = await connect(cfg)
    const res: any = await client.callTool({
      name: 'zen_list_categories',
      arguments: {},
    })
    expect(res.isError).toBeFalsy()
    const data = res.structuredContent ?? JSON.parse(res.content[0].text)
    expect(data.categories.map((c: any) => c.id).sort()).toEqual([
      'beer',
      'groceries',
    ])
  })

  it('audits expenses and flags the miscategorized one', async () => {
    const client = await connect(cfg)
    const res: any = await client.callTool({
      name: 'zen_review_expenses',
      arguments: { from: '2026-05-01', to: '2026-05-31' },
    })
    const data = res.structuredContent ?? JSON.parse(res.content[0].text)
    const bad = data.expenses.find((e: any) => e.transactionId === 'bad')
    expect(bad.status).toBe('likely_miscategorized')
    expect(bad.candidates[0].tagPath).toBe('Groceries')
  })

  it('previews category changes by default (dry run)', async () => {
    const client = await connect(cfg)
    const res: any = await client.callTool({
      name: 'zen_apply_categories',
      arguments: { changes: [{ transactionId: 'bad', tagId: 'groceries' }] },
    })
    const data = res.structuredContent ?? JSON.parse(res.content[0].text)
    expect(data.dryRun).toBe(true)
    expect(data.preview[0].after.tagPath).toBe('Groceries')
  })

  it('returns a friendly error from zen_sync when not authenticated', async () => {
    const client = await connect(cfg)
    const res: any = await client.callTool({
      name: 'zen_sync',
      arguments: {},
    })
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/auth/i)
  })
})
