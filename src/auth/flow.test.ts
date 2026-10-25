import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, describe, it } from 'node:test'

import type { Config } from '#zen/config'

import { waitForAuthCode } from './flow.ts'

let busy: Server

before(async () => {
	busy = createServer()
	await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve))
})

after(() => {
	busy.close()
})

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
})
