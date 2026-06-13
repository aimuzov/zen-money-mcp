import { describe, it, expect } from 'vitest'
import { normalizePayee, resolveGroupKey } from './grouping.js'
import { makeRow } from '../testing/fixtures.js'

describe('normalizePayee', () => {
  it('lowercases, trims and collapses internal whitespace', () => {
    expect(normalizePayee('  ПЯТЁРОЧКА  ')).toBe('пятёрочка')
    expect(normalizePayee('MAGNIT   MM')).toBe('magnit mm')
  })

  it('strips a trailing space-separated store/terminal number', () => {
    expect(normalizePayee('Пятёрочка 1234')).toBe('пятёрочка')
    expect(normalizePayee('Coffee #42')).toBe('coffee')
  })

  it('strips multiple trailing number groups', () => {
    expect(normalizePayee('Shop 12 34')).toBe('shop')
  })

  it('does not strip digits glued to a word', () => {
    expect(normalizePayee('store5')).toBe('store5')
  })

  it('returns empty string for blank input', () => {
    expect(normalizePayee('')).toBe('')
    expect(normalizePayee('   ')).toBe('')
  })
})

describe('resolveGroupKey', () => {
  it('prefers merchant', () => {
    const row = makeRow({ merchant: 'm1', payeeNorm: 'shop', mcc: 5411 })
    expect(resolveGroupKey(row)).toEqual({ kind: 'merchant', value: 'm1' })
  })

  it('falls back to normalized payee', () => {
    const row = makeRow({ merchant: null, payeeNorm: 'пятёрочка', mcc: 5411 })
    expect(resolveGroupKey(row)).toEqual({ kind: 'payee', value: 'пятёрочка' })
  })

  it('falls back to mcc', () => {
    const row = makeRow({ merchant: null, payeeNorm: null, mcc: 5411 })
    expect(resolveGroupKey(row)).toEqual({ kind: 'mcc', value: '5411' })
  })

  it('returns null when nothing identifies the place', () => {
    const row = makeRow({ merchant: null, payeeNorm: null, mcc: null })
    expect(resolveGroupKey(row)).toBeNull()
  })
})
