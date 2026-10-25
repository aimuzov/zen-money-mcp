import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock } from 'node:test'
import { connectInMemory } from '@aimuzov/infra-mcp-kit/testing'

import type { ZmDiff } from '#zen/api/types'
import { writeToken } from '#zen/auth/store'
import type { Config } from '#zen/config'
import { createServer } from '#zen/mcp/server'
import { applyDiff } from '#zen/store/apply-diff'
import { openDb } from '#zen/store/db'

/** Конфиг с данными во временном каталоге: кэш и токен у каждого теста свои. */
export function tempConfig(overrides: Partial<Config> = {}): Config {
	const dir = mkdtempSync(join(tmpdir(), 'zen-test-'))

	return {
		clientId: 'cid',
		clientSecret: 'secret',
		endpoint: 'ru',
		redirectPort: 53682,
		redirectUri: 'http://localhost:53682/callback',
		dataDir: dir,
		dbPath: join(dir, 'cache.sqlite'),
		authPath: join(dir, 'auth.json'),
		...overrides,
	}
}

/** Положить diff в кэш до старта сервера, как после прошлой синхронизации. */
export function seedCache(cfg: Config, diff: ZmDiff): void {
	const db = openDb(cfg.dbPath)

	applyDiff(db, diff)
	db.close()
}

/** Токен, который ещё долго не истечёт: инструменты пойдут в сеть без refresh. */
export function writeValidToken(cfg: Config, accessToken = 'test-access'): void {
	writeToken(cfg, {
		access_token: accessToken,
		refresh_token: 'test-refresh',
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		endpoint: cfg.endpoint,
	})
}

export type FetchCall = { url: string; body: any; headers: Record<string, string> }

/**
 * Подменить глобальный fetch: инструменты MCP ходят в ZenMoney через него.
 * Возвращает журнал вызовов. Снимать подмену -- `mock.restoreAll()` в afterEach.
 */
export function mockFetch(respond: (call: FetchCall) => Response | Promise<Response>): FetchCall[] {
	const calls: FetchCall[] = []

	mock.method(globalThis, 'fetch', async (input: string | URL, init?: RequestInit) => {
		const call: FetchCall = {
			url: String(input),
			body: init?.body ? JSON.parse(init.body as string) : undefined,
			headers: (init?.headers ?? {}) as Record<string, string>,
		}

		calls.push(call)

		return respond(call)
	})

	return calls
}

/** Сеть запрещена: любой вызов fetch -- провал теста. */
export function forbidFetch(): FetchCall[] {
	return mockFetch((call) => {
		throw new Error(`unexpected fetch ${call.url}`)
	})
}

/** Клиент MCP к полностью собранному серверу с этим конфигом. */
export const connect = (cfg: Config) => connectInMemory(createServer(cfg))

/** Данные успешного ответа инструмента; падает, если пришла ошибка. */
export function dataOf(res: any): any {
	if (res.isError) throw new Error(`tool failed: ${res.content?.[0]?.text}`)

	return res.structuredContent
}
