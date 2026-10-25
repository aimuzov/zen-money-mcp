import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createServer, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, afterEach, before, describe, it, mock } from 'node:test'

import type { Config } from '#zen/config'
import { tempConfig } from '#zen/testing/mcp'

import { NotAuthenticatedError } from './errors.ts'
import { runAuthFlow, waitForAuthCode } from './flow.ts'
import { readToken } from './store.ts'

let busy: Server

before(async () => {
	busy = createServer()
	await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve))
})

after(() => {
	busy.close()
})

afterEach(() => {
	mock.restoreAll()
	mock.timers.reset()
})

/** Свободный порт на 127.0.0.1: занять ноль, узнать номер, отпустить. */
async function freePort(): Promise<number> {
	const probe = createServer()

	await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
	const { port } = probe.address() as AddressInfo

	await new Promise((resolve) => probe.close(resolve))

	return port
}

async function flowConfig(overrides: Partial<Config> = {}): Promise<Config> {
	const port = await freePort()

	return tempConfig({ redirectPort: port, redirectUri: `http://localhost:${port}/callback`, ...overrides })
}

/**
 * Браузер пользователя: стучится на колбэк, пока сервер не поднимется.
 * Ходит настоящим fetch, но только на 127.0.0.1.
 */
async function browserHits(cfg: Config, path: string): Promise<{ status: number; body: string }> {
	const url = `http://127.0.0.1:${cfg.redirectPort}${path}`

	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			// без keep-alive: иначе сокет держит процесс теста ещё несколько секунд
			const res = await fetch(url, { headers: { connection: 'close' } })

			return { status: res.status, body: await res.text() }
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 10))
		}
	}

	throw new Error(`callback server never came up on ${url}`)
}

/** Сервер токенов ZenMoney: отвечает `respond`, запросы складывает в журнал. */
function tokenEndpoint(respond: () => Response) {
	const calls: Array<{ url: string; body: any }> = []
	const fetchImpl = (async (url: string, init: RequestInit) => {
		calls.push({ url: String(url), body: JSON.parse(init.body as string) })

		return respond()
	}) as unknown as typeof fetch

	return { calls, fetchImpl }
}

const quiet = () => mock.method(console, 'error', () => {})

