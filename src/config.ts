import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { str, type Env } from '@aimuzov/infra-mcp-kit'

import type { EndpointPreference } from './api/endpoints.ts'

export type Config = {
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

const DEFAULT_REDIRECT_PORT = 53682

/** Build a typed Config from environment variables. Pure: no IO. */
export function loadConfig(env: Env = process.env): Config {
	const endpoint = readEndpoint(env)

	const { redirectUri, redirectPort } = resolveRedirect(env)

	const dataDir = str(env, 'ZEN_DATA_DIR') || join(homedir(), '.config', 'zen-money-mcp')

	return {
		clientId: str(env, 'ZEN_CLIENT_ID'),
		clientSecret: str(env, 'ZEN_CLIENT_SECRET'),
		endpoint,
		redirectPort,
		redirectUri,
		dataDir,
		dbPath: join(dataDir, 'cache.sqlite'),
		authPath: join(dataDir, 'auth.json'),
	}
}

function readEndpoint(env: Env): EndpointPreference {
	const value = str(env, 'ZEN_ENDPOINT').toLowerCase()

	if (!value) return 'ru'

	if (value === 'ru' || value === 'app') return value

	throw new Error(`ZEN_ENDPOINT must be ru or app, got: ${env.ZEN_ENDPOINT}`)
}

/** Пустое значение даёт fallback, мусор и порт вне 1..65535 -- ошибка. */
function readPort(env: Env, name: string, fallback: number): number {
	const value = str(env, name)

	if (!value) return fallback

	const port = Number(value)

	if (!/^\d+$/.test(value) || port < 1 || port > 65_535) {
		throw new Error(`${name} must be a port number 1-65535, got: ${value}`)
	}

	return port
}

/**
 * Resolve the OAuth redirect. ZEN_REDIRECT_URI, when set, is used verbatim and
 * must exactly match the URI registered for the OAuth app (the local callback
 * server listens on its port). Otherwise we build http://localhost:<port>/callback.
 */
function resolveRedirect(env: Env): { redirectUri: string; redirectPort: number } {
	const override = str(env, 'ZEN_REDIRECT_URI')

	if (override) {
		const url = URL.parse(override)

		if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
			throw new Error(`ZEN_REDIRECT_URI must be an absolute http(s) URL, got: ${override}`)
		}

		const port = Number.parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80)

		return { redirectUri: override, redirectPort: port }
	}

	const redirectPort = readPort(env, 'ZEN_REDIRECT_PORT', DEFAULT_REDIRECT_PORT)

	return {
		redirectUri: `http://localhost:${redirectPort}/callback`,
		redirectPort,
	}
}

/** Create the data directory if it does not exist. Call before writing files. */
export function ensureDataDir(cfg: Config): void {
	mkdirSync(cfg.dataDir, { recursive: true })
}
