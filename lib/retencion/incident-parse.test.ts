import { describe, expect, it } from 'vitest'
import { parseIncidentText } from './incident-parse'

const REAL =
  '[api/derivar] Error: Derivación sin teléfono: Retell no envió los datos de la llamada y la IA no dio un teléfono válido ' +
  'Stack: Error: Derivación sin teléfono: Retell no envió los datos at u (/app/.next/server/app/api/derivar/route.js:1:2045) ' +
  'at process.processTicksAndRejections (node:internal/process/task_queues:95:5) ' +
  'Contexto: {"call_id":"call_452f1be195cc93c6bab21e70f1d","clientPhone":"anonymous"} ' +
  'Entorno: production · 2026-11-20T17:13:45.568Z'

describe('parseIncidentText', () => {
  it('separa ruta, título, traza, contexto y entorno', () => {
    const p = parseIncidentText(REAL)
    expect(p.tag).toBe('api/derivar')
    expect(p.title).toBe(
      'Derivación sin teléfono: Retell no envió los datos de la llamada y la IA no dio un teléfono válido'
    )
    expect(p.stack[0]).toMatch(/^Error: Derivación/)
    expect(p.stack.some((l) => l.startsWith('at u ('))).toBe(true)
    expect(p.context).toEqual([
      { key: 'call_id', value: 'call_452f1be195cc93c6bab21e70f1d' },
      { key: 'clientPhone', value: 'anonymous' },
    ])
    expect(p.environment).toBe('production')
    expect(p.reportedAt).toBe('2026-11-20T17:13:45.568Z')
  })

  it('un texto sencillo queda tal cual, con su etiqueta', () => {
    const p = parseIncidentText('[PRUEBA] Comprobación de la conexión de incidencias. No es un fallo real.')
    expect(p.tag).toBe('PRUEBA')
    expect(p.title).toBe('Comprobación de la conexión de incidencias. No es un fallo real.')
    expect(p.stack).toEqual([])
    expect(p.context).toEqual([])
    expect(p.environment).toBeNull()
  })

  it('si el contexto no es JSON se guarda como texto', () => {
    const p = parseIncidentText('Fallo X Contexto: usuario 42 sin permisos')
    expect(p.context).toEqual([])
    expect(p.contextRaw).toBe('usuario 42 sin permisos')
  })
})
