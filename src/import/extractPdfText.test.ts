import { describe, it, expect } from 'vitest'
import { joinPdfItems } from './extractPdfText.js'

describe('joinPdfItems', () => {
  it('joins items within and across pages with spaces', () => {
    const text = joinPdfItems([
      [{ str: '25.06.2026 18:13:50' }, { str: ' ' }, { str: '11430204419' }],
      [{ str: 'Оплата товаров' }, { str: 'по карте' }],
    ])
    expect(text).toBe('25.06.2026 18:13:50   11430204419 Оплата товаров по карте')
  })

  it('returns an empty string for no pages', () => {
    expect(joinPdfItems([])).toBe('')
  })
})
