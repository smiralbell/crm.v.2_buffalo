import { query } from '@/lib/db'
import {
  buildPublicFormUrl,
  generatePublicFormToken,
  hashFormPassword,
} from './form-access'
import type { DemoListItem } from './types'

export type PublicFormDemoRow = {
  demo_id: number
  nombre_cliente: string
  estado: string
  direccion: string | null
  retell_agent_id: string | null
  formulario_password_hash: string | null
  numeros: string[]
}

export type FormPublicAccess = {
  public_token: string | null
  public_url: string | null
  has_password: boolean
}

export async function getFormPublicAccess(demoId: number): Promise<FormPublicAccess> {
  try {
    const result = await query<{
      formulario_public_token: string | null
      formulario_password_hash: string | null
    }>(
      `SELECT formulario_public_token, formulario_password_hash FROM demos WHERE id = $1`,
      [demoId]
    )
    const row = result.rows[0]
    const token = row?.formulario_public_token ?? null
    return {
      public_token: token,
      public_url: token ? buildPublicFormUrl(token) : null,
      has_password: Boolean(row?.formulario_password_hash),
    }
  } catch {
    return { public_token: null, public_url: null, has_password: false }
  }
}

export async function ensurePublicFormToken(demoId: number): Promise<string> {
  const existing = await getFormPublicAccess(demoId)
  if (existing.public_token) return existing.public_token

  const token = generatePublicFormToken()
  await query(`UPDATE demos SET formulario_public_token = $1 WHERE id = $2`, [token, demoId])
  return token
}

export async function setFormPassword(demoId: number, password: string): Promise<FormPublicAccess> {
  const token = await ensurePublicFormToken(demoId)
  const hash = hashFormPassword(password)
  await query(`UPDATE demos SET formulario_password_hash = $1 WHERE id = $2`, [hash, demoId])
  return {
    public_token: token,
    public_url: buildPublicFormUrl(token),
    has_password: true,
  }
}

export async function regeneratePublicFormToken(demoId: number): Promise<FormPublicAccess> {
  const token = generatePublicFormToken()
  await query(`UPDATE demos SET formulario_public_token = $1 WHERE id = $2`, [token, demoId])
  const access = await getFormPublicAccess(demoId)
  return { ...access, public_token: token, public_url: buildPublicFormUrl(token) }
}

export async function getDemoByPublicToken(token: string): Promise<PublicFormDemoRow | null> {
  const result = await query<{
    id: number
    nombre_cliente: string
    estado: string
    direccion: string | null
    retell_agent_id: string | null
    formulario_password_hash: string | null
    tipo: string
  }>(
    `SELECT id, nombre_cliente, estado, direccion, retell_agent_id,
            formulario_password_hash, tipo
     FROM demos
     WHERE formulario_public_token = $1 AND tipo = 'voz'`,
    [token]
  )
  const row = result.rows[0]
  if (!row) return null

  const numeros = await query<{ numero_telefono: string }>(
    `SELECT numero_telefono FROM demo_numeros WHERE demo_id = $1 ORDER BY id`,
    [row.id]
  )

  return {
    demo_id: row.id,
    nombre_cliente: row.nombre_cliente,
    estado: row.estado,
    direccion: row.direccion,
    retell_agent_id: row.retell_agent_id,
    formulario_password_hash: row.formulario_password_hash,
    numeros: numeros.rows.map((n) => n.numero_telefono),
  }
}

export function demoRowToListItem(row: PublicFormDemoRow): DemoListItem {
  return {
    id: row.demo_id,
    nombre_cliente: row.nombre_cliente,
    prompt: '',
    base_conocimiento: '',
    frase_inicial: '',
    estado: row.estado as DemoListItem['estado'],
    tipo: 'voz',
    retell_agent_id: row.retell_agent_id,
    retell_llm_id: null,
    retell_kb_id: null,
    voz_id: null,
    direccion: row.direccion as DemoListItem['direccion'],
    es_principal: false,
    es_asistente_crm: false,
    created_at: new Date().toISOString(),
    numeros: row.numeros,
    numeros_count: row.numeros.length,
  }
}
