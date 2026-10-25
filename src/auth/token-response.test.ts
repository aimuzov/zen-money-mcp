import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { NotAuthenticatedError } from './errors.ts'
import { readTokenResponse } from './token-response.ts'

const read = (response: Response) => readTokenResponse(response, 'Token refresh')

const reauth = (pattern: RegExp) => (err: Error) => {
	assert.ok(err instanceof NotAuthenticatedError, `ждали NotAuthenticatedError, а пришло ${err.name}`)
	assert.match(err.message, pattern)
	assert.match(err.message, /Run `zen-money-mcp auth` again/)

	return true
}

const transient = (pattern: RegExp) => (err: Error) => {
	assert.ok(!(err instanceof NotAuthenticatedError), `временный сбой не должен требовать входа: ${err.message}`)
	assert.match(err.message, pattern)

	return true
}

describe('readTokenResponse', () => {
	it('успешный ответ отдаётся как есть', async () => {
		const data = await read(Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 60 }))

		assert.deepEqual(data, { access_token: 'a', refresh_token: 'r', expires_in: 60 })
	})

	it('401 просит войти заново и сохраняет статус и тело', async () => {
		await assert.rejects(
			read(new Response('token revoked', { status: 401 })),
			reauth(/^Token refresh rejected \(HTTP 401: token revoked\)/),
		)
	})

	it('invalid_grant просит войти заново при любом статусе', async () => {
		for (const status of [200, 400, 403]) {
			await assert.rejects(
				read(Response.json({ error: 'invalid_grant' }, { status })),
				reauth(new RegExp(`HTTP ${status}: \\{"error":"invalid_grant"\\}`)),
			)
		}
	})

	it('403 без invalid_grant -- не просьба войти, а ошибка со статусом', async () => {
		await assert.rejects(
			read(new Response('forbidden by WAF', { status: 403 })),
			transient(/^Token refresh failed: HTTP 403: forbidden by WAF$/),
		)
	})

	it('400 без invalid_grant -- не просьба войти, а ошибка со статусом', async () => {
		await assert.rejects(
			read(Response.json({ error: 'invalid_client' }, { status: 400 })),
			transient(/^Token refresh failed: HTTP 400: .*invalid_client/),
		)
	})

	it('пустой access_token -- временный сбой', async () => {
		await assert.rejects(read(Response.json({ access_token: '' })), transient(/HTTP 200/))
	})

	it('длинное тело обрезается до 200 символов с многоточием', async () => {
		const body = `<html>${'x'.repeat(500)}</html>`

		await assert.rejects(read(new Response(body, { status: 502 })), (err: Error) => {
			const snippet = err.message.split('HTTP 502: ')[1]!

			assert.equal(snippet, `${body.slice(0, 200)}...`)

			return true
		})
	})
})
