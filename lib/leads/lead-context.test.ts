import { describe, expect, it } from 'vitest'
import { contextToMarkdown, type LeadContext } from './context-sources'
import { valueFingerprint } from './lead-summary'
import { normalizeCompany } from './facturas'

function ctx(extra: Partial<Record<string, { id: string; body: string }[]>> = {}): LeadContext {
  const items = (id: string) =>
    (extra[id] || []).map((x) => ({ id: x.id, title: `${id} ${x.id}`, date: '2026-11-20T10:00:00.000Z', body: x.body, meta: [], link: null }))
  return {
    lead: {
      id: 7, nombre: 'Ana López', empresa: 'Grupo Corp', email: 'ana@corp.com', emails_extra: [], telefono: null,
      estado: 'caliente', es_cliente: false, prioridad: 'alta', origen: 'web', valor: null,
      created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-20T10:00:00.000Z',
    },
    sources: [
      { id: 'origen', label: 'Canal de entrada', items: [{ id: 'entrada', title: 'Entró por web', date: '2026-11-01T10:00:00.000Z', body: null, meta: [], link: null }] },
      { id: 'correos', label: 'Correos', items: items('correos') },
      { id: 'reuniones', label: 'Reuniones', items: items('reuniones') },
      { id: 'proyecto', label: 'Proyecto', items: items('proyecto') },
    ],
  }
}

describe('resumen del lead', () => {
  it('sin correos, reuniones ni notas no hay contenido de valor (la entrada no cuenta)', () => {
    expect(valueFingerprint(ctx()).hasContent).toBe(false)
  })

  it('la huella cambia cuando llega un correo nuevo, no si no cambia nada', () => {
    const a = valueFingerprint(ctx({ correos: [{ id: '1', body: 'Hola' }] }))
    const b = valueFingerprint(ctx({ correos: [{ id: '1', body: 'Hola' }] }))
    const c = valueFingerprint(ctx({ correos: [{ id: '1', body: 'Hola' }, { id: '2', body: 'Presupuesto' }] }))
    expect(a.hasContent).toBe(true)
    expect(a.fingerprint).toBe(b.fingerprint)
    expect(c.fingerprint).not.toBe(a.fingerprint)
  })

  it('un cliente con proyecto ya tiene contenido, y que cambien sus tareas no rehace el resumen', () => {
    const a = valueFingerprint(ctx({ proyecto: [{ id: 'p1', body: 'Tareas (1/3 hechas)' }] }))
    const b = valueFingerprint(ctx({ proyecto: [{ id: 'p1', body: 'Tareas (2/3 hechas) y más cosas' }] }))
    expect(a.hasContent).toBe(true)
    expect(b.fingerprint).toBe(a.fingerprint)
  })
})

describe('exportación a Markdown', () => {
  it('incluye datos, cada fuente y el contenido completo', () => {
    const md = contextToMarkdown(ctx({ reuniones: [{ id: 'r1', body: 'Quieren un agente de voz' }] }))
    expect(md).toMatch(/^# Ana López · Grupo Corp/)
    expect(md).toContain('## Reuniones (1)')
    expect(md).toContain('Quieren un agente de voz')
    expect(md).toContain('## Correos (0)')
  })
})

describe('nombres de cliente en facturas', () => {
  it('compara sin acentos, mayúsculas ni sufijos de sociedad', () => {
    expect(normalizeCompany('GRUPO CORP, S.L.')).toBe('grupo corp')
    expect(normalizeCompany('Grupo Corp')).toBe('grupo corp')
    expect(normalizeCompany('Préstamos Ñandú S.A.')).toBe('prestamos nandu')
  })
})
