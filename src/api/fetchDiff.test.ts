import { describe, it, expect } from 'vitest'
import { fetchDiff } from './fetchDiff.js'

describe('fetchDiff', () => {
  it('rejects when token is empty', async () => {
    await expect(
      fetchDiff('', 'ru', { serverTimestamp: 0 })
    ).rejects.toThrow(/token/i)
  })

  it('POSTs to the diff endpoint with auth header and currentClientTimestamp', async () => {
    let captured: { url: string; init: RequestInit } | undefined
    const fakeFetch = async (url: string | URL, init?: RequestInit) => {
      captured = { url: String(url), init: init! }
      return { json: async () => ({ serverTimestamp: 123, transaction: [] }) }
    }

    const result = await fetchDiff(
      'my-token',
      'ru',
      { serverTimestamp: 42 },
      fakeFetch as unknown as typeof fetch
    )

    expect(captured!.url).toBe('https://api.zenmoney.ru/v8/diff/')
    expect(captured!.init.method).toBe('POST')
    const headers = captured!.init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-token')
    expect(headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(captured!.init.body as string)
    expect(body.serverTimestamp).toBe(42)
    expect(typeof body.currentClientTimestamp).toBe('number')
    expect(body.currentClientTimestamp).toBeGreaterThan(0)

    expect(result.serverTimestamp).toBe(123)
  })

  it('throws when the server returns an error field', async () => {
    const fakeFetch = async () => ({
      json: async () => ({ error: { code: 'bad', message: 'nope' } }),
    })

    await expect(
      fetchDiff(
        'my-token',
        'app',
        { serverTimestamp: 0 },
        fakeFetch as unknown as typeof fetch
      )
    ).rejects.toThrow(/nope|bad|error/i)
  })
})
