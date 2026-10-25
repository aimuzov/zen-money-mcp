import { AccountType, type ZmTransaction } from '#zen/api/types'
import type { TxRow } from '#zen/store/queries'

/** Build a TxRow (the camelCase domain row analytics consume). */
export function makeRow(partial: Partial<TxRow>): TxRow {
	return {
		id: 'r',
		date: '2026-01-01',
		income: 0,
		outcome: 0,
		incomeAccount: 'acc',
		outcomeAccount: 'acc',
		incomeInstrument: 2,
		outcomeInstrument: 2,
		tag0: null,
		tag: null,
		merchant: null,
		payee: null,
		payeeNorm: null,
		originalPayee: null,
		mcc: null,
		comment: null,
		deleted: false,
		changed: 1000,
		created: 1000,
		...partial,
	}
}

/** Build a full ZmTransaction with sensible defaults; override via `partial`. */
export function makeTx(partial: Partial<ZmTransaction>): ZmTransaction {
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

export const RUB = {
	id: 2,
	changed: 1,
	title: 'Ruble',
	shortTitle: 'RUB',
	symbol: '₽',
	rate: 1,
}

export const cardAccount = {
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
}

/** Build a ZmTag with defaults. */
export function makeTag(
	id: string,
	title: string,
	extra: Partial<{
		parent: string | null
		showIncome: boolean
		showOutcome: boolean
	}> = {},
) {
	return {
		id,
		changed: 1,
		user: 1,
		title,
		parent: extra.parent ?? null,
		icon: null,
		staticId: null,
		picture: null,
		color: null,
		showIncome: extra.showIncome ?? false,
		showOutcome: extra.showOutcome ?? true,
		budgetIncome: false,
		budgetOutcome: true,
		required: null,
	}
}
