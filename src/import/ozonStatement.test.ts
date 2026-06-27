import { describe, it, expect } from 'vitest'
import { parseOzonStatement } from './ozonStatement.js'

// Flat text in the shape pdfjs produces after items.join(' ') + whitespace
// collapse. Mirrors the real Ozon-bank statement layout (data anonymised).
const PURCHASE =
  '25.06.2026 18:13:50 11430204419 Оплата товаров по кредитной карте 2296 ' +
  'сумма 129.98 в KRASNOE I BELOE Moscow RU дата 2026- 06-25 время 18:13:50 ' +
  '- 129.98 ₽ - 129.98 ₽'

const OZON_ORDER =
  '20.06.2026 13:45:19 11312870163 Оплата товаров/услуг на Платформе Ozon, ' +
  'заказ № 1629682992. Без НДС. - 1 608.00 ₽ - 1 608.00 ₽'

const REFUND_PLACE =
  '17.06.2026 14:38:12 11244708121 Возврат оплаты товаров по кредитной карте ' +
  '2296 сумма 620.00 в DUT MOSCOW Moscow RU дата 2026- 06-17 время 14:38:12 ' +
  '+ 620.00 ₽ + 620.00 ₽'

const REFUND_OZON =
  '31.05.2026 09:59:46 10861559599 Возврат оплаты за товары/услуги, купленные ' +
  'на Платформе Ozon, заказ № 71424366-0269. Без НДС. + 1 504.00 ₽ + 1 504.00 ₽'

const REPAYMENT =
  '25.06.2026 07:34:34 11413668483 Погашение кредита по договору №2026-01-01- ' +
  'KK-0000000000000000000 0, Иванов Иван Иванович + 3 000.00 ₽ + 3 000.00 ₽'

describe('parseOzonStatement', () => {
  it('parses a card purchase: ISO date, document, negative amount, place payee', () => {
    const [op] = parseOzonStatement(PURCHASE)
    expect(op).toMatchObject({
      date: '2026-06-25',
      documentId: '11430204419',
      signed: -129.98,
      amount: 129.98,
      kind: 'purchase',
      payee: 'KRASNOE I BELOE Moscow RU',
      comment: null,
    })
  })

  it('parses an Ozon platform order: payee Ozon, order number in comment', () => {
    const [op] = parseOzonStatement(OZON_ORDER)
    expect(op).toMatchObject({
      date: '2026-06-20',
      signed: -1608,
      kind: 'purchase',
      payee: 'Ozon',
      comment: 'заказ № 1629682992',
    })
  })

  it('parses a refund with a place as positive refund', () => {
    const [op] = parseOzonStatement(REFUND_PLACE)
    expect(op).toMatchObject({
      date: '2026-06-17',
      signed: 620,
      kind: 'refund',
      payee: 'DUT MOSCOW Moscow RU',
    })
  })

  it('parses an Ozon refund: payee Ozon, refund kind', () => {
    const [op] = parseOzonStatement(REFUND_OZON)
    expect(op).toMatchObject({
      signed: 1504,
      kind: 'refund',
      payee: 'Ozon',
      comment: 'заказ № 71424366-0269',
    })
  })

  it('parses a credit repayment as repayment with no payee', () => {
    const [op] = parseOzonStatement(REPAYMENT)
    expect(op).toMatchObject({
      date: '2026-06-25',
      signed: 3000,
      kind: 'repayment',
      payee: null,
    })
  })

  it('parses a whole statement preserving order', () => {
    const text = [PURCHASE, OZON_ORDER, REFUND_PLACE, REPAYMENT].join(' ')
    const ops = parseOzonStatement(text)
    expect(ops).toHaveLength(4)
    expect(ops.map(o => o.kind)).toEqual([
      'purchase',
      'purchase',
      'refund',
      'repayment',
    ])
    expect(ops.map(o => o.documentId)).toEqual([
      '11430204419',
      '11312870163',
      '11244708121',
      '11413668483',
    ])
  })

  it('labels an SBP QR transfer as a spend with a meaningful payee', () => {
    const sbp =
      '16.06.2026 16:29:48 7719056469 Перевод № AD00000000000000000 ' +
      'XXXXXXXXXXXX через QR СБП. Договор №2026-01-01- KK-0000000000000000000 ' +
      '0, Иванова Анна Ивановна. Без НДС. - 572.00 ₽ - 572.00 ₽'
    const [op] = parseOzonStatement(sbp)
    expect(op).toMatchObject({
      date: '2026-06-16',
      signed: -572,
      kind: 'purchase',
      payee: 'Перевод по СБП',
      comment: '№ AD00000000000000000 XXXXXXXXXXXX',
    })
  })

  it('reassembles a document number split by a line break', () => {
    const split =
      '05.06.2026 11:25:56 1097264665 4 Оплата товаров по кредитной карте 2296 ' +
      'сумма 900.00 в FERMA дата 2026- 06-05 время 11:25:56 - 900.00 ₽ - 900.00 ₽'
    const [op] = parseOzonStatement(split)
    expect(op.documentId).toBe('10972646654')
    expect(op.signed).toBe(-900)
    expect(op.payee).toBe('FERMA')
  })
})
