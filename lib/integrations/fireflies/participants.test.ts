import { describe, expect, it } from 'vitest'
import { extractParticipants, type FirefliesTranscript } from './client'

const base: FirefliesTranscript = {
  id: 't1',
  title: 'Reunión',
  date: null,
  dateString: null,
  duration: null,
  host_email: null,
  organizer_email: null,
  participants: null,
  transcript_url: null,
  meeting_link: null,
}

const emails = (t: FirefliesTranscript) => extractParticipants(t).map((p) => p.email).filter(Boolean).sort()

describe('correos de una reunión de Fireflies', () => {
  it('separa los invitados que llegan juntos en un solo texto', () => {
    expect(emails({ ...base, participants: ['sergi@agenciabuffalo.es,cliente@empresa.com, otro@empresa.com'] })).toEqual([
      'cliente@empresa.com',
      'otro@empresa.com',
      'sergi@agenciabuffalo.es',
    ])
  })

  it('entiende «Nombre <correo>» y varios separados por punto y coma', () => {
    const p = extractParticipants({ ...base, participants: ['Ana López <ana@cliente.com>; Luis <luis@cliente.com>'] })
    expect(p.find((x) => x.email === 'ana@cliente.com')?.name).toBe('Ana López')
    expect(p.map((x) => x.email)).toContain('luis@cliente.com')
  })

  it('junta invitados del calendario, participantes, organizador y anfitrión sin repetir', () => {
    expect(
      emails({
        ...base,
        organizer_email: 'Sergi@AgenciaBuffalo.es',
        host_email: 'sergi@agenciabuffalo.es',
        meeting_attendees: [{ email: 'cliente@empresa.com', displayName: 'Cliente' }],
        participants: ['cliente@empresa.com'],
      })
    ).toEqual(['cliente@empresa.com', 'sergi@agenciabuffalo.es'])
  })

  it('un nombre sin correo se guarda como nombre', () => {
    const p = extractParticipants({ ...base, participants: ['Marta'] })
    expect(p).toEqual([{ email: null, name: 'Marta' }])
  })
})
