import { describe, expect, it } from 'vitest'
import { incidentErrorHash, parseIncidentPayload } from '@/lib/retencion/incidents'

describe('incidencias de retención', () => {
  it('el mismo error (espacios/mayúsculas) comparte hash', () => {
    expect(incidentErrorHash('Timeout en /pagos')).toBe(incidentErrorHash('  timeout en /pagos  '))
  })

  it('errores distintos no comparten hash', () => {
    expect(incidentErrorHash('Timeout en /pagos')).not.toBe(incidentErrorHash('Timeout en /login'))
  })

  it('lee client_id y error del JSON', () => {
    const p = parseIncidentPayload({
      error: '  boom  ',
      client_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    })
    expect(p.error).toBe('boom')
    expect(p.clientId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })
})