describe('waitForAuthCode', () => {
	it('занятый порт даёт понятную ошибку, а не uncaught exception', async () => {
		const port = (busy.address() as AddressInfo).port
		const cfg = {
			redirectPort: port,
			redirectUri: `http://localhost:${port}/callback`,
		} as Config

		await assert.rejects(waitForAuthCode(cfg), (err: Error) => {
			assert.match(err.message, new RegExp(`${port} is already in use`))
			assert.match(err.message, /ZEN_REDIRECT_PORT/)

			return true
		})
	})

	it('слушает только 127.0.0.1 на порту из конфига', async () => {
		const cfg = await flowConfig()
		const listen = mock.method(Server.prototype, 'listen')
		const code = waitForAuthCode(cfg)

		await browserHits(cfg, '/callback?code=abc')
		assert.equal(await code, 'abc')
		assert.deepEqual(listen.mock.calls[0]!.arguments, [cfg.redirectPort, '127.0.0.1'])
	})

	it('принимает код на любом пути и отвечает страницей успеха', async () => {
		const cfg = await flowConfig()
		const code = waitForAuthCode(cfg)
		const page = await browserHits(cfg, '/?code=xyz&state=1')

		assert.equal(await code, 'xyz')
		assert.equal(page.status, 200)
		assert.match(page.body, /Authorized/)
	})

	it('посторонние запросы (favicon) не завершают ожидание', async () => {
		const cfg = await flowConfig()
		const code = waitForAuthCode(cfg)
		const favicon = await browserHits(cfg, '/favicon.ico')

		assert.equal(favicon.status, 204)

		await browserHits(cfg, '/callback?code=late')
		assert.equal(await code, 'late')
	})

	it('отказ пользователя -- ошибка с кодом из редиректа и страница ошибки', async () => {
		const cfg = await flowConfig()
		const code = waitForAuthCode(cfg)

		code.catch(() => {})
		const page = await browserHits(cfg, '/callback?error=access_denied')

		assert.equal(page.status, 400)
		assert.match(page.body, /Authorization failed/)
		await assert.rejects(code, /^Error: Authorization failed: access_denied$/)
	})

	it('после ответа сервер закрывается и порт свободен', async () => {
		const cfg = await flowConfig()
		const code = waitForAuthCode(cfg)

		await browserHits(cfg, '/callback?code=abc')
		await code

		const again = createServer()

		await new Promise<void>((resolve, reject) => {
			again.once('error', reject)
			again.listen(cfg.redirectPort, '127.0.0.1', resolve)
		})

		again.close()
	})

	it('без ответа за 120 с -- таймаут', async () => {
		const cfg = await flowConfig()

		mock.timers.enable({ apis: ['setTimeout'] })
		const code = waitForAuthCode(cfg)

		mock.timers.tick(119_999)
		mock.timers.tick(1)
		await assert.rejects(code, /Timed out waiting for authorization \(120s\)/)
	})

	for (const [errno, message] of [
		['EACCES', /127\.0\.0\.1:\d+ is not allowed.*ZEN_REDIRECT_PORT.*ZEN_REDIRECT_URI/],
		['EADDRNOTAVAIL', /^Cannot start the OAuth callback server on 127\.0\.0\.1:\d+: boom$/],
	] as const) {
		it(`ошибка listen ${errno} объясняется`, async () => {
			const cfg = await flowConfig()

			mock.method(Server.prototype, 'listen', function (this: Server) {
				process.nextTick(() => this.emit('error', Object.assign(new Error('boom'), { code: errno })))

				return this
			})

			await assert.rejects(waitForAuthCode(cfg), (err: Error) => {
				assert.match(err.message, message)
				assert.equal((err.cause as NodeJS.ErrnoException).code, errno)

				return true
			})
		})
	}
})

