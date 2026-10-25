import { createHash } from 'node:crypto'

import type { StatementOp } from './ozon-statement.ts'

/**
 * Один и тот же ряд выписки всегда получает один id. Повтор импорта после сбоя
 * тогда обновляет уже записанную в ZenMoney операцию, а не создаёт дубль.
 * ZenMoney ждёт UUID, поэтому SHA-1 оформлен как UUID v5.
 */
export function importTransactionId(accountId: string, op: StatementOp, index: number): string {
	const name = [accountId, op.date, op.signed, op.documentId, index].join('|')
	const bytes = createHash('sha1').update(`zen-money-mcp:import:${name}`).digest().subarray(0, 16)

	bytes[6] = (bytes[6]! & 0x0f) | 0x50
	bytes[8] = (bytes[8]! & 0x3f) | 0x80

	const hex = bytes.toString('hex')

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
