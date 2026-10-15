import { prisma } from '@/lib/prisma'

export type OpsAlertMessage = {
  id: number
  subject: string
  body: string
  channels: string[]
  created_at: string
}

type DbRow = {
  id: number
  subject: string
  body: string
  channels: string
  created_at: Date
}

let schemaEnsured = false

export async function ensureOpsAlertMessagesTable(): Promise<void> {
  if (schemaEnsured) return
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ops_alert_messages (
      id          SERIAL PRIMARY KEY,
      subject     TEXT NOT NULL,
      body        TEXT NOT NULL,
      channels    TEXT NOT NULL DEFAULT 'email,telegram',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_ops_alert_messages_created ON ops_alert_messages (created_at DESC)`
  )
  schemaEnsured = true
}

function mapRow(r: DbRow): OpsAlertMessage {
  return {
    id: Number(r.id),
    subject: String(r.subject || ''),
    body: String(r.body || ''),
    channels: String(r.channels || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    created_at: new Date(r.created_at).toISOString(),
  }
}

export async function insertOpsAlertMessage(input: {
  subject: string
  body: string
  channels: string[]
}): Promise<number | null> {
  try {
    await ensureOpsAlertMessagesTable()
    const channels = input.channels.length ? input.channels.join(',') : 'email,telegram'
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      `INSERT INTO ops_alert_messages (subject, body, channels)
       VALUES ($1, $2, $3)
       RETURNING id`,
      input.subject.slice(0, 500),
      input.body.slice(0, 20000),
      channels
    )
    return rows[0]?.id ?? null
  } catch (e) {
    console.warn('[ops-alerts] persist', e)
    return null
  }
}

export async function listOpsAlertMessages(opts: {
  page?: number
  pageSize?: number
  take?: number
}): Promise<{ items: OpsAlertMessage[]; total: number; page: number; pageSize: number }> {
  await ensureOpsAlertMessagesTable()
  const pageSize = Math.min(50, Math.max(1, opts.take || opts.pageSize || 20))
  const page = Math.max(1, opts.page || 1)
  const offset = (page - 1) * pageSize

  const countRows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM ops_alert_messages`
  )
  const total = Number(countRows[0]?.n || 0)
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT id, subject, body, channels, created_at
     FROM ops_alert_messages
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    pageSize,
    offset
  )
  return { items: rows.map(mapRow), total, page, pageSize }
}
