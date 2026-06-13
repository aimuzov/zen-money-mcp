import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { EndpointPreference } from './api/endpoints.js'

export interface Config {
  /** OAuth client id (from developers.zenmoney.ru). Empty until configured. */
  clientId: string
  /** OAuth client secret. Empty until configured. */
  clientSecret: string
  /** Which ZenMoney server to use. */
  endpoint: EndpointPreference
  /** Local port for the OAuth callback. */
  redirectPort: number
  /** Redirect URI registered for the OAuth app. */
  redirectUri: string
  /** Directory holding the cache DB and the auth token. */
  dataDir: string
  /** Path to the SQLite cache file. */
  dbPath: string
  /** Path to the persisted OAuth token. */
  authPath: string
}

type Env = Record<string, string | undefined>

const DEFAULT_REDIRECT_PORT = 53682

/** Build a typed Config from environment variables. Pure: no IO. */
export function loadConfig(env: Env = process.env): Config {
  const endpoint: EndpointPreference = env.ZEN_ENDPOINT === 'app' ? 'app' : 'ru'

  const redirectPort =
    Number.parseInt(env.ZEN_REDIRECT_PORT ?? '', 10) || DEFAULT_REDIRECT_PORT

  const dataDir =
    env.ZEN_DATA_DIR?.trim() || join(homedir(), '.config', 'zen-money-mcp')

  return {
    clientId: env.ZEN_CLIENT_ID?.trim() ?? '',
    clientSecret: env.ZEN_CLIENT_SECRET?.trim() ?? '',
    endpoint,
    redirectPort,
    redirectUri: `http://localhost:${redirectPort}/callback`,
    dataDir,
    dbPath: join(dataDir, 'cache.sqlite'),
    authPath: join(dataDir, 'auth.json'),
  }
}

/** Create the data directory if it does not exist. Call before writing files. */
export function ensureDataDir(cfg: Config): void {
  mkdirSync(cfg.dataDir, { recursive: true })
}
