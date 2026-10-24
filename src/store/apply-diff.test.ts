import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'

import { AccountType, DataEntity, type ZmDiff, type ZmTransaction } from '#zen/api/types'

import { applyDiff } from './apply-diff.ts'
import { getMeta, openDb, type Db } from './db.ts'

function makeTx(partial: Partial<ZmTransaction>): ZmTransaction {
	return {
		id: 'tx',
		changed: 1000,
		created: 1000,
		user: 1,
		deleted: false,
		hold: null,
		qrCode: null,
		incomeBankID: null,
		incomeInstrument: 2,
		incomeAccount: 'acc',
		income: 0,
		outcomeBankID: null,
		outcomeInstrument: 2,
		outcomeAccount: 'acc',
		outcome: 0,
		tag: null,
		merchant: null,
		payee: null,
		originalPayee: null,
		comment: null,
		date: '2026-01-01',
		mcc: null,
		reminderMarker: null,
		opIncome: null,
		opIncomeInstrument: null,
		opOutcome: null,
		opOutcomeInstrument: null,
		latitude: null,
		longitude: null,
		...partial,
	}
}

const baseDiff: ZmDiff = {
	serverTimestamp: 5000,
	instrument: [{ id: 2, changed: 1, title: 'Ruble', shortTitle: 'RUB', symbol: '₽', rate: 1 }],
	account: [
		{
			id: 'acc',
			changed: 1,
			user: 1,
			instrument: 2,
			title: 'Card',
			role: null,
			company: null,
			type: AccountType.Ccard,
			syncID: null,
			balance: 0,
			startBalance: 0,
			creditLimit: 0,
			inBalance: true,
			savings: false,
			enableCorrection: false,
			enableSMS: false,
			archive: false,
			private: false,
			capitalization: null,
			percent: null,
			startDate: null,
			endDateOffset: null,
			endDateOffsetInterval: null,
			payoffStep: null,
			payoffInterval: null,
		},
	],
	tag: [
		{
			id: 'tag-groceries',
			changed: 1,
			user: 1,
			title: 'Groceries',
			parent: null,
			icon: null,
			staticId: null,
			picture: null,
			color: null,
			showIncome: false,
			showOutcome: true,
			budgetIncome: false,
			budgetOutcome: true,
			required: null,
		},
	],
	merchant: [{ id: 'm1', changed: 1, user: 1, title: 'Пятёрочка 1234' }],
	transaction: [
		makeTx({
			id: 'tx-cat',
			outcome: 500,
			tag: ['tag-groceries'],
			merchant: 'm1',
			payee: 'Пятёрочка 1234',
		}),
		makeTx({ id: 'tx-uncat', outcome: 99, tag: null, payee: 'Kiosk' }),
	],
}

let db: Db

beforeEach(() => {
	db = openDb(':memory:')
})

describe('applyDiff', () => {
	it('upserts entities and advances the server timestamp', () => {
		const result = applyDiff(db, baseDiff)

		assert.equal(result.serverTimestamp, 5000)
		assert.equal(getMeta(db, 'serverTimestamp'), '5000')

		const count = db.prepare('select count(*) as n from "transaction"').get() as { n: number }

		assert.equal(count.n, 2)
	})

	it('derives tag0, tag_json and payee_norm for transactions', () => {
		applyDiff(db, baseDiff)

		const cat = db.prepare('select tag0, tag_json, payee_norm from "transaction" where id = ?').get('tx-cat') as {
			tag0: string
			tag_json: string
			payee_norm: string
		}

		assert.equal(cat.tag0, 'tag-groceries')
		assert.deepEqual(JSON.parse(cat.tag_json), ['tag-groceries'])
		assert.equal(cat.payee_norm, 'пятёрочка')

		const uncat = db.prepare('select tag0, tag_json from "transaction" where id = ?').get('tx-uncat') as {
			tag0: string | null
			tag_json: string | null
		}

		assert.equal(uncat.tag0, null)
		assert.equal(uncat.tag_json, null)
	})

	it('is idempotent when the same diff is applied twice', () => {
		applyDiff(db, baseDiff)
		applyDiff(db, baseDiff)

		const count = db.prepare('select count(*) as n from "transaction"').get() as { n: number }

		assert.equal(count.n, 2)
		assert.equal(getMeta(db, 'serverTimestamp'), '5000')
	})

	it('soft-deletes transactions but hard-deletes reference entities via deletion[]', () => {
		applyDiff(db, baseDiff)

		const result = applyDiff(db, {
			serverTimestamp: 6000,
			deletion: [
				{ id: 'tx-uncat', object: DataEntity.Transaction, stamp: 5500, user: 1 },
				{ id: 'tag-groceries', object: DataEntity.Tag, stamp: 5500, user: 1 },
			],
		})

		assert.equal(result.deletions, 2)
		assert.equal(result.serverTimestamp, 6000)

		const tx = db.prepare('select deleted from "transaction" where id = ?').get('tx-uncat') as { deleted: number }

		assert.equal(tx.deleted, 1)

		const tag = db.prepare('select * from tag where id = ?').get('tag-groceries')

		assert.equal(tag, undefined)
	})

	it('binds missing optional fields as null (real payloads omit them)', () => {
		// Real ZenMoney transactions omit absent optional fields entirely, so they
		// arrive as `undefined` rather than `null` — node:sqlite rejects undefined.
		const sparse = {
			id: 'sparse',
			date: '2026-01-01',
			income: 0,
			outcome: 100,
			incomeInstrument: 2,
			outcomeInstrument: 2,
			incomeAccount: 'acc',
			outcomeAccount: 'acc',
			changed: 1,
			created: 1,
			deleted: false,
			// mcc, merchant, payee, originalPayee, comment, tag, hold all undefined
		} as unknown as ZmTransaction

		assert.doesNotThrow(() => applyDiff(db, { serverTimestamp: 10, transaction: [sparse] }))

		const row = db
			.prepare('select mcc, merchant, payee, comment, tag0 from "transaction" where id = ?')
			.get('sparse') as Record<string, unknown>

		assert.equal(row.mcc, null)
		assert.equal(row.merchant, null)
		assert.equal(row.comment, null)
	})

	it('updates existing transactions on re-upsert', () => {
		applyDiff(db, baseDiff)

		applyDiff(db, {
			serverTimestamp: 7000,
			transaction: [makeTx({ id: 'tx-cat', outcome: 750, tag: ['tag-x'] })],
		})

		const tx = db.prepare('select outcome, tag0 from "transaction" where id = ?').get('tx-cat') as {
			outcome: number
			tag0: string
		}

		assert.equal(tx.outcome, 750)
		assert.equal(tx.tag0, 'tag-x')
	})
})
