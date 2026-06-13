// Raw ZenMoney API entity types, ported from zerro's data-entities.ts.
//
// Difference from zerro: ZenMoney sends all timestamps as Unix SECONDS. zerro
// converts them to milliseconds client-side and keeps two parallel type sets
// (`TZm*` for the wire, `T*` for the client). We have no browser/Redux layer,
// so we keep a SINGLE representation in Unix seconds end-to-end. These `Zm*`
// types describe exactly what travels over the wire.

export type UnixTime = number // seconds since epoch
export type ISODate = string // 'YYYY-MM-DD'
export type Units = number // amount in the account's own currency units

export type InstrumentId = number
export type CountryId = number
export type CompanyId = number
export type UserId = number
export type AccountId = string
export type MerchantId = string
export type TagId = string
export type TransactionId = string
export type ReminderId = string
export type ReminderMarkerId = string

export enum DataEntity {
  Instrument = 'instrument',
  Country = 'country',
  Company = 'company',
  User = 'user',
  Account = 'account',
  Merchant = 'merchant',
  Tag = 'tag',
  Budget = 'budget',
  Reminder = 'reminder',
  ReminderMarker = 'reminderMarker',
  Transaction = 'transaction',
}

export type ZmInstrument = {
  id: InstrumentId
  changed: UnixTime
  title: string
  shortTitle: string // e.g. 'RUB', 'USD'
  symbol: string
  rate: number
}

export type ZmCountry = {
  id: CountryId
  title: string
  currency: InstrumentId
  domain: string | null
}

export type ZmCompany = {
  id: CompanyId
  changed: UnixTime
  title: string
  fullTitle: string | null
  www: string | null
  country: CountryId | null
  countryCode: string | null
  deleted: boolean
}

export type ZmUser = {
  id: UserId
  changed: UnixTime
  currency: InstrumentId
  parent: UserId | null
  country: CountryId
  countryCode: string
  email: string | null
  login: string | null
  monthStartDay: number
  isForecastEnabled: boolean
  planBalanceMode: string
  planSettings: string
  paidTill: UnixTime
  subscription: string
  subscriptionRenewalDate: unknown | null
}

export enum AccountType {
  Cash = 'cash',
  Ccard = 'ccard',
  Checking = 'checking',
  Loan = 'loan',
  Deposit = 'deposit',
  Emoney = 'emoney',
  Debt = 'debt',
}

export type ZmAccount = {
  id: AccountId
  changed: UnixTime
  user: UserId
  instrument: InstrumentId
  title: string
  role: number | null
  company: CompanyId | null
  type: AccountType
  syncID: string[] | null
  balance: Units
  startBalance: Units
  creditLimit: Units
  inBalance: boolean
  savings: boolean
  enableCorrection: boolean
  enableSMS: boolean
  archive: boolean
  private: boolean
  capitalization: boolean | null
  percent: number | null
  startDate: ISODate | null
  endDateOffset: number | null
  endDateOffsetInterval: 'day' | 'week' | 'month' | 'year' | null
  payoffStep: number | null
  payoffInterval: 'month' | 'year' | null
}

export type ZmMerchant = {
  id: MerchantId
  changed: UnixTime
  user: UserId
  title: string
}

export type ZmTag = {
  id: TagId
  changed: UnixTime
  user: UserId
  title: string
  parent: TagId | null
  icon: string | null
  staticId: string | null
  picture: string | null
  color: number | null
  showIncome: boolean
  showOutcome: boolean
  budgetIncome: boolean
  budgetOutcome: boolean
  required: boolean | null
}

export const globalBudgetTagId = '00000000-0000-0000-0000-000000000000'

export type ZmBudget = {
  changed: UnixTime
  user: UserId
  tag: TagId | typeof globalBudgetTagId | null
  date: ISODate
  income: Units
  incomeLock: boolean
  outcome: Units
  outcomeLock: boolean
}

export type ZmReminder = {
  id: ReminderId
  changed: UnixTime
  user: UserId
  incomeInstrument: InstrumentId
  incomeAccount: string
  income: Units
  outcomeInstrument: InstrumentId
  outcomeAccount: string
  outcome: Units
  tag: TagId[] | null
  merchant: MerchantId | null
  payee: string | null
  comment: string | null
  interval: 'day' | 'week' | 'month' | 'year' | null
  step: number | null
  points: number[] | null
  startDate: ISODate
  endDate: ISODate
  notify: boolean
}

export type ZmReminderMarker = {
  id: ReminderMarkerId
  changed: UnixTime
  user: UserId
  incomeInstrument: InstrumentId
  incomeAccount: AccountId
  income: Units
  outcomeInstrument: InstrumentId
  outcomeAccount: AccountId
  outcome: Units
  tag: TagId[] | null
  merchant: MerchantId | null
  payee: string | null
  comment: string | null
  date: ISODate
  reminder: ReminderId
  state: 'planned' | 'processed' | 'deleted'
  notify: boolean
}

export type ZmTransaction = {
  id: TransactionId
  changed: UnixTime
  created: UnixTime
  user: UserId
  deleted: boolean
  hold: boolean | null
  viewed?: boolean
  qrCode: string | null
  incomeBankID: CompanyId | null
  incomeInstrument: InstrumentId
  incomeAccount: AccountId
  income: Units
  outcomeBankID: CompanyId | null
  outcomeInstrument: InstrumentId
  outcomeAccount: AccountId
  outcome: Units
  tag: TagId[] | null // the CATEGORY (array; null = uncategorized)
  merchant: MerchantId | null
  payee: string | null
  originalPayee: string | null
  comment: string | null
  date: ISODate
  mcc: number | null
  reminderMarker: ReminderMarkerId | null
  opIncome: Units | null
  opIncomeInstrument: InstrumentId | null
  opOutcome: Units | null
  opOutcomeInstrument: InstrumentId | null
  latitude: number | null
  longitude: number | null
}

export type ZmDeletion = {
  id: string | number
  object: DataEntity
  stamp: UnixTime
  user: UserId
}

/** A diff as returned by the server (or sent to push changes). */
export type ZmDiff = {
  serverTimestamp: UnixTime
  deletion?: ZmDeletion[]
  instrument?: ZmInstrument[]
  country?: ZmCountry[]
  company?: ZmCompany[]
  user?: ZmUser[]
  merchant?: ZmMerchant[]
  account?: ZmAccount[]
  tag?: ZmTag[]
  budget?: ZmBudget[]
  reminder?: ZmReminder[]
  reminderMarker?: ZmReminderMarker[]
  transaction?: ZmTransaction[]
}

/** The body POSTed to /v8/diff/. */
export type ZmDiffRequest = ZmDiff & {
  currentClientTimestamp: UnixTime
  forceFetch?: DataEntity[]
}
