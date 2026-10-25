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

describe('loadConfig: проверка переменных окружения', () => {
	it('пустые значения дают дефолты', () => {
		const cfg = loadConfig({ ZEN_ENDPOINT: ' ', ZEN_REDIRECT_PORT: '', ZEN_REDIRECT_URI: '' })

		assert.equal(cfg.endpoint, 'ru')
		assert.equal(cfg.redirectPort, 53682)
	})

	it('ZEN_ENDPOINT принимается без учёта регистра', () => {
		assert.equal(loadConfig({ ZEN_ENDPOINT: 'App' }).endpoint, 'app')
	})

	it('мусор в ZEN_ENDPOINT даёт ошибку с именем переменной', () => {
		assert.throws(() => loadConfig({ ZEN_ENDPOINT: 'eu' }), /ZEN_ENDPOINT.*eu/)
	})

	for (const value of ['abc', '3000abc', '0', '70000', '-1']) {
		it(`ZEN_REDIRECT_PORT=${value} даёт ошибку с именем переменной`, () => {
			assert.throws(() => loadConfig({ ZEN_REDIRECT_PORT: value }), /ZEN_REDIRECT_PORT/)
		})
	}

	for (const value of ['not a url', 'localhost:3000', 'ftp://localhost/cb']) {
		it(`ZEN_REDIRECT_URI=${value} даёт ошибку с именем переменной`, () => {
			assert.throws(() => loadConfig({ ZEN_REDIRECT_URI: value }), /ZEN_REDIRECT_URI/)
		})
	}
})

describe('loadConfig: порт из ZEN_REDIRECT_URI и каталог данных', () => {
	it('без порта в URI берётся порт схемы', () => {
		assert.equal(loadConfig({ ZEN_REDIRECT_URI: 'https://example.test/cb' }).redirectPort, 443)
		assert.equal(loadConfig({ ZEN_REDIRECT_URI: 'http://127.0.0.1/cb' }).redirectPort, 80)
	})

	it('ZEN_REDIRECT_URI главнее ZEN_REDIRECT_PORT', () => {
		const cfg = loadConfig({ ZEN_REDIRECT_URI: 'http://localhost:4000/cb', ZEN_REDIRECT_PORT: '5000' })

		assert.equal(cfg.redirectPort, 4000)
	})

	it('ZEN_DATA_DIR задаёт пути кэша и токена', () => {
		const cfg = loadConfig({ ZEN_DATA_DIR: '/data/zen' })

		assert.equal(cfg.dataDir, '/data/zen')
		assert.equal(cfg.dbPath, '/data/zen/cache.sqlite')
		assert.equal(cfg.authPath, '/data/zen/auth.json')
	})
})
