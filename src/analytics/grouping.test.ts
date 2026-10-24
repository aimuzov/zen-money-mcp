import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { makeRow } from '#zen/testing/fixtures'

import { normalizePayee, resolveGroupKey } from './grouping.ts'

describe('normalizePayee', () => {
	it('lowercases, trims and collapses internal whitespace', () => {
		assert.equal(normalizePayee('  ПЯТЁРОЧКА  '), 'пятёрочка')
		assert.equal(normalizePayee('MAGNIT   MM'), 'magnit mm')
	})

	it('strips a trailing space-separated store/terminal number', () => {
		assert.equal(normalizePayee('Пятёрочка 1234'), 'пятёрочка')
		assert.equal(normalizePayee('Coffee #42'), 'coffee')
	})

	it('strips multiple trailing number groups', () => {
		assert.equal(normalizePayee('Shop 12 34'), 'shop')
	})

	it('does not strip digits glued to a word', () => {
		assert.equal(normalizePayee('store5'), 'store5')
	})

	it('returns empty string for blank input', () => {
		assert.equal(normalizePayee(''), '')
		assert.equal(normalizePayee('   '), '')
	})
})

describe('resolveGroupKey', () => {
	it('prefers merchant', () => {
		const row = makeRow({ merchant: 'm1', payeeNorm: 'shop', mcc: 5411 })

		assert.deepEqual(resolveGroupKey(row), { kind: 'merchant', value: 'm1' })
	})

	it('falls back to normalized payee', () => {
		const row = makeRow({ merchant: null, payeeNorm: 'пятёрочка', mcc: 5411 })

		assert.deepEqual(resolveGroupKey(row), { kind: 'payee', value: 'пятёрочка' })
	})

	it('falls back to mcc', () => {
		const row = makeRow({ merchant: null, payeeNorm: null, mcc: 5411 })

		assert.deepEqual(resolveGroupKey(row), { kind: 'mcc', value: '5411' })
	})

	it('returns null when nothing identifies the place', () => {
		const row = makeRow({ merchant: null, payeeNorm: null, mcc: null })

		assert.equal(resolveGroupKey(row), null)
	})
})
