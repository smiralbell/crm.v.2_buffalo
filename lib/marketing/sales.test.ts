import { describe, expect, it } from 'vitest'
import { DEFAULT_BUFFALO_STAGES } from '@/lib/pipelines/defaults'
import { addDays, buildFunnel, classifyFollow, mondayOf, stageRank, weekSummary, type FunnelLead } from '@/lib/marketing/sales.types'

const now = new Date('2026-11-25T10:00:00Z')
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000)
const base = { rank: 1, estado: 'frio', created_at: ago(30), last_contact: ago(30), next_meeting: null, perdido: false, snooze_until: null }

describe('columnas del pipeline', () => {
  it('reconoce todas las columnas y van en orden', () => {
    const r = DEFAULT_BUFFALO_STAGES.map(stageRank)
    expect(r.slice(0, -1)).toEqual([...r.slice(0, -1)].sort((a, b) => a - b))
    expect(r.every((x) => x !== 0)).toBe(true)
    expect(stageRank('REMARKETING')).toBe(-1)
    expect(stageRank('PROPUESTA ENVIADA')).toBeGreaterThan(stageRank('PROPUESTA CREADA'))
  })
})

describe('leads parados', () => {
  it('clasifica por lo que toca hacer', () => {
    expect(classifyFollow({ ...base, rank: 5, last_contact: ago(6) }, now)).toEqual({ kind: 'propuesta', days: 6 })
    expect(classifyFollow({ ...base, rank: 3, last_contact: ago(5) }, now)?.kind).toBe('reunion')
    expect(classifyFollow({ ...base, created_at: ago(3), last_contact: null }, now)?.kind).toBe('nuevo')
    expect(classifyFollow({ ...base, rank: 2, last_contact: ago(10) }, now)?.kind).toBe('parado')
  })
  it('no avisa si está reciente, perdido, ganado, pospuesto, con reunión próxima o es antiguo', () => {
    expect(classifyFollow({ ...base, rank: 5, last_contact: ago(1) }, now)).toBeNull()
    expect(classifyFollow({ ...base, rank: 5, perdido: true }, now)).toBeNull()
    expect(classifyFollow({ ...base, rank: -1 }, now)).toBeNull()
    expect(classifyFollow({ ...base, rank: 7 }, now)).toBeNull()
    expect(classifyFollow({ ...base, estado: 'activo' }, now)).toBeNull()
    expect(classifyFollow({ ...base, rank: 5, snooze_until: ago(-2) }, now)).toBeNull()
    expect(classifyFollow({ ...base, rank: 3, next_meeting: ago(-1) }, now)).toBeNull()
    expect(classifyFollow({ ...base, created_at: ago(200), last_contact: null }, now)).toBeNull()
  })
})

describe('embudo', () => {
  const L = (p: Partial<FunnelLead>): FunnelLead => ({
    id: 1, name: 'x', empresa: null, created_at: null, canal: 'ai_search', canal_label: 'GEO', stage: null, reached: 1,
    perdido: false, motivo: null, encaja: null, no_presentado: false, ...p,
  })
  it('cuenta hasta firmado, motivos y coste por reunión que encaja', () => {
    const f = buildFunnel(
      [
        L({ reached: 7, encaja: true }),
        L({ reached: 5, perdido: true, motivo: 'precio', encaja: true }),
        L({ canal: 'meta_ads', reached: 3, encaja: true }),
        L({ canal: 'meta_ads', reached: 3, no_presentado: true, encaja: true }),
        L({ canal: 'meta_ads', reached: 1, perdido: true, motivo: null }),
      ],
      { meta_ads: 200, google_ads: 50 }
    )
    expect(f.rows[0]).toMatchObject({ canal: 'ai_search', leads: 2, reunion: 2, propuesta: 2, firmado: 1, perdido: 1, motivo_top: 'Precio' })
    expect(f.rows.find((r) => r.canal === 'meta_ads')).toMatchObject({ reunion: 2, no_presentado: 1, encaja: 1, coste_reunion_encaja: 200, motivo_top: null })
    expect(f.rows.find((r) => r.canal === 'google_ads')).toMatchObject({ leads: 0, spend_eur: 50, coste_reunion_encaja: null })
    expect(f.total).toMatchObject({ leads: 5, perdido: 2, spend_eur: 250 })
    expect(f.motivos).toEqual(expect.arrayContaining([{ label: 'Precio', n: 1 }, { label: 'Sin motivo', n: 1 }]))
  })
})

describe('revisión semanal', () => {
  it('semanas de lunes a domingo', () => {
    expect(mondayOf('2026-11-25')).toBe('2026-11-23')
    expect(mondayOf('2026-11-23')).toBe('2026-11-23')
    expect(mondayOf('2026-11-29')).toBe('2026-11-23')
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
  })
  it('resume lo que pasó', () => {
    const w = { leads: 9, reuniones: 3, propuestas: 1, firmados: 0, by_channel: [{ label: 'Web', n: 5 }] }
    const p = { ...w, leads: 7, reuniones: 3 }
    const s = weekSummary(w, p, { propuesta: 2, reunion: 0, nuevo: 1, parado: 4 }, 0).join(' ')
    expect(s).toContain('9 leads (2 más que la anterior)')
    expect(s).toContain('3 reuniones hechas (igual que la anterior)')
    expect(s).toContain('1 propuesta enviada y 0 contratos firmados')
    expect(s).toContain('2 propuestas sin respuesta')
  })
})
