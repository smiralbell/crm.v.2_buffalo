import { query } from '@/lib/db'
import { PhoneNumberConflictError } from './errors'
import type {
  DemoDireccion,
  DemoEstado,
  DemoInput,
  DemoListItem,
  DemoMessage,
  DemoRow,
  DemoSaveOptions,
  DemoTipo,
  PhoneConflict,
  VoiceDemoMatch,
} from './types'
import { normalizePhoneNumber } from './phone'

function mapDemoRow(row: {
  id: number
  nombre_cliente: string
  prompt: string
  base_conocimiento: string
  frase_inicial?: string | null
  estado: string
  tipo?: string | null
  retell_agent_id?: string | null
  retell_llm_id?: string | null
  retell_kb_id?: string | null
  voz_id?: string | null
  direccion?: string | null
  es_principal?: boolean | null
  created_at: Date | string
}): DemoRow {
  return {
    id: row.id,
    nombre_cliente: row.nombre_cliente,
    prompt: row.prompt,
    base_conocimiento: row.base_conocimiento,
    frase_inicial: row.frase_inicial ?? '',
    estado: row.estado as DemoEstado,
    tipo: (row.tipo === 'voz' ? 'voz' : 'whatsapp') as DemoTipo,
    retell_agent_id: row.retell_agent_id ?? null,
    retell_llm_id: row.retell_llm_id ?? null,
    retell_kb_id: row.retell_kb_id ?? null,
    voz_id: row.voz_id ?? null,
    direccion: (row.direccion as DemoDireccion | null) ?? null,
    es_principal: row.es_principal === true,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  }
}

const DEMO_SELECT = `id, nombre_cliente, prompt, base_conocimiento, frase_inicial, estado,
  tipo, retell_agent_id, retell_llm_id, retell_kb_id, voz_id, direccion,
  COALESCE(es_principal, false) AS es_principal, created_at`

async function clearPrincipalFlag(tipo: DemoTipo, exceptDemoId?: number): Promise<void> {
  await query(
    `UPDATE demos SET es_principal = FALSE
     WHERE COALESCE(es_principal, false) = TRUE
       AND COALESCE(tipo, 'whatsapp') = $1
       AND ($2::int IS NULL OR id <> $2)`,
    [tipo, exceptDemoId ?? null]
  )
}

