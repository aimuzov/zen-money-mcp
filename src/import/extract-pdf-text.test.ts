import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { joinPdfItems } from './extract-pdf-text.ts'

describe('joinPdfItems', () => {
	it('joins items within and across pages with spaces', () => {
		const text = joinPdfItems([
			[{ str: '25.06.2026 18:13:50' }, { str: ' ' }, { str: '11430204419' }],
			[{ str: 'Оплата товаров' }, { str: 'по карте' }],
		])

		assert.equal(text, '25.06.2026 18:13:50   11430204419 Оплата товаров по карте')
	})

	it('returns an empty string for no pages', () => {
		assert.equal(joinPdfItems([]), '')
	})
})
