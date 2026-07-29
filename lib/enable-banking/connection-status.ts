import { getLatestBankTestSession } from './session-store'

export interface BankConnectionStatus {
  connected: boolean
  account_uid: string | null
  valid_until: string | null
  days_remaining: number | null
  expires_soon: boolean
  last_synced_at: string | null
}

export function daysUntil(validUntil: Date): number {
  const ms = validUntil.getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

export async function getBankConnectionStatus(): Promise<BankConnectionStatus> {
  const session = await getLatestBankTestSession()
  if (!session) {
    return {
      connected: false,
      account_uid: null,
      valid_until: null,
      days_remaining: null,
      expires_soon: false,
      last_synced_at: null,
    }
  }

  const remaining = daysUntil(session.valid_until)

  return {
    connected: true,
    account_uid: session.account_uid,
    valid_until: session.valid_until.toISOString(),
    days_remaining: remaining,
    expires_soon: remaining <= 5,
    last_synced_at: session.last_synced_at
      ? session.last_synced_at.toISOString()
      : null,
  }
}