export async function listDemos(): Promise<DemoListItem[]> {
  let demos: Awaited<ReturnType<typeof query<{
    id: number
    nombre_cliente: string
    prompt: string
    base_conocimiento: string
    estado: string
    tipo: string
    retell_agent_id: string | null
    retell_llm_id: string | null
    retell_kb_id: string | null
    voz_id: string | null
    direccion: string | null
    es_principal?: boolean | null
    created_at: Date
  }>>>

  try {
    demos = await query(
      `SELECT ${DEMO_SELECT}
       FROM demos
       ORDER BY created_at DESC`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : ''
    // Prod sin migración ALTER_DEMOS_PRINCIPAL.sql
    if (msg.includes('es_principal')) {
      demos = await query(
        `SELECT id, nombre_cliente, prompt, base_conocimiento, frase_inicial, estado,
                tipo, retell_agent_id, retell_llm_id, retell_kb_id, voz_id, direccion,
                FALSE AS es_principal, created_at
         FROM demos
         ORDER BY created_at DESC`
      )
    } else {
      throw err
    }
  }

  const numeros = await query<{ demo_id: number; numero_telefono: string }>(
    `SELECT demo_id, numero_telefono FROM demo_numeros ORDER BY demo_id, id`
  )

  const byDemo = new Map<number, string[]>()
  for (const n of numeros.rows) {
    const list = byDemo.get(n.demo_id) ?? []
    list.push(n.numero_telefono)
    byDemo.set(n.demo_id, list)
  }

  return demos.rows.map((d) => {
    const nums = byDemo.get(d.id) ?? []
    return {
      ...mapDemoRow(d),
      numeros: nums,
      numeros_count: nums.length,
    }
  })
}

export async function getDemoById(id: number): Promise<DemoListItem | null> {
  const result = await query<{
    id: number
    nombre_cliente: string
    prompt: string
    base_conocimiento: string
    estado: string
    tipo: string
    retell_agent_id: string | null
    retell_llm_id: string | null
    retell_kb_id: string | null
    voz_id: string | null
    direccion: string | null
    created_at: Date
  }>(
    `SELECT ${DEMO_SELECT} FROM demos WHERE id = $1`,
    [id]
  )
  const row = result.rows[0]
  if (!row) return null

  const numeros = await query<{ numero_telefono: string }>(
    `SELECT numero_telefono FROM demo_numeros WHERE demo_id = $1 ORDER BY id`,
    [id]
  )

  const nums = numeros.rows.map((n) => n.numero_telefono)
  return {
    ...mapDemoRow(row),
    numeros: nums,
    numeros_count: nums.length,
  }
}

async function replaceDemoNumeros(
  demoId: number,
  numeros: string[],
  canal: DemoTipo
): Promise<void> {
  await query(`DELETE FROM demo_numeros WHERE demo_id = $1`, [demoId])

  const unique = Array.from(new Set(numeros))
  for (const num of unique) {
    try {
      await query(
        `INSERT INTO demo_numeros (demo_id, numero_telefono, canal) VALUES ($1, $2, $3)`,
        [demoId, num, canal]
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('canal')) {
        await query(
          `INSERT INTO demo_numeros (demo_id, numero_telefono) VALUES ($1, $2)`,
          [demoId, num]
        )
      } else {
        throw err
      }
    }
  }
}

/** Números que ya pertenecen a otra demo del mismo canal (WhatsApp o voz) */
export async function findPhoneConflicts(
  phones: string[],
  exceptDemoId?: number,
  canal: DemoTipo = 'whatsapp'
): Promise<PhoneConflict[]> {
  if (phones.length === 0) return []

  const result = await query<PhoneConflict & { demo_tipo: string }>(
    `SELECT n.numero_telefono, d.id AS demo_id, d.nombre_cliente,
            COALESCE(d.tipo, 'whatsapp') AS demo_tipo
     FROM demo_numeros n
     JOIN demos d ON d.id = n.demo_id
     WHERE n.numero_telefono = ANY($1::text[])
       AND ($2::int IS NULL OR n.demo_id <> $2)
       AND COALESCE(d.tipo, 'whatsapp') = $3
     ORDER BY d.nombre_cliente`,
    [phones, exceptDemoId ?? null, canal]
  )
  return result.rows.map((r) => ({
    numero_telefono: r.numero_telefono,
    demo_id: r.demo_id,
    nombre_cliente: r.nombre_cliente,
    demo_tipo: r.demo_tipo as DemoTipo,
  }))
}

async function movePhonesFromOtherDemos(
  phones: string[],
  targetDemoId: number,
  canal: DemoTipo
): Promise<void> {
  for (const phone of phones) {
    if (canal === 'whatsapp') {
      await query(
        `DELETE FROM demo_conversaciones
         WHERE numero_telefono = $1 AND demo_id <> $2`,
        [phone, targetDemoId]
      )
    }
    await query(
      `DELETE FROM demo_numeros n
       USING demos d
       WHERE n.demo_id = d.id
         AND n.numero_telefono = $1
         AND n.demo_id <> $2
         AND COALESCE(d.tipo, 'whatsapp') = $3`,
      [phone, targetDemoId, canal]
    )
  }
}

async function assignDemoNumeros(
  demoId: number,
  numeros: string[],
  options?: DemoSaveOptions,
  canalOverride?: DemoTipo
): Promise<void> {
  const demo = await getDemoById(demoId)
  const canal = canalOverride ?? demo?.tipo ?? 'whatsapp'

  const conflicts = await findPhoneConflicts(numeros, demoId, canal)
  if (conflicts.length > 0 && !options?.mover_numeros) {
    throw new PhoneNumberConflictError(conflicts)
  }
  if (conflicts.length > 0 && options?.mover_numeros) {
    const toMove = Array.from(new Set(conflicts.map((c) => c.numero_telefono)))
    await movePhonesFromOtherDemos(toMove, demoId, canal)
  }
  await replaceDemoNumeros(demoId, numeros, canal)
}

export async function createDemo(
  input: DemoInput,
  options?: DemoSaveOptions
): Promise<DemoListItem> {
  const tipo: DemoTipo = input.tipo === 'voz' ? 'voz' : 'whatsapp'
  const esPrincipal = input.es_principal === true

  const preConflicts = await findPhoneConflicts(input.numeros, undefined, tipo)
  if (preConflicts.length > 0 && !options?.mover_numeros) {
    throw new PhoneNumberConflictError(preConflicts)
  }

  if (esPrincipal) {
    await clearPrincipalFlag(tipo)
  }

  const result = await query<{ id: number; created_at: Date }>(
    `INSERT INTO demos (
       nombre_cliente, prompt, base_conocimiento, frase_inicial, estado,
       tipo, voz_id, direccion, es_principal,
       retell_agent_id, retell_llm_id, retell_kb_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, created_at`,
    [
      input.nombre_cliente,
      input.prompt,
      input.base_conocimiento,
      input.frase_inicial?.trim() ?? '',
      input.estado,
      tipo,
      tipo === 'voz' ? input.voz_id?.trim() || null : null,
      tipo === 'voz' ? input.direccion || 'inbound' : null,
      esPrincipal,
      null,
      null,
      null,
    ]
  )
  const row = result.rows[0]
  if (!row) throw new Error('No se pudo crear la demo')

  try {
    await assignDemoNumeros(row.id, input.numeros, options, tipo)
  } catch (err) {
    await query(`DELETE FROM demos WHERE id = $1`, [row.id])
    throw err
  }

  const demo = await getDemoById(row.id)
  if (!demo) throw new Error('Demo no encontrada tras crear')
  return demo
}

export async function updateDemo(
  id: number,
  input: Partial<DemoInput>,
  options?: DemoSaveOptions
): Promise<DemoListItem | null> {
  const existing = await getDemoById(id)
  if (!existing) return null

  const nombre = input.nombre_cliente ?? existing.nombre_cliente
  const prompt = input.prompt ?? existing.prompt
  const base = input.base_conocimiento ?? existing.base_conocimiento
  const fraseInicial =
    input.frase_inicial !== undefined ? input.frase_inicial.trim() : existing.frase_inicial
  const estado = input.estado ?? existing.estado
  const vozId = input.voz_id !== undefined ? input.voz_id.trim() || null : existing.voz_id
  const direccion =
    input.direccion !== undefined ? input.direccion : existing.direccion
  const esPrincipal =
    input.es_principal !== undefined ? input.es_principal === true : existing.es_principal

  if (esPrincipal) {
    await clearPrincipalFlag(existing.tipo, id)
  }

  await query(
    `UPDATE demos
     SET nombre_cliente = $1, prompt = $2, base_conocimiento = $3, frase_inicial = $4, estado = $5,
         voz_id = $6, direccion = $7, es_principal = $8
     WHERE id = $9`,
    [nombre, prompt, base, fraseInicial, estado, vozId, direccion, esPrincipal, id]
  )

  if (input.numeros) {
    await assignDemoNumeros(id, input.numeros, options)
  }

  return getDemoById(id)
}

export async function updateDemoRetellIds(
  id: number,
  ids: {
    retell_agent_id: string
    retell_llm_id: string
    retell_kb_id: string
  }
): Promise<void> {
  await query(
    `UPDATE demos
     SET retell_agent_id = $1, retell_llm_id = $2, retell_kb_id = $3
     WHERE id = $4`,
    [ids.retell_agent_id, ids.retell_llm_id, ids.retell_kb_id, id]
  )
}

export async function deleteDemo(id: number): Promise<boolean> {
  const result = await query(`DELETE FROM demos WHERE id = $1`, [id])
  return (result.rowCount ?? 0) > 0
}

export function parseNumerosInput(raw: string[]): string[] {
  const out: string[] = []
  for (const item of raw) {
    const normalized = normalizePhoneNumber(item)
    if (normalized) out.push(normalized)
  }
  return Array.from(new Set(out))
}

export interface ActiveDemoMatch {
  demo_id: number
  nombre_cliente: string
  prompt: string
  base_conocimiento: string
}

/** Un número solo puede estar en una demo activa (garantizado por BD + lógica de asignación) */
export async function findActiveDemoByPhone(phone: string): Promise<ActiveDemoMatch | null> {
  const result = await query<{
    demo_id: number
    nombre_cliente: string
    prompt: string
    base_conocimiento: string
  }>(
    `SELECT d.id AS demo_id, d.nombre_cliente, d.prompt, d.base_conocimiento
     FROM demo_numeros n
     JOIN demos d ON d.id = n.demo_id
     WHERE n.numero_telefono = $1 AND d.estado = 'activa'
       AND (d.tipo = 'whatsapp' OR d.tipo IS NULL)
     LIMIT 1`,
    [phone]
  )
  return result.rows[0] ?? null
}

/** Demo de voz activa para llamadas inbound desde un número autorizado */
export async function findActiveVoiceDemoByPhone(
  phone: string
): Promise<VoiceDemoMatch | null> {
  const result = await query<{
    demo_id: number
    nombre_cliente: string
    retell_agent_id: string
    direccion: string
  }>(
    `SELECT d.id AS demo_id, d.nombre_cliente, d.retell_agent_id, d.direccion
     FROM demo_numeros n
     JOIN demos d ON d.id = n.demo_id
     WHERE n.numero_telefono = $1
       AND d.estado = 'activa'
       AND d.tipo = 'voz'
       AND d.direccion IN ('inbound', 'ambos')
       AND d.retell_agent_id IS NOT NULL
     LIMIT 1`,
    [phone]
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    demo_id: row.demo_id,
    nombre_cliente: row.nombre_cliente,
    retell_agent_id: row.retell_agent_id,
    direccion: row.direccion as DemoDireccion,
  }
}

/** Demo principal Buffalo (WhatsApp): captura números no asociados a ninguna demo de cliente */
export async function findPrincipalActiveDemo(): Promise<ActiveDemoMatch | null> {
  const result = await query<{
    demo_id: number
    nombre_cliente: string
    prompt: string
    base_conocimiento: string
  }>(
    `SELECT d.id AS demo_id, d.nombre_cliente, d.prompt, d.base_conocimiento
     FROM demos d
     WHERE d.estado = 'activa'
       AND COALESCE(d.es_principal, false) = TRUE
       AND (d.tipo = 'whatsapp' OR d.tipo IS NULL)
     LIMIT 1`
  )
  return result.rows[0] ?? null
}

/** Demo principal Buffalo (voz inbound): captura llamadas de números no autorizados */
export async function findPrincipalActiveVoiceDemo(): Promise<VoiceDemoMatch | null> {
  const result = await query<{
    demo_id: number
    nombre_cliente: string
    retell_agent_id: string
    direccion: string
  }>(
    `SELECT d.id AS demo_id, d.nombre_cliente, d.retell_agent_id, d.direccion
     FROM demos d
     WHERE d.estado = 'activa'
       AND COALESCE(d.es_principal, false) = TRUE
       AND d.tipo = 'voz'
       AND d.direccion IN ('inbound', 'ambos')
       AND d.retell_agent_id IS NOT NULL
     LIMIT 1`
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    demo_id: row.demo_id,
    nombre_cliente: row.nombre_cliente,
    retell_agent_id: row.retell_agent_id,
    direccion: row.direccion as DemoDireccion,
  }
}

/** Lista todos los números autorizados en demos activas (para debug) */
export async function listAuthorizedPhones(): Promise<
  Array<{ phone: string; demo_id: number; nombre_cliente: string }>
> {
  const result = await query<{
    numero_telefono: string
    demo_id: number
    nombre_cliente: string
  }>(
    `SELECT n.numero_telefono, d.id AS demo_id, d.nombre_cliente
     FROM demo_numeros n
     JOIN demos d ON d.id = n.demo_id
     WHERE d.estado = 'activa'
     ORDER BY d.nombre_cliente, n.numero_telefono`
  )
  return result.rows.map((r) => ({
    phone: r.numero_telefono,
    demo_id: r.demo_id,
    nombre_cliente: r.nombre_cliente,
  }))
}

export async function getConversationMessages(
  demoId: number,
  phone: string
): Promise<DemoMessage[]> {
  const result = await query<{ messages: DemoMessage[] | string }>(
    `SELECT messages FROM demo_conversaciones
     WHERE demo_id = $1 AND numero_telefono = $2
     LIMIT 1`,
    [demoId, phone]
  )
  const row = result.rows[0]
  if (!row) return []

  const raw = row.messages
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as DemoMessage[]) : []
    } catch {
      return []
    }
  }
  return []
}

