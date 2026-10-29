import { randomBytes } from 'crypto'
import { getPool } from '@/lib/db'
import { DELETE_CONFIRM_TTL_MIN } from './config'

/**
 * Persistencia del agente de Telegram (todo en el Postgres del CRM):
 *  - telegram_agent_updates      → dedupe de webhooks (Telegram reintenta)
 *  - telegram_agent_messages     → historial por chat
 *  - telegram_agent_pending      → borrados esperando la doble confirmación
 *  - telegram_agent_audit        → registro de todo lo que el agente cambia
 *  - telegram_agent_instructions → instrucciones permanentes que los socios le dan
 *  - telegram_agent_reminders    → avisos programados desde el chat
 */

let ensured: Promise<void> | null = null

export function ensureTelegramAgentTables(): Promise<void> {
  if (!ensured) {
    ensured = createTables().catch((e) => {
      ensured = null
      throw e
    })
  }
  return ensured
}

async function createTables(): Promise<void> {
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_agent_updates (
      update_id   BIGINT PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS telegram_agent_messages (
      id          SERIAL PRIMARY KEY,
      chat_id     BIGINT NOT NULL,
      user_id     BIGINT,
      role        TEXT NOT NULL,
      content     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tg_agent_messages_chat ON telegram_agent_messages (chat_id, id DESC);
    CREATE TABLE IF NOT EXISTS telegram_agent_pending (
      id            TEXT PRIMARY KEY,
      chat_id       BIGINT NOT NULL,
      requested_by  BIGINT,
      kind          TEXT NOT NULL,
      payload       JSONB NOT NULL,
      summary       TEXT NOT NULL,
      preview       JSONB,
      step          INT NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'pending',
      confirmed_by  TEXT,
      result        JSONB,
      message_id    BIGINT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at    TIMESTAMPTZ NOT NULL,
      resolved_at   TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_tg_agent_pending_chat ON telegram_agent_pending (chat_id, status);
    CREATE TABLE IF NOT EXISTS telegram_agent_audit (
      id          SERIAL PRIMARY KEY,
      chat_id     BIGINT,
      user_id     BIGINT,
      agent       TEXT NOT NULL,
      tool        TEXT NOT NULL,
      args        JSONB,
      ok          BOOLEAN NOT NULL DEFAULT TRUE,
      result      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tg_agent_audit_created ON telegram_agent_audit (created_at DESC);
    CREATE TABLE IF NOT EXISTS telegram_agent_instructions (
      id          SERIAL PRIMARY KEY,
      texto       TEXT NOT NULL,
      modulo      TEXT,
      created_by  BIGINT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS telegram_agent_reminders (
      id           SERIAL PRIMARY KEY,
      chat_id      BIGINT NOT NULL,
      created_by   BIGINT,
      tipo         TEXT NOT NULL DEFAULT 'texto',
      texto        TEXT NOT NULL,
      destino      TEXT NOT NULL DEFAULT 'chat',
      repetir      TEXT NOT NULL DEFAULT 'nunca',
      next_run_at  TIMESTAMPTZ NOT NULL,
      last_run_at  TIMESTAMPTZ,
      activo       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tg_agent_reminders_due ON telegram_agent_reminders (activo, next_run_at);
  `)
}

/** true si es la primera vez que vemos este update (Telegram reintenta si tardamos). */
export async function claimUpdate(updateId: number): Promise<boolean> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(
    `INSERT INTO telegram_agent_updates (update_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [updateId]
  )
  if (Math.random() < 0.02) {
    void getPool()
      .query(`DELETE FROM telegram_agent_updates WHERE created_at < NOW() - INTERVAL '7 days'`)
      .catch(() => {})
  }
  return (r.rowCount || 0) > 0
}

// ——— Historial ———

export type HistoryMessage = { role: 'user' | 'assistant'; content: string }

export async function saveMessage(
  chatId: number,
  userId: number | null,
  role: 'user' | 'assistant' | 'reset',
  content: string
): Promise<void> {
  await ensureTelegramAgentTables()
  await getPool().query(
    `INSERT INTO telegram_agent_messages (chat_id, user_id, role, content) VALUES ($1, $2, $3, $4)`,
    [chatId, userId, role, content.slice(0, 20000)]
  )
}

/** Últimos mensajes desde el último /nuevo. */
export async function loadHistory(chatId: number, limit = 24): Promise<HistoryMessage[]> {
  await ensureTelegramAgentTables()
  const r = await getPool().query<{ role: string; content: string }>(
    `SELECT role, content FROM telegram_agent_messages
     WHERE chat_id = $1
       AND id > COALESCE((SELECT MAX(id) FROM telegram_agent_messages WHERE chat_id = $1 AND role = 'reset'), 0)
     ORDER BY id DESC LIMIT $2`,
    [chatId, limit]
  )
  return r.rows
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
}

// ——— Borrados pendientes (doble confirmación) ———

export type PendingKind = 'delete_rows' | 'destructive_sql'

export type PendingAction = {
  id: string
  chat_id: number
  requested_by: number | null
  kind: PendingKind
  payload: Record<string, unknown>
  summary: string
  preview: Record<string, unknown> | null
  step: number
  status: string
  confirmed_by: string | null
  message_id: number | null
  expires_at: string
}

function mapPending(r: Record<string, unknown>): PendingAction {
  return {
    id: String(r.id),
    chat_id: Number(r.chat_id),
    requested_by: r.requested_by == null ? null : Number(r.requested_by),
    kind: r.kind as PendingKind,
    payload: (r.payload || {}) as Record<string, unknown>,
    summary: String(r.summary || ''),
    preview: (r.preview || null) as Record<string, unknown> | null,
    step: Number(r.step),
    status: String(r.status),
    confirmed_by: r.confirmed_by == null ? null : String(r.confirmed_by),
    message_id: r.message_id == null ? null : Number(r.message_id),
    expires_at: new Date(r.expires_at as string).toISOString(),
  }
}

export async function createPending(input: {
  chatId: number
  requestedBy: number | null
  kind: PendingKind
  payload: Record<string, unknown>
  summary: string
  preview: Record<string, unknown>
}): Promise<PendingAction> {
  await ensureTelegramAgentTables()
  const id = randomBytes(5).toString('hex')
  const r = await getPool().query(
    `INSERT INTO telegram_agent_pending (id, chat_id, requested_by, kind, payload, summary, preview, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + ($8 || ' minutes')::interval)
     RETURNING *`,
    [
      id,
      input.chatId,
      input.requestedBy,
      input.kind,
      JSON.stringify(input.payload),
      input.summary.slice(0, 2000),
      JSON.stringify(input.preview),
      String(DELETE_CONFIRM_TTL_MIN),
    ]
  )
  return mapPending(r.rows[0])
}

export async function getPending(id: string): Promise<PendingAction | null> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(`SELECT * FROM telegram_agent_pending WHERE id = $1`, [id])
  return r.rows[0] ? mapPending(r.rows[0]) : null
}

export async function listOpenPending(chatId: number): Promise<PendingAction[]> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(
    `SELECT * FROM telegram_agent_pending
     WHERE chat_id = $1 AND status = 'pending' AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 20`,
    [chatId]
  )
  return r.rows.map(mapPending)
}

export async function setPendingMessage(id: string, messageId: number): Promise<void> {
  await getPool().query(`UPDATE telegram_agent_pending SET message_id = $2 WHERE id = $1`, [id, messageId])
}

/**
 * Avanza un paso de forma atómica: solo una pulsación gana aunque lleguen dos a la vez.
 * Devuelve la acción actualizada o null si ya no estaba en el paso esperado.
 */
export async function advancePending(
  id: string,
  fromStep: number,
  toStep: number,
  by: string,
  status = 'pending'
): Promise<PendingAction | null> {
  const r = await getPool().query(
    `UPDATE telegram_agent_pending
     SET step = $3, status = $5,
         confirmed_by = CONCAT_WS(',', NULLIF(confirmed_by, ''), $4::text)
     WHERE id = $1 AND step = $2 AND status = 'pending' AND expires_at > NOW()
     RETURNING *`,
    [id, fromStep, toStep, by, status]
  )
  return r.rows[0] ? mapPending(r.rows[0]) : null
}

export async function resolvePending(id: string, status: string, result?: unknown): Promise<void> {
  await getPool().query(
    `UPDATE telegram_agent_pending SET status = $2, result = $3, resolved_at = NOW() WHERE id = $1`,
    [id, status, result === undefined ? null : JSON.stringify(result)]
  )
}

// ——— Auditoría ———

export async function audit(input: {
  chatId: number | null
  userId: number | null
  agent: string
  tool: string
  args: unknown
  ok: boolean
  result: unknown
}): Promise<void> {
  try {
    await ensureTelegramAgentTables()
    await getPool().query(
      `INSERT INTO telegram_agent_audit (chat_id, user_id, agent, tool, args, ok, result)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.chatId,
        input.userId,
        input.agent,
        input.tool,
        JSON.stringify(input.args ?? null).slice(0, 20000),
        input.ok,
        JSON.stringify(input.result ?? null).slice(0, 4000),
      ]
    )
  } catch (e) {
    console.warn('[telegram-agent] audit', e instanceof Error ? e.message : e)
  }
}

// ——— Instrucciones permanentes ———

export type Instruction = { id: number; texto: string; modulo: string | null; created_at: string }

export async function listInstructions(): Promise<Instruction[]> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(
    `SELECT id, texto, modulo, created_at FROM telegram_agent_instructions ORDER BY id ASC LIMIT 200`
  )
  return r.rows.map((x) => ({
    id: Number(x.id),
    texto: String(x.texto),
    modulo: x.modulo ? String(x.modulo) : null,
    created_at: new Date(x.created_at).toISOString(),
  }))
}

export async function addInstruction(texto: string, modulo: string | null, by: number | null): Promise<Instruction> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(
    `INSERT INTO telegram_agent_instructions (texto, modulo, created_by) VALUES ($1, $2, $3)
     RETURNING id, texto, modulo, created_at`,
    [texto.slice(0, 4000), modulo, by]
  )
  const x = r.rows[0]
  return { id: Number(x.id), texto: x.texto, modulo: x.modulo, created_at: new Date(x.created_at).toISOString() }
}

export async function updateInstruction(id: number, texto: string): Promise<boolean> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(`UPDATE telegram_agent_instructions SET texto = $2 WHERE id = $1`, [
    id,
    texto.slice(0, 4000),
  ])
  return (r.rowCount || 0) > 0
}

// ——— Avisos programados ———

export type ReminderRepeat = 'nunca' | 'diario' | 'laborables' | 'semanal' | 'mensual'

export type Reminder = {
  id: number
  chat_id: number
  tipo: 'texto' | 'tarea'
  texto: string
  destino: 'chat' | 'socios'
  repetir: ReminderRepeat
  next_run_at: string
  activo: boolean
}

function mapReminder(x: Record<string, unknown>): Reminder {
  return {
    id: Number(x.id),
    chat_id: Number(x.chat_id),
    tipo: x.tipo === 'tarea' ? 'tarea' : 'texto',
    texto: String(x.texto),
    destino: x.destino === 'socios' ? 'socios' : 'chat',
    repetir: (x.repetir as ReminderRepeat) || 'nunca',
    next_run_at: new Date(x.next_run_at as string).toISOString(),
    activo: Boolean(x.activo),
  }
}

export async function addReminder(input: {
  chatId: number
  createdBy: number | null
  tipo: 'texto' | 'tarea'
  texto: string
  destino: 'chat' | 'socios'
  repetir: ReminderRepeat
  nextRunAt: Date
}): Promise<Reminder> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(
    `INSERT INTO telegram_agent_reminders (chat_id, created_by, tipo, texto, destino, repetir, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [input.chatId, input.createdBy, input.tipo, input.texto.slice(0, 4000), input.destino, input.repetir, input.nextRunAt]
  )
  return mapReminder(r.rows[0])
}

export async function listReminders(onlyActive = true): Promise<Reminder[]> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(
    `SELECT * FROM telegram_agent_reminders ${onlyActive ? 'WHERE activo' : ''} ORDER BY next_run_at ASC LIMIT 100`
  )
  return r.rows.map(mapReminder)
}

export async function setReminderActive(id: number, activo: boolean): Promise<boolean> {
  await ensureTelegramAgentTables()
  const r = await getPool().query(`UPDATE telegram_agent_reminders SET activo = $2 WHERE id = $1`, [id, activo])
  return (r.rowCount || 0) > 0
}

/** Reclama los avisos vencidos y los reprograma (o desactiva) en la misma transacción. */
export async function claimDueReminders(nextRun: (r: Reminder) => Date | null): Promise<Reminder[]> {
  await ensureTelegramAgentTables()
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const due = await client.query(
      `SELECT * FROM telegram_agent_reminders
       WHERE activo AND next_run_at <= NOW()
       ORDER BY next_run_at ASC LIMIT 20
       FOR UPDATE SKIP LOCKED`
    )
    const items = due.rows.map(mapReminder)
    for (const item of items) {
      const next = nextRun(item)
      await client.query(
        `UPDATE telegram_agent_reminders
         SET last_run_at = NOW(), next_run_at = COALESCE($2, next_run_at), activo = $3
         WHERE id = $1`,
        [item.id, next, next != null]
      )
    }
    await client.query('COMMIT')
    return items
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
