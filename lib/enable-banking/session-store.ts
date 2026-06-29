import { prisma } from '@/lib/prisma'

export interface BankTestSession {
  id: string
  account_uid: string
  valid_until: Date
  created_at: Date
}

export async function saveBankTestSession(
  accountUid: string,
  validUntil: Date
): Promise<BankTestSession> {
  await prisma.$executeRaw`DELETE FROM bank_connections`

  const rows = await prisma.$queryRaw<
    { id: string; account_uid: string; valid_until: Date; created_at: Date }[]
  >`
    INSERT INTO bank_connections (account_uid, valid_until)
    VALUES (${accountUid}, ${validUntil})
    RETURNING id, account_uid, valid_until, created_at
  `

  const row = rows[0]
  if (!row) throw new Error('No se pudo guardar la conexión bancaria')

  return row
}

export async function getLatestBankTestSession(): Promise<BankTestSession | null> {
  const rows = await prisma.$queryRaw<
    { id: string; account_uid: string; valid_until: Date; created_at: Date }[]
  >`
    SELECT id, account_uid, valid_until, created_at
    FROM bank_connections
    ORDER BY created_at DESC
    LIMIT 1
  `

  const row = rows[0]
  if (!row) return null

  const validUntil =
    row.valid_until instanceof Date ? row.valid_until : new Date(row.valid_until)
  if (validUntil.getTime() <= Date.now()) return null

  return {
    ...row,
    valid_until: validUntil,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }
}

export async function getLatestAccountUid(): Promise<string | null> {
  const session = await getLatestBankTestSession()
  return session?.account_uid ?? null
}
