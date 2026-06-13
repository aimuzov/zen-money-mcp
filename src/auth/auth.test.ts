import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../config.js'
import { readToken, writeToken, type StoredToken } from './store.js'
import { getValidAccessToken, NotAuthenticatedError } from './index.js'

function tempConfig(): Config {
  const dir = mkdtempSync(join(tmpdir(), 'zen-auth-'))
  return {
    clientId: 'cid',
    clientSecret: 'secret',
    endpoint: 'ru',
    redirectPort: 53682,
    redirectUri: 'http://localhost:53682/callback',
    dataDir: dir,
    dbPath: join(dir, 'cache.sqlite'),
    authPath: join(dir, 'auth.json'),
  }
}

const baseToken: StoredToken = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_at: 10_000,
  endpoint: 'ru',
}

let cfg: Config

beforeEach(() => {
  cfg = tempConfig()
})

describe('token store', () => {
  it('round-trips a token and writes it with 0600 perms', () => {
    writeToken(cfg, baseToken)
    expect(readToken(cfg)).toEqual(baseToken)
    const mode = statSync(cfg.authPath).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('returns undefined when no token file exists', () => {
    expect(readToken(cfg)).toBeUndefined()
  })
})

describe('getValidAccessToken', () => {
  it('throws NotAuthenticatedError when there is no token', async () => {
    await expect(getValidAccessToken(cfg)).rejects.toBeInstanceOf(
      NotAuthenticatedError
    )
  })

  it('returns the current token while it is still valid', async () => {
    writeToken(cfg, baseToken)
    let called = false
    const fetchImpl = (async () => {
      called = true
      return { json: async () => ({}) }
    }) as unknown as typeof fetch

    const token = await getValidAccessToken(cfg, { now: 9_000, fetchImpl })
    expect(token).toBe('access-1')
    expect(called).toBe(false)
  })

  it('refreshes an expired token and persists the new one', async () => {
    writeToken(cfg, baseToken)
    let body: any
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string)
      return {
        json: async () => ({
          access_token: 'access-2',
          refresh_token: 'refresh-2',
          expires_in: 3600,
        }),
      }
    }) as unknown as typeof fetch

    const token = await getValidAccessToken(cfg, { now: 20_000, fetchImpl })

    expect(token).toBe('access-2')
    expect(body.grant_type).toBe('refresh_token')
    expect(body.refresh_token).toBe('refresh-1')
    expect(body.client_id).toBe('cid')

    const stored = readToken(cfg)!
    expect(stored.access_token).toBe('access-2')
    expect(stored.refresh_token).toBe('refresh-2')
    // now + expires_in - 60s skew
    expect(stored.expires_at).toBe(20_000 + 3600 - 60)
  })

  it('throws NotAuthenticatedError when refresh fails', async () => {
    writeToken(cfg, baseToken)
    const fetchImpl = (async () => ({
      json: async () => ({ error: 'invalid_grant' }),
    })) as unknown as typeof fetch

    await expect(
      getValidAccessToken(cfg, { now: 20_000, fetchImpl })
    ).rejects.toBeInstanceOf(NotAuthenticatedError)
  })
})
