import { describe, expect, it } from 'vitest'
import { formatNewTicketAlert } from './alerts'

describe('aviso ticket de cliente', () => {
  it('monta mail y Telegram con proyecto, prioridad y enlace', () => {
    const msg = formatNewTicketAlert({
      ticketId: 'abc-123',
      projectName: 'Avecla Realty',
      ticket: {
        title: 'El bot no responde',
        description: 'Desde ayer el agente de voz cuelga a los 3 segundos.',
        priority: 'high',
        reporter_name: 'María',
        reporter_email: 'maria@avecla.com',
        source: 'webhook',
      },
    })
    expect(msg.subject).toContain('El bot no responde')
    expect(msg.subject).toContain('Avecla Realty')
    expect(msg.text).toContain('Alta')
    expect(msg.text).toContain('maria@avecla.com')
    expect(msg.text).toContain('/tickets/abc-123')
    expect(msg.telegramHtml).toContain('<b>')
  })
})
