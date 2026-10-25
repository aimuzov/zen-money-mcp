export type StatementOpKind = 'purchase' | 'refund' | 'repayment'

export type StatementOp = {
	/** ISO date (YYYY-MM-DD). */
	date: string
	/** Bank document number from the statement. */
	documentId: string
	/** Signed amount: positive = money in, negative = money out. */
	signed: number
	/** Absolute amount. */
	amount: number
	kind: StatementOpKind
	/** Place / counterparty text, or null when not applicable. */
	payee: string | null
	comment: string | null
}

const OP_RE =
	/(\d{2})\.(\d{2})\.(\d{4}) \d{2}:\d{2}:\d{2} ([\d ]+?) ([А-ЯЁA-Z].*?)(?=\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}:\d{2} [\d ]|$)/g
const AMOUNT_RE = /([+-])\s*([\d.,\s  ]+?)\s*₽/g
const OZON_ORDER_RE = /на Платформе Ozon,\s*заказ № ([^.]+?)\./
const PLACE_RE = /сумма [\d.,\s  ]+ в (.+?) дата /
const SBP_RE = /Перевод № (.+?) через .{0,20}?СБП/

function parseAmount(raw: string): number {
	const n = Number(raw.replace(/[\s  ]/g, '').replace(',', '.'))

	return Math.round(n * 100) / 100
}

function classify(body: string): StatementOpKind {
	if (/Погашение кредита/.test(body)) return 'repayment'

	if (/Возврат/.test(body)) return 'refund'

	return 'purchase'
}

function describePlace(body: string): Pick<StatementOp, 'payee' | 'comment'> {
	const ozon = body.match(OZON_ORDER_RE)

	if (ozon) return { payee: 'Ozon', comment: `заказ № ${ozon[1]!.trim()}` }

	const place = body.match(PLACE_RE)

	if (place) return { payee: place[1]!.trim(), comment: null }

	const sbp = body.match(SBP_RE)

	if (sbp) return { payee: 'Перевод по СБП', comment: `№ ${sbp[1]!.trim()}` }

	return { payee: null, comment: null }
}

export function parseOzonStatement(text: string): StatementOp[] {
	const flat = text.replace(/\s+/g, ' ').trim()
	const ops: StatementOp[] = []

	for (const m of flat.matchAll(OP_RE)) {
		// Every group of OP_RE is mandatory, so a match always has all five.
		const [, dd, mm, yyyy, docRaw, body] = m as unknown as [string, string, string, string, string, string]

		const amounts = [...body.matchAll(AMOUNT_RE)]
		const last = amounts.at(-1)

		if (!last) continue

		const amount = parseAmount(last[2]!)
		const signed = last[1] === '+' ? amount : -amount

		ops.push({
			date: `${yyyy}-${mm}-${dd}`,
			documentId: docRaw.replace(/\D/g, ''),
			signed,
			amount,
			kind: classify(body),
			...describePlace(body),
		})
	}

	return ops
}
