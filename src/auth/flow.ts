import { createServer } from 'node:http'
import open from 'open'

import { endpoints } from '#zen/api/endpoints'
import type { Config } from '#zen/config'

import { writeToken, type StoredToken } from './store.ts'
import { readTokenResponse } from './token-response.ts'

const CALLBACK_TIMEOUT_MS = 120_000

const SUCCESS_HTML = `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:4rem">
<h2>✓ Authorized</h2><p>You can close this tab and return to the terminal.</p></body></html>`

const ERROR_HTML = `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:4rem">
<h2>Authorization failed</h2><p>Check the terminal for details.</p></body></html>`

/** Wait for ZenMoney to redirect back with an authorization code. */
export function waitForAuthCode(cfg: Config): Promise<string> {
	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			const url = new URL(req.url ?? '/', cfg.redirectUri)
			const code = url.searchParams.get('code')
			const error = url.searchParams.get('error')

			// Accept the code on any path (the registered redirect may land on '/'),
			// and ignore unrelated requests like favicon.ico.
			if (!code && !error) {
				res.writeHead(204).end()

				return
			}

			res.writeHead(code ? 200 : 400, { 'Content-Type': 'text/html' })
			res.end(code ? SUCCESS_HTML : ERROR_HTML)
			server.close()
			clearTimeout(timer)

			if (code) resolve(code)
			else reject(new Error(`Authorization failed: ${error ?? 'no code returned'}`))
		})

		const timer = setTimeout(() => {
			server.close()
			reject(new Error('Timed out waiting for authorization (120s).'))
		}, CALLBACK_TIMEOUT_MS)

		// Без обработчика 'error' занятый порт роняет процесс uncaught exception.
		server.on('error', (err: NodeJS.ErrnoException) => {
			clearTimeout(timer)
			reject(listenError(cfg, err))
		})

		server.listen(cfg.redirectPort, '127.0.0.1')
	})
}

function listenError(cfg: Config, err: NodeJS.ErrnoException): Error {
	const where = `127.0.0.1:${cfg.redirectPort}`

	if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') {
		return new Error(`Cannot start the OAuth callback server on ${where}: ${err.message}`, { cause: err })
	}

	const reason = err.code === 'EADDRINUSE' ? 'is already in use' : 'is not allowed'

	return new Error(
		`OAuth callback port ${where} ${reason}. Free it or choose another one with ZEN_REDIRECT_PORT ` +
			'(or ZEN_REDIRECT_URI), and register the same redirect URI in the ZenMoney app.',
		{ cause: err },
	)
}

/** Exchange an authorization code for an access token. */
async function exchangeCode(cfg: Config, code: string): Promise<StoredToken> {
	const response = await fetch(endpoints[cfg.endpoint].token, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			grant_type: 'authorization_code',
			client_id: cfg.clientId,
			client_secret: cfg.clientSecret,
			redirect_uri: cfg.redirectUri,
			code,
		}),
	})
	const data = await readTokenResponse(response, 'Token exchange')

	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token ?? '',
		expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600) - 60,
		endpoint: cfg.endpoint,
	}
}

/**
 * Run the full interactive OAuth flow: open the browser, catch the redirect on
 * a local callback server, exchange the code, and persist the token.
 * Intended to be invoked once via `zen-money-mcp auth`.
 */
export async function runAuthFlow(cfg: Config): Promise<StoredToken> {
	if (!cfg.clientId || !cfg.clientSecret) {
		throw new Error(
			'Missing ZEN_CLIENT_ID / ZEN_CLIENT_SECRET. Register an app at https://developers.zenmoney.ru and set them in the environment.',
		)
	}

	const authUrl =
		`${endpoints[cfg.endpoint].auth}?response_type=code` +
		`&client_id=${encodeURIComponent(cfg.clientId)}` +
		`&redirect_uri=${encodeURIComponent(cfg.redirectUri)}`

	console.error(`Opening browser for ZenMoney authorization...`)
	console.error(`If it does not open, visit:\n${authUrl}\n`)

	await open(authUrl).catch(() => {
		/* headless: user uses the printed URL */
	})

	const code = await waitForAuthCode(cfg)
	const token = await exchangeCode(cfg, code)

	writeToken(cfg, token)
	console.error('✓ Authorized. Token saved.')

	return token
}
