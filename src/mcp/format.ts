import type { Db } from '#zen/store/db'
import { getInstrumentCode, getMerchantTitle, getTagPathMap, type TxRow } from '#zen/store/queries'

export type PresentedTx = {
	id: string
	date: string
	outcome: number
	income: number
	currency: string | null
	tag: string[] | null
	tagPath: string | null
	merchant: string | null
	merchantTitle: string | null
	payee: string | null
	mcc: number | null
	comment: string | null
}

/**
 * A per-call helper that resolves tag paths, currency codes and merchant titles
 * once and reuses them across rows. Keeps DB lookups out of the analytics layer.
 */
export class Presenter {
	private db: Db
	private tagPaths: Map<string, string>
	private currencyCache = new Map<number, string | null>()
	private merchantCache = new Map<string, string | null>()

	constructor(db: Db) {
		this.db = db
		this.tagPaths = getTagPathMap(db)
	}

	tagPath(tagId: string | null | undefined): string | null {
		return tagId ? (this.tagPaths.get(tagId) ?? tagId) : null
	}

	currency(instrumentId: number | null | undefined): string | null {
		if (instrumentId == null) return null

		if (!this.currencyCache.has(instrumentId)) {
			this.currencyCache.set(instrumentId, getInstrumentCode(this.db, instrumentId) ?? null)
		}

		return this.currencyCache.get(instrumentId) ?? null
	}

	merchantTitle(merchantId: string | null | undefined): string | null {
		if (!merchantId) return null

		if (!this.merchantCache.has(merchantId)) {
			this.merchantCache.set(merchantId, getMerchantTitle(this.db, merchantId) ?? null)
		}

		return this.merchantCache.get(merchantId) ?? null
	}

	present(tx: TxRow): PresentedTx {
		return {
			id: tx.id,
			date: tx.date,
			outcome: tx.outcome,
			income: tx.income,
			currency: this.currency(tx.outcomeInstrument ?? tx.incomeInstrument),
			tag: tx.tag,
			tagPath: this.tagPath(tx.tag0),
			merchant: tx.merchant,
			merchantTitle: this.merchantTitle(tx.merchant),
			payee: tx.payee,
			mcc: tx.mcc,
			comment: tx.comment,
		}
	}
}
