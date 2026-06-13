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

  const { redirectUri, redirectPort } = resolveRedirect(env)

  const dataDir =
    env.ZEN_DATA_DIR?.trim() || join(homedir(), '.config', 'zen-money-mcp')

  return {
    clientId: env.ZEN_CLIENT_ID?.trim() ?? '',
    clientSecret: env.ZEN_CLIENT_SECRET?.trim() ?? '',
    endpoint,
    redirectPort,
    redirectUri,
    dataDir,
    dbPath: join(dataDir, 'cache.sqlite'),
    authPath: join(dataDir, 'auth.json'),
  }
}

/**
 * Resolve the OAuth redirect. ZEN_REDIRECT_URI, when set, is used verbatim and
 * must exactly match the URI registered for the OAuth app (the local callback
 * server listens on its port). Otherwise we build http://localhost:<port>/callback.
 */
function resolveRedirect(env: Env): { redirectUri: string; redirectPort: number } {
  const override = env.ZEN_REDIRECT_URI?.trim()
  if (override) {
    const url = new URL(override)
    const port =
      Number.parseInt(url.port, 10) ||
      (url.protocol === 'https:' ? 443 : 80)
    return { redirectUri: override, redirectPort: port }
  }
  const redirectPort =
    Number.parseInt(env.ZEN_REDIRECT_PORT ?? '', 10) || DEFAULT_REDIRECT_PORT
  return {
    redirectUri: `http://localhost:${redirectPort}/callback`,
    redirectPort,
  }
}

/** Create the data directory if it does not exist. Call before writing files. */
export function ensureDataDir(cfg: Config): void {
  mkdirSync(cfg.dataDir, { recursive: true })
}
