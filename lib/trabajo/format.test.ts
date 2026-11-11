import { describe, expect, it } from 'vitest'
import { addDays, groupByDay, matchProject, presetRange, validateWorkItems } from '@/lib/trabajo/format'
import type { WorkEntry } from '@/lib/trabajo/types'

const today = '2026-11-11'
const projects = [
  { id: 'p1', name: 'Sistema Integral PREICO Jurídicos' },
  { id: 'p2', name: 'Automotive Intelligence Center' },
]

describe('validateWorkItems', () => {
  it('acepta trabajos válidos, normaliza horas y reconoce el proyecto por nombre', () => {
    const r = validateWorkItems(
      [
        { fecha: '2026-11-11', titulo: ' Arreglado el webhook ', detalle: 'Fallaba la firma', proyecto: 'preico', horas: '2,5' },
        { fecha: '2026-11-10', titulo: 'Reunión de alcance', proyecto: 'p2' },
      ],
      { today, projects }
    )
    expect(r).toEqual({
      ok: true,
      warnings: [],
      items: [
        { work_date: '2026-11-11', title: 'Arreglado el webhook', detail: 'Fallaba la firma', project_id: 'p1', hours: 2.5 },
        { work_date: '2026-11-10', title: 'Reunión de alcance', detail: null, project_id: 'p2', hours: null },
      ],
    })
  })

  it('un proyecto que no es suyo se guarda sin proyecto y avisa', () => {
    const r = validateWorkItems([{ fecha: today, titulo: 'Algo', proyecto: 'Otro cliente' }], { today, projects })
    expect(r.ok && r.items[0].project_id).toBeNull()
    expect(r.ok && r.warnings[0]).toContain('no es uno de sus proyectos')
  })

  it('rechaza fechas futuras, de hace más de un año, mal escritas, sin título u horas raras', () => {
    const ok = (item: Record<string, unknown>) => validateWorkItems([item], { today, projects }).ok
    expect(ok({ fecha: '2026-11-12', titulo: 'x' })).toBe(false)
    expect(ok({ fecha: '2025-11-01', titulo: 'x' })).toBe(false)
    expect(ok({ fecha: '11/11/2026', titulo: 'x' })).toBe(false)
    expect(ok({ fecha: '2026-02-30', titulo: 'x' })).toBe(false)
    expect(ok({ fecha: today, titulo: '  ' })).toBe(false)
    expect(ok({ fecha: today, titulo: 'x', horas: 30 })).toBe(false)
    expect(ok({ fecha: today, titulo: 'x', horas: 0 })).toBe(false)
    expect(validateWorkItems([], { today, projects }).ok).toBe(false)
  })
})

describe('matchProject', () => {
  it('por id, nombre exacto o parte; nunca adivina entre varios', () => {
    expect(matchProject('p2', projects)?.id).toBe('p2')
    expect(matchProject('automotive', projects)?.id).toBe('p2')
    expect(matchProject('i', projects)).toBeNull()
    expect(matchProject('', projects)).toBeNull()
  })
})

function entry(over: Partial<WorkEntry>): WorkEntry {
  return {
    id: 'e',
    user_id: 5,
    user_name: 'Abel',
    work_date: today,
    title: 'T',
    detail: null,
    project_id: null,
    project_name: null,
    hours: null,
    report_id: null,
    source: 'manual',
    created_at: '2026-11-11T10:00:00.000Z',
    updated_at: '2026-11-11T10:00:00.000Z',
    ...over,
  }
}

describe('groupByDay', () => {
  it('agrupa por día (el más reciente primero), suma horas y junta los mensajes originales', () => {
    const days = groupByDay([
      entry({ id: 'a', work_date: '2026-11-10', hours: 2, report_id: 'r1' }),
      entry({ id: 'b', work_date: '2026-11-11', hours: 1.5, created_at: '2026-11-11T12:00:00.000Z' }),
      entry({ id: 'c', work_date: '2026-11-11', hours: 3, report_id: 'r2', created_at: '2026-11-11T09:00:00.000Z' }),
    ])
    expect(days.map((d) => d.date)).toEqual(['2026-11-11', '2026-11-10'])
    expect(days[0].entries.map((e) => e.id)).toEqual(['c', 'b'])
    expect(days[0].hours).toBe(4.5)
    expect(days[0].reportIds).toEqual(['r2'])
  })
})

describe('fechas', () => {
  it('suma días y calcula periodos', () => {
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31')
    expect(presetRange('7d', today)).toEqual({ from: '2026-11-05', to: today })
    expect(presetRange('month', today)).toEqual({ from: '2026-11-01', to: today })
  })
})
