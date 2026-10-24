import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { loadConfig } from './config.ts'

describe('loadConfig redirect handling', () => {
	it('defaults to a /callback URI on port 53682', () => {
		const cfg = loadConfig({})

		assert.equal(cfg.redirectPort, 53682)
		assert.equal(cfg.redirectUri, 'http://localhost:53682/callback')
	})

	it('honors ZEN_REDIRECT_PORT', () => {
		const cfg = loadConfig({ ZEN_REDIRECT_PORT: '3000' })

		assert.equal(cfg.redirectPort, 3000)
		assert.equal(cfg.redirectUri, 'http://localhost:3000/callback')
	})

	it('uses ZEN_REDIRECT_URI verbatim and derives the port from it', () => {
		const cfg = loadConfig({ ZEN_REDIRECT_URI: 'http://localhost:3000' })

		assert.equal(cfg.redirectUri, 'http://localhost:3000')
		assert.equal(cfg.redirectPort, 3000)
	})

	it('reads endpoint and credentials', () => {
		const cfg = loadConfig({
			ZEN_ENDPOINT: 'app',
			ZEN_CLIENT_ID: 'cid',
			ZEN_CLIENT_SECRET: 'secret',
		})

		assert.equal(cfg.endpoint, 'app')
		assert.equal(cfg.clientId, 'cid')
		assert.equal(cfg.clientSecret, 'secret')
	})
})
