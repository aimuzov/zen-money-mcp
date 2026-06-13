import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig redirect handling', () => {
  it('defaults to a /callback URI on port 53682', () => {
    const cfg = loadConfig({})
    expect(cfg.redirectPort).toBe(53682)
    expect(cfg.redirectUri).toBe('http://localhost:53682/callback')
  })

  it('honors ZEN_REDIRECT_PORT', () => {
    const cfg = loadConfig({ ZEN_REDIRECT_PORT: '3000' })
    expect(cfg.redirectPort).toBe(3000)
    expect(cfg.redirectUri).toBe('http://localhost:3000/callback')
  })

  it('uses ZEN_REDIRECT_URI verbatim and derives the port from it', () => {
    const cfg = loadConfig({ ZEN_REDIRECT_URI: 'http://localhost:3000' })
    expect(cfg.redirectUri).toBe('http://localhost:3000')
    expect(cfg.redirectPort).toBe(3000)
  })

  it('reads endpoint and credentials', () => {
    const cfg = loadConfig({
      ZEN_ENDPOINT: 'app',
      ZEN_CLIENT_ID: 'cid',
      ZEN_CLIENT_SECRET: 'secret',
    })
    expect(cfg.endpoint).toBe('app')
    expect(cfg.clientId).toBe('cid')
    expect(cfg.clientSecret).toBe('secret')
  })
})
