import { describe, expect, it } from 'vitest'
import {
  clientEmailsFromParticipants,
  isInternalParticipantEmail,
} from '@/lib/integrations/fireflies/match'

describe('fireflies match helpers', () => {
  it('excluye emails internos de Buffalo', () => {
    expect(isInternalParticipantEmail('sergi@agenciabuffalo.es')).toBe(true)
    expect(isInternalParticipantEmail('cli@acme.com')).toBe(false)
  })

  it('solo devuelve emails externos de participantes', () => {
    const emails = clientEmailsFromParticipants([
      { email: 'sergi@agenciabuffalo.es', name: 'Sergi' },
      { email: 'cli@acme.com', name: 'Cliente' },
      { email: 'otro@cliente.io', name: 'Otro' },
    ])
    expect(emails.sort()).toEqual(['cli@acme.com', 'otro@cliente.io'])
  })
})
