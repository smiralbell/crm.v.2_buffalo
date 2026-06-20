import { randomUUID } from 'crypto'

export interface BankTestSession {
  id: string
  account_uid: string
  created_at: Date
}

/** Almacén en memoria — solo para pruebas; se pierde al reiniciar el servidor. */
let latestSession: BankTestSession | null = null

export function saveBankTestSession(accountUid: string): BankTestSession {
  latestSession = {
    id: randomUUID(),
    account_uid: accountUid,
    created_at: new Date(),
  }
  return latestSession
}

export function getLatestBankTestSession(): BankTestSession | null {
  return latestSession
}

export function getLatestAccountUid(): string | null {
  return latestSession?.account_uid ?? null
}
