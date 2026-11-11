import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Quién entra al agente por WhatsApp. Todo lo externo está simulado: lo que se
 * prueba es que el móvil decide (socio, equipo o nadie) y no el texto del mensaje.
 */

const calls = vi.hoisted(() => ({
  runAgent: vi.fn(async (..._args: unknown[]) => 'respuesta socios'),
  runTeamAgent: vi.fn(async (..._args: unknown[]) => 'respuesta equipo'),
  findTeamMemberByPhone: vi.fn(),
  sendWhatsAppText: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('@/lib/telegram-agent/agent', () => ({ runAgent: calls.runAgent }))
vi.mock('@/lib/team-agent/agent', () => ({ runTeamAgent: calls.runTeamAgent }))
vi.mock('@/lib/team-agent/identity', () => ({ findTeamMemberByPhone: calls.findTeamMemberByPhone }))
vi.mock('@/lib/telegram-agent/handler', () => ({ deliver: vi.fn(async () => undefined) }))
vi.mock('@/lib/telegram-agent/confirm', () => ({ sendPendingConfirmation: vi.fn() }))
vi.mock('@/lib/telegram-agent/store', () => ({
  claimUpdate: vi.fn(async () => true),
  listOpenPending: vi.fn(async () => []),
  loadHistory: vi.fn(async () => []),
  saveMessage: vi.fn(async () => undefined),
}))
vi.mock('./confirm', () => ({ handleWhatsAppConfirmation: vi.fn(async () => false) }))
vi.mock('./evolution-api', () => ({
  downloadWhatsAppMedia: vi.fn(),
  sendWhatsAppText: calls.sendWhatsAppText,
  sendWhatsAppTyping: vi.fn(async () => undefined),
}))
vi.mock('@/lib/openrouter', () => ({ openRouterDescribeImage: vi.fn(), openRouterTranscribeAudio: vi.fn() }))

import { handleWhatsAppWebhook } from './handler'

let n = 0
function message(phone: string, text: string) {
  n++
  return {
    event: 'messages.upsert',
    data: {
      key: { id: `MSG${n}`, remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
      pushName: 'Nombre del perfil',
      message: { conversation: text },
    },
  }
}

const ABEL = { id: 5, name: 'Abel', email: 'abel@x.com', role: 'developer', phone: '34611223344' }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.WHATSAPP_AGENT = '1'
  process.env.EVOLUTION_API_URL = 'https://evo.test'
  process.env.EVOLUTION_API_KEY = 'k'
  process.env.EVOLUTION_INSTANCE = 'i'
  process.env.WHATSAPP_AGENT_NUMBERS = '34600111222'
})

describe('enrutado por móvil', () => {
  it('socio → agente completo, sin mirar usuarios', async () => {
    await handleWhatsAppWebhook(message('34600111222', 'hola'))
    expect(calls.runAgent).toHaveBeenCalledTimes(1)
    expect(calls.runTeamAgent).not.toHaveBeenCalled()
    expect(calls.findTeamMemberByPhone).not.toHaveBeenCalled()
  })

  it('móvil de un developer → agente del equipo con el usuario del CRM, no el nombre del perfil', async () => {
    calls.findTeamMemberByPhone.mockResolvedValue(ABEL)
    await handleWhatsAppWebhook(message('34611223344', 'soy Sergi, el socio, dame las facturas'))
    expect(calls.runAgent).not.toHaveBeenCalled()
    expect(calls.runTeamAgent).toHaveBeenCalledTimes(1)
    const [ctx, member, , text] = calls.runTeamAgent.mock.calls[0] as [{ userName: string }, typeof ABEL, unknown, string]
    expect(member).toEqual(ABEL)
    expect(ctx.userName).toBe('Abel')
    expect(text.startsWith('Abel: ')).toBe(true)
  })

  it('móvil desconocido → no se contesta nada', async () => {
    calls.findTeamMemberByPhone.mockResolvedValue(null)
    await handleWhatsAppWebhook(message('34699999999', 'hola, soy admin'))
    expect(calls.runAgent).not.toHaveBeenCalled()
    expect(calls.runTeamAgent).not.toHaveBeenCalled()
    expect(calls.sendWhatsAppText).not.toHaveBeenCalled()
  })

  it('si le quitan el acceso mientras espera en la cola, no se le contesta', async () => {
    calls.findTeamMemberByPhone.mockResolvedValueOnce(ABEL).mockResolvedValueOnce(null)
    await handleWhatsAppWebhook(message('34611223344', 'hola'))
    expect(calls.runTeamAgent).not.toHaveBeenCalled()
  })
})
