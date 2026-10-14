/**
 * Embudo único (primer paso de «un solo embudo, pipelines como vistas»).
 * Lee las tarjetas de TODOS los pipelines (WEB, Cold Calling, LEADS-VENTA…) y las agrupa
 * por contacto en una única etapa canónica: la más avanzada en la que esté. No copia ni
 * modifica nada; los tableros actuales y sus sincronizaciones siguen igual.
 */
import { query } from '@/lib/db'
import { DEFAULT_BUFFALO_STAGES } from '@/lib/pipelines/defaults'
import { stageRank } from '@/lib/pipelines/onboarding-global'

export const LOST_STAGE = 'PERDIDO'
export type FunnelOrigin = 'web' | 'coldcall' | 'otros'

export type UnifiedFunnelItem = {
  contact_id: number
  lead_id: number | null
  nombre: string
  empresa: string | null
  stage: string
  origins: FunnelOrigin[]
  pipelines: string[]
  valor: number | null
  updated_at: string
}

export type UnifiedFunnel = {
  stages: Array<{ name: string; items: UnifiedFunnelItem[]; total_valor: number }>
  totals: { contacts: number; by_origin: Record<FunnelOrigin, number> }
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Columna de cualquier pipeline → etapa canónica (o PERDIDO, o null si no encaja). */
export function canonicalStage(columnName: string): string | null {
  const n = norm(columnName)
  if (n.includes('NO INTERES') || n.includes('PERDID') || n.includes('DESCARTAD')) return LOST_STAGE
  if (n.includes('LLAMADA') || n.includes('LLAMAR') || n === 'INTERESADO' || n.includes('NEGOCIANDO')) return 'CONTACTO'
  const rank = stageRank(columnName)
  return rank >= 0 ? DEFAULT_BUFFALO_STAGES[rank] : null
}

function originOf(pipelineName: string, tags: string[]): FunnelOrigin | null {
  const p = norm(pipelineName)
  const t = tags.map((x) => x.toLowerCase())
  if (p === 'WEB' || t.some((x) => x === 'web' || x.startsWith('web-'))) return 'web'
  if (p.includes('COLD') || t.includes('coldcall')) return 'coldcall'
  return null
}

function originFromLead(origen: string | null): FunnelOrigin {
  const o = (origen || '').toLowerCase()
  if (o.includes('web') || o.includes('formulario') || o.includes('cal')) return 'web'
  if (o.includes('cold') || o.includes('llamada')) return 'coldcall'
  return 'otros'
}

export async function buildUnifiedFunnel(filter?: FunnelOrigin | null): Promise<UnifiedFunnel> {
  const { rows } = await query<{
    entity_id: string
    stage: string
    tags: string[] | null
    pipeline_name: string
    updated_at: Date
    contact_id: number | null
    nombre: string | null
    empresa: string | null
    lead_id: number | null
    origen_principal: string | null
    valor: string | null
  }>(
    `SELECT pc.entity_id, pc.stage, pc.tags, p.name AS pipeline_name, pc.updated_at,
            c.id AS contact_id, c.nombre, c.empresa, l.id AS lead_id, l.origen_principal, l.valor
       FROM pipeline_cards pc
       JOIN pipelines p ON p.id = pc.pipeline_id
       LEFT JOIN contacts c ON pc.entity_id ~ '^[0-9]+$' AND c.id = pc.entity_id::int
       LEFT JOIN leads l ON l.contact_id = c.id
      WHERE pc.deleted_at IS NULL AND pc.entity_type = 'contact'`
  )

  type Acc = UnifiedFunnelItem & { rank: number; lost: boolean }
  const byContact = new Map<number, Acc>()
  for (const r of rows) {
    if (!r.contact_id) continue
    const canon = canonicalStage(r.stage)
    if (!canon) continue
    const lost = canon === LOST_STAGE
    const rank = lost ? -1 : DEFAULT_BUFFALO_STAGES.indexOf(canon as (typeof DEFAULT_BUFFALO_STAGES)[number])
    const origin = originOf(r.pipeline_name, r.tags || [])
    const updated = new Date(r.updated_at).toISOString()
    const cur = byContact.get(r.contact_id)
    if (!cur) {
      byContact.set(r.contact_id, {
        contact_id: r.contact_id,
        lead_id: r.lead_id,
        nombre: r.nombre || `Contacto ${r.contact_id}`,
        empresa: r.empresa,
        stage: canon,
        rank,
        lost,
        origins: origin ? [origin] : [],
        pipelines: [r.pipeline_name],
        valor: r.valor != null ? Number(r.valor) : null,
        updated_at: updated,
      })
      continue
    }
    if (!cur.pipelines.includes(r.pipeline_name)) cur.pipelines.push(r.pipeline_name)
    if (origin && !cur.origins.includes(origin)) cur.origins.push(origin)
    if (updated > cur.updated_at) cur.updated_at = updated
    // Manda la etapa activa más avanzada; «perdido» solo si no hay ninguna activa
    if ((cur.lost && !lost) || (!lost && rank > cur.rank)) {
      cur.stage = canon
      cur.rank = rank
      cur.lost = false
    }
  }

  const items: UnifiedFunnelItem[] = []
  const byOrigin: Record<FunnelOrigin, number> = { web: 0, coldcall: 0, otros: 0 }
  for (const acc of Array.from(byContact.values())) {
    const { rank: _rank, lost: _lost, ...item } = acc
    if (!item.origins.length) item.origins = [originFromLead(rows.find((r) => r.contact_id === item.contact_id)?.origen_principal ?? null)]
    for (const o of item.origins) byOrigin[o]++
    if (!filter || item.origins.includes(filter)) items.push(item)
  }

  const order = [...DEFAULT_BUFFALO_STAGES, LOST_STAGE]
  const stages = order.map((name) => {
    const list = items.filter((i) => i.stage === name).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return { name, items: list, total_valor: list.reduce((s, i) => s + (i.valor || 0), 0) }
  })
  return { stages, totals: { contacts: byContact.size, by_origin: byOrigin } }
}
