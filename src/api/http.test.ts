import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bodySnippet, parseJsonObject } from './http.ts'

describe('bodySnippet', () => {
	it('схлопывает пробелы и переводы строк', () => {
		assert.equal(bodySnippet('  <html>\n\t<body>  oops </body>\n</html> '), '<html> <body> oops </body> </html>')
	})

	it('ровно 200 символов не обрезает, 201 -- обрезает с многоточием', () => {
		assert.equal(bodySnippet('a'.repeat(200)), 'a'.repeat(200))
		assert.equal(bodySnippet('a'.repeat(201)), `${'a'.repeat(200)}...`)
	})
})

describe('parseJsonObject', () => {
	it('объект возвращается', () => {
		assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 })
	})

	for (const text of ['', 'not json', '42', '"str"', 'null', 'true']) {
		it(`${JSON.stringify(text)} -- не объект`, () => {
			assert.equal(parseJsonObject(text), undefined)
		})
	}
})
