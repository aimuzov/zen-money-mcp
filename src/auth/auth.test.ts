import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, it } from 'node:test'

import type { Config } from '#zen/config'

import { getValidAccessToken, NotAuthenticatedError } from './index.ts'
import { readToken, writeToken, type StoredToken } from './store.ts'

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
		assert.deepEqual(readToken(cfg), baseToken)
		const mode = statSync(cfg.authPath).mode & 0o777

		assert.equal(mode, 0o600)
	})

	it('returns undefined when no token file exists', () => {
		assert.equal(readToken(cfg), undefined)
	})
})

describe('getValidAccessToken', () => {
	it('throws NotAuthenticatedError when there is no token', async () => {
		await assert.rejects(getValidAccessToken(cfg), NotAuthenticatedError)
	})

	it('returns the current token while it is still valid', async () => {
		writeToken(cfg, baseToken)
		let called = false
		const fetchImpl = (async () => {
			called = true

			return { json: async () => ({}) }
		}) as unknown as typeof fetch

		const token = await getValidAccessToken(cfg, { now: 9_000, fetchImpl })

		assert.equal(token, 'access-1')
		assert.equal(called, false)
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

		assert.equal(token, 'access-2')
		assert.equal(body.grant_type, 'refresh_token')
		assert.equal(body.refresh_token, 'refresh-1')
		assert.equal(body.client_id, 'cid')

		const stored = readToken(cfg)!

		assert.equal(stored.access_token, 'access-2')
		assert.equal(stored.refresh_token, 'refresh-2')
		// now + expires_in - 60s skew
		assert.equal(stored.expires_at, 20_000 + 3600 - 60)
	})

	it('throws NotAuthenticatedError when refresh fails', async () => {
		writeToken(cfg, baseToken)
		const fetchImpl = (async () => ({
			json: async () => ({ error: 'invalid_grant' }),
		})) as unknown as typeof fetch

		await assert.rejects(getValidAccessToken(cfg, { now: 20_000, fetchImpl }), NotAuthenticatedError)
	})
})