export async function getConversationDetail(
  demoId: number,
  phone: string
): Promise<{ phone: string; messages: DemoMessage[]; updated_at: string | null } | null> {
  const result = await query<{ messages: DemoMessage[] | string; updated_at: Date }>(
    `SELECT messages, updated_at FROM demo_conversaciones
     WHERE demo_id = $1 AND numero_telefono = $2
     LIMIT 1`,
    [demoId, phone]
  )
  const row = result.rows[0]
  if (!row) return null

  const messages = await getConversationMessages(demoId, phone)
  const updated_at =
    row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : new Date(row.updated_at).toISOString()

  return { phone, messages, updated_at }
}

const MAX_HISTORY_MESSAGES = 40

export async function saveConversationMessages(
  demoId: number,
  phone: string,
  messages: DemoMessage[]
): Promise<void> {
  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES)
  const json = JSON.stringify(trimmed)

  await query(
    `INSERT INTO demo_conversaciones (demo_id, numero_telefono, messages, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (demo_id, numero_telefono)
     DO UPDATE SET messages = EXCLUDED.messages, updated_at = NOW()`,
    [demoId, phone, json]
  )
}

export async function clearDemoMemory(demoId: number): Promise<number> {
  const result = await query(
    `DELETE FROM demo_conversaciones WHERE demo_id = $1`,
    [demoId]
  )
  try {
    await query(`DELETE FROM demo_webhook_logs WHERE demo_id = $1`, [demoId])
  } catch {
    // tabla de logs puede no existir
  }
  return result.rowCount ?? 0
}
