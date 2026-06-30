import { prisma } from '@/lib/prisma'

export interface BankTestSession {
  id: string
  account_uid: string
  account_uids: string[]
  valid_until: Date
  created_at: Date
}

function parseAccountUids(primary: string, raw: string | null | undefined): string[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
      }
    } catch {
      // columna account_uids puede no existir aún
    }
  }
  return [primary]
}

export async function saveBankTestSession(
  accountUids: string | string[],
  validUntil: Date
): Promise<BankTestSession> {
  const uids = (Array.isArray(accountUids) ? accountUids : [accountUids]).filter(Boolean)
  const primary = uids[0]
  if (!primary) throw new Error('No hay cuentas bancarias en la sesión')

  await prisma.$executeRaw`DELETE FROM bank_connections`

  try {
    const rows = await prisma.$queryRaw<
      { id: string; account_uid: string; account_uids: string | null; valid_until: Date; created_at: Date }[]
    >`
      INSERT INTO bank_connections (account_uid, account_uids, valid_until)
      VALUES (${primary}, ${JSON.stringify(uids)}, ${validUntil})
      RETURNING id, account_uid, account_uids, valid_until, created_at
    `
    const row = rows[0]
    if (!row) throw new Error('No se pudo guardar la conexión bancaria')
    return {
      id: row.id,
      account_uid: row.account_uid,
      account_uids: parseAccountUids(row.account_uid, row.account_uids),
      valid_until: row.valid_until instanceof Date ? row.valid_until : new Date(row.valid_until),
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    }
  } catch {
    const rows = await prisma.$queryRaw<
      { id: string; account_uid: string; valid_until: Date; created_at: Date }[]
    >`
      INSERT INTO bank_connections (account_uid, valid_until)
      VALUES (${primary}, ${validUntil})
      RETURNING id, account_uid, valid_until, created_at
    `
    const row = rows[0]
    if (!row) throw new Error('No se pudo guardar la conexión bancaria')
    return {
      id: row.id,
      account_uid: row.account_uid,
      account_uids: uids,
      valid_until: row.valid_until instanceof Date ? row.valid_until : new Date(row.valid_until),
      created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    }
  }
}

export async function getLatestBankTestSession(): Promise<BankTestSession | null> {
  let rows: Array<{
    id: string
    account_uid: string
    account_uids?: string | null
    valid_until: Date
    created_at: Date
  }>

  try {
    rows = await prisma.$queryRaw`
      SELECT id, account_uid, account_uids, valid_until, created_at
      FROM bank_connections
      ORDER BY created_at DESC
      LIMIT 1
    `
  } catch {
    rows = await prisma.$queryRaw`
      SELECT id, account_uid, valid_until, created_at
      FROM bank_connections
      ORDER BY created_at DESC
      LIMIT 1
    `
  }

  const row = rows[0]
  if (!row) return null

  const validUntil =
    row.valid_until instanceof Date ? row.valid_until : new Date(row.valid_until)
  if (validUntil.getTime() <= Date.now()) return null

  return {
    id: row.id,
    account_uid: row.account_uid,
    account_uids: parseAccountUids(row.account_uid, row.account_uids),
    valid_until: validUntil,
    created_at: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }
}

export async function getLatestAccountUid(): Promise<string | null> {
  const session = await getLatestBankTestSession()
  return session?.account_uid ?? null
}
