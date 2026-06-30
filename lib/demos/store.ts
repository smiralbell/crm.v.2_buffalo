import { query } from '@/lib/db'
import { PhoneNumberConflictError } from './errors'
import type {
  DemoEstado,
  DemoInput,
  DemoListItem,
  DemoMessage,
  DemoRow,
  DemoSaveOptions,
  PhoneConflict,
} from './types'
import { normalizePhoneNumber } from './phone'

function mapDemoRow(row: {
  id: number
  nombre_cliente: string
  prompt: string
  base_conocimiento: string
  estado: string
  created_at: Date | string
}): DemoRow {
  return {
    id: row.id,
    nombre_cliente: row.nombre_cliente,
    prompt: row.prompt,
    base_conocimiento: row.base_conocimiento,
    estado: row.estado as DemoEstado,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
  }
}

export async function listDemos(): Promise<DemoListItem[]> {
  const demos = await query<{
    id: number
    nombre_cliente: string
    prompt: string
    base_conocimiento: string
    estado: string
    created_at: Date
  }>(
    `SELECT id, nombre_cliente, prompt, base_conocimiento, estado, created_at
     FROM demos
     ORDER BY created_at DESC`
  )

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
    created_at: Date
  }>(
    `SELECT id, nombre_cliente, prompt, base_conocimiento, estado, created_at
     FROM demos WHERE id = $1`,
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

async function replaceDemoNumeros(demoId: number, numeros: string[]): Promise<void> {
  await query(`DELETE FROM demo_numeros WHERE demo_id = $1`, [demoId])

  const unique = Array.from(new Set(numeros))
  for (const num of unique) {
    await query(
      `INSERT INTO demo_numeros (demo_id, numero_telefono) VALUES ($1, $2)`,
      [demoId, num]
    )
  }
}

/** Números que ya pertenecen a otra demo (excluye la demo indicada) */
export async function findPhoneConflicts(
  phones: string[],
  exceptDemoId?: number
): Promise<PhoneConflict[]> {
  if (phones.length === 0) return []

  const result = await query<PhoneConflict>(
    `SELECT n.numero_telefono, d.id AS demo_id, d.nombre_cliente
     FROM demo_numeros n
     JOIN demos d ON d.id = n.demo_id
     WHERE n.numero_telefono = ANY($1::text[])
       AND ($2::int IS NULL OR n.demo_id <> $2)
     ORDER BY d.nombre_cliente`,
    [phones, exceptDemoId ?? null]
  )
  return result.rows
}

async function movePhonesFromOtherDemos(phones: string[], targetDemoId: number): Promise<void> {
  for (const phone of phones) {
    await query(
      `DELETE FROM demo_conversaciones
       WHERE numero_telefono = $1 AND demo_id <> $2`,
      [phone, targetDemoId]
    )
    await query(
      `DELETE FROM demo_numeros WHERE numero_telefono = $1 AND demo_id <> $2`,
      [phone, targetDemoId]
    )
  }
}

async function assignDemoNumeros(
  demoId: number,
  numeros: string[],
  options?: DemoSaveOptions
): Promise<void> {
  const conflicts = await findPhoneConflicts(numeros, demoId)
  if (conflicts.length > 0 && !options?.mover_numeros) {
    throw new PhoneNumberConflictError(conflicts)
  }
  if (conflicts.length > 0 && options?.mover_numeros) {
    const toMove = Array.from(new Set(conflicts.map((c) => c.numero_telefono)))
    await movePhonesFromOtherDemos(toMove, demoId)
  }
  await replaceDemoNumeros(demoId, numeros)
}

export async function createDemo(
  input: DemoInput,
  options?: DemoSaveOptions
): Promise<DemoListItem> {
  const preConflicts = await findPhoneConflicts(input.numeros)
  if (preConflicts.length > 0 && !options?.mover_numeros) {
    throw new PhoneNumberConflictError(preConflicts)
  }

  const result = await query<{ id: number; created_at: Date }>(
    `INSERT INTO demos (nombre_cliente, prompt, base_conocimiento, estado)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [input.nombre_cliente, input.prompt, input.base_conocimiento, input.estado]
  )
  const row = result.rows[0]
  if (!row) throw new Error('No se pudo crear la demo')

  try {
    await assignDemoNumeros(row.id, input.numeros, options)
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
  const estado = input.estado ?? existing.estado

  await query(
    `UPDATE demos
     SET nombre_cliente = $1, prompt = $2, base_conocimiento = $3, estado = $4
     WHERE id = $5`,
    [nombre, prompt, base, estado, id]
  )

  if (input.numeros) {
    await assignDemoNumeros(id, input.numeros, options)
  }

  return getDemoById(id)
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
     LIMIT 1`,
    [phone]
  )
  return result.rows[0] ?? null
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