describe('runAuthFlow', () => {
	it('открывает браузер, ловит код, меняет его на токен и сохраняет', async () => {
		quiet()
		const cfg = await flowConfig({ clientId: 'my id', clientSecret: 's3cret' })
		const { calls, fetchImpl } = tokenEndpoint(() =>
			Response.json({ access_token: 'acc', refresh_token: 'ref', expires_in: 7200 }),
		)
		let opened = ''
		let callback: Promise<unknown> = Promise.resolve()
		const openUrl = async (url: string) => {
			opened = url
			callback = browserHits(cfg, '/callback?code=the-code')
		}
		const before = Math.floor(Date.now() / 1000)
		const token = await runAuthFlow(cfg, { openUrl, fetchImpl })

		await callback

		const auth = new URL(opened)

		assert.equal(auth.origin + auth.pathname, 'https://api.zenmoney.ru/oauth2/authorize/')

		assert.deepEqual(Object.fromEntries(auth.searchParams), {
			response_type: 'code',
			client_id: 'my id',
			redirect_uri: cfg.redirectUri,
		})

		assert.equal(calls.length, 1)
		assert.equal(calls[0]!.url, 'https://api.zenmoney.ru/oauth2/token/')

		assert.deepEqual(calls[0]!.body, {
			grant_type: 'authorization_code',
			client_id: 'my id',
			client_secret: 's3cret',
			redirect_uri: cfg.redirectUri,
			code: 'the-code',
		})

		assert.deepEqual(readToken(cfg), token)
		assert.partialDeepStrictEqual(token, { access_token: 'acc', refresh_token: 'ref', endpoint: 'ru' })
		// expires_in минус минута запаса
		assert.ok(token.expires_at >= before + 7200 - 60 && token.expires_at <= before + 7200 - 59)
	})

	it('endpoint app: авторизация и обмен на zenmoney.app, дефолты срока и refresh', async () => {
		quiet()
		const cfg = await flowConfig({ endpoint: 'app' })
		const { calls, fetchImpl } = tokenEndpoint(() => Response.json({ access_token: 'acc' }))
		let opened = ''
		const before = Math.floor(Date.now() / 1000)
		const token = await runAuthFlow(cfg, {
			openUrl: async (url) => {
				opened = url
				void browserHits(cfg, '/callback?code=c')
			},
			fetchImpl,
		})

		assert.ok(opened.startsWith('https://api.zenmoney.app/oauth2/authorize/?'))
		assert.equal(calls[0]!.url, 'https://api.zenmoney.app/oauth2/token/')
		assert.equal(token.refresh_token, '')
		assert.equal(token.endpoint, 'app')
		assert.ok(token.expires_at >= before + 3600 - 60 && token.expires_at <= before + 3600 - 59)
	})

	it('браузер не открылся (headless) -- ссылка в stderr, поток продолжается', async () => {
		const stderr = quiet()
		const cfg = await flowConfig()
		const { fetchImpl } = tokenEndpoint(() => Response.json({ access_token: 'acc' }))
		const token = await runAuthFlow(cfg, {
			openUrl: async () => {
				void browserHits(cfg, '/callback?code=c')

				throw new Error('no display')
			},
			fetchImpl,
		})

		assert.equal(token.access_token, 'acc')
		const printed = stderr.mock.calls.map((c) => String(c.arguments[0])).join('\n')

		assert.match(printed, /If it does not open, visit:\nhttps:\/\/api\.zenmoney\.ru\/oauth2\/authorize\/\?/)
	})

	it('без ZEN_CLIENT_ID / ZEN_CLIENT_SECRET падает до открытия браузера', async () => {
		for (const missing of [{ clientId: '' }, { clientSecret: '' }]) {
			const cfg = await flowConfig(missing)
			const openUrl = mock.fn(async () => {})

			await assert.rejects(runAuthFlow(cfg, { openUrl }), /ZEN_CLIENT_ID \/ ZEN_CLIENT_SECRET/)
			assert.equal(openUrl.mock.callCount(), 0)
		}
	})

	it('отказ пользователя в браузере -- ошибка, токен не пишется, сеть не трогается', async () => {
		quiet()
		const cfg = await flowConfig()
		const { calls, fetchImpl } = tokenEndpoint(() => Response.json({ access_token: 'acc' }))

		await assert.rejects(
			runAuthFlow(cfg, {
				openUrl: async () => void browserHits(cfg, '/callback?error=access_denied'),
				fetchImpl,
			}),
			/Authorization failed: access_denied/,
		)

		assert.equal(calls.length, 0)
		assert.equal(existsSync(cfg.authPath), false)
	})

	const exchangeFailures: [string, () => Response, (err: Error) => boolean][] = [
		[
			'invalid_grant',
			() => Response.json({ error: 'invalid_grant' }, { status: 400 }),
			(err) => err instanceof NotAuthenticatedError && /Token exchange rejected \(HTTP 400/.test(err.message),
		],
		[
			'5xx',
			() => new Response('upstream down', { status: 503 }),
			(err) =>
				!(err instanceof NotAuthenticatedError) &&
				/^Token exchange failed: HTTP 503: upstream down$/.test(err.message),
		],
	]

	for (const [name, respond, check] of exchangeFailures) {
		it(`обмен кода не удался (${name}) -- ошибка со статусом, токен не пишется`, async () => {
			quiet()
			const cfg = await flowConfig()
			const { fetchImpl } = tokenEndpoint(respond)

			await assert.rejects(
				runAuthFlow(cfg, { openUrl: async () => void browserHits(cfg, '/callback?code=c'), fetchImpl }),
				check,
			)

			assert.equal(existsSync(cfg.authPath), false)
		})
	}

	it('занятый порт -- подсказка про ZEN_REDIRECT_PORT, обмена нет', async () => {
		quiet()
		const port = (busy.address() as AddressInfo).port
		const cfg = tempConfig({ redirectPort: port, redirectUri: `http://localhost:${port}/callback` })
		const { calls, fetchImpl } = tokenEndpoint(() => Response.json({ access_token: 'acc' }))

		await assert.rejects(runAuthFlow(cfg, { openUrl: async () => {}, fetchImpl }), /ZEN_REDIRECT_PORT/)
		assert.equal(calls.length, 0)
	})
})
