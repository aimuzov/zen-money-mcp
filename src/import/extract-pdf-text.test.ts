import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { makePdf } from '#zen/testing/pdf'

import { extractPdfText, joinPdfItems } from './extract-pdf-text.ts'

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

describe('extractPdfText', () => {
	it('достаёт кириллицу и знак рубля со всех страниц по порядку', async () => {
		const pdf = makePdf([['Оплата товаров', '- 129.98 ₽'], ['Вторая страница']])

		assert.equal(await extractPdfText(pdf), 'Оплата товаров - 129.98 ₽ Вторая страница')
	})

	it('страница без текста даёт пустую строку', async () => {
		assert.equal((await extractPdfText(makePdf([[]]))).trim(), '')
	})

	it('не-PDF отвергается ошибкой, а не пустым текстом', async () => {
		await assert.rejects(extractPdfText(new TextEncoder().encode('date,amount\n2026-06-01,100\n')))
	})
})
