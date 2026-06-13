import { chmodSync, readFileSync, writeFileSync } from 'node:fs'
import { ensureDataDir, type Config } from '../config.js'
import type { EndpointPreference } from '../api/endpoints.js'

export interface StoredToken {
  access_token: string
  refresh_token: string
  /** Unix seconds after which the access token should be refreshed. */
  expires_at: number
  endpoint: EndpointPreference
}

/** Read the persisted token, or undefined if missing/unreadable. */
export function readToken(cfg: Config): StoredToken | undefined {
  try {
    return JSON.parse(readFileSync(cfg.authPath, 'utf8')) as StoredToken
  } catch {
    return undefined
  }
}

/** Persist the token with owner-only (0600) permissions. */
export function writeToken(cfg: Config, token: StoredToken): void {
  ensureDataDir(cfg)
  writeFileSync(cfg.authPath, JSON.stringify(token, null, 2), { mode: 0o600 })
  chmodSync(cfg.authPath, 0o600) // ensure perms even when overwriting
}
