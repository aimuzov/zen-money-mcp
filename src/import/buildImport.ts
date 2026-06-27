import type { Db } from '../store/db.js'
import type { ZmTransaction } from '../api/types.js'
import { findTransactions } from '../store/queries.js'
import type { StatementOp } from './ozonStatement.js'

export interface BuildImportInput {
  accountId: string
  instrument: number
  user: number
  now: number
  newId: () => string
}

export interface ImportPlan {
  create: ZmTransaction[]
  skippedDuplicates: StatementOp[]
  skippedRepayments: StatementOp[]
}

const round2 = (n: number): number => Math.round(n * 100) / 100
const key = (date: string, signed: number): string => `${date}|${signed}`

/**
 * Decide which statement operations are missing from the cache and turn them
 * into ZenMoney transactions. Deduplicates against existing account transactions
 * by (date, signed amount) as a multiset; repayments are never created.
 */
export function buildImportPlan(
  db: Db,
  ops: StatementOp[],
  input: BuildImportInput
): ImportPlan {
  const existing = findTransactions(db, { account: input.accountId })

  // Multiset of existing (date, signed) keys + payee -> merchant reuse map.
  const seen = new Map<string, number>()
  const payeeMerchant = new Map<string, string>()
  for (const tx of existing) {
    const signed = tx.income > 0 ? round2(tx.income) : round2(-tx.outcome)
    const k = key(tx.date, signed)
    seen.set(k, (seen.get(k) ?? 0) + 1)
    if (tx.payee && tx.merchant && !payeeMerchant.has(tx.payee)) {
      payeeMerchant.set(tx.payee, tx.merchant)
    }
  }

  const plan: ImportPlan = {
    create: [],
    skippedDuplicates: [],
    skippedRepayments: [],
  }

  for (const op of ops) {
    if (op.kind === 'repayment') {
      plan.skippedRepayments.push(op)
      continue
    }
    const k = key(op.date, op.signed)
    const remaining = seen.get(k) ?? 0
    if (remaining > 0) {
      seen.set(k, remaining - 1)
      plan.skippedDuplicates.push(op)
      continue
    }
    plan.create.push(toTransaction(op, input, payeeMerchant))
  }

  return plan
}

function toTransaction(
  op: StatementOp,
  input: BuildImportInput,
  payeeMerchant: Map<string, string>
): ZmTransaction {
  const moneyIn = op.signed > 0
  const bankID = `[ozon-stmt]-${op.documentId}`
  const merchant = op.payee ? (payeeMerchant.get(op.payee) ?? null) : null

  return {
    id: input.newId(),
    user: input.user,
    date: op.date,
    changed: input.now,
    created: input.now,
    deleted: false,
    hold: false,
    viewed: false,
    qrCode: null,
    income: moneyIn ? op.amount : 0,
    outcome: moneyIn ? 0 : op.amount,
    incomeInstrument: input.instrument,
    outcomeInstrument: input.instrument,
    incomeAccount: input.accountId,
    outcomeAccount: input.accountId,
    incomeBankID: moneyIn ? bankID : null,
    outcomeBankID: moneyIn ? null : bankID,
    tag: null,
    merchant,
    payee: op.payee,
    originalPayee: op.payee,
    comment: op.comment,
    mcc: null,
    reminderMarker: null,
    opIncome: null,
    opIncomeInstrument: null,
    opOutcome: null,
    opOutcomeInstrument: null,
    latitude: null,
    longitude: null,
  }
}
