import { describe, expect, it } from 'vitest'
import { secretsEqual } from '@/lib/ingest/auth'
import { instantlyEventType, instantlyExternalId } from '@/lib/ingest/instantly'
import { onboardingFormIds } from '@/lib/ingest/onboarding-form'
import { parseTicketsAction, ticketsExternalId } from '@/lib/ingest/tickets-inbound'
import { retellFromNumber } from '@/lib/ingest/whatsapp'

describe('tokens Bearer', () => {
  it('acepta el mismo secreto y rechaza otro', () => {
    expect(secretsEqual('abc', 'abc')).toBe(true)
    expect(secretsEqual('abc', 'abd')).toBe(false)
    expect(secretsEqual('', 'abc')).toBe(false)
  })
})

describe('Instantly: id estable', () => {
  it('usa el id del proveedor', () => {
    expect(instantlyExternalId({ id: 'evt_1', type: 'reply' })).toBe('ins:evt_1')
    expect(instantlyEventType({ event_type: 'email_sent' })).toBe('email_sent')
  })
  it('sin id: mismo cuerpo → mismo hash', () => {
    const a = instantlyExternalId({ email: 'a@b.c', type: 'reply' })
    const b = instantlyExternalId({ email: 'a@b.c', type: 'reply' })
    expect(a).toBe(b)
    expect(a.startsWith('ins:')).toBe(true)
  })
})

describe('Tickets y onboarding', () => {
  it('detecta delete', () => {
    expect(parseTicketsAction({ action: 'eliminar' })).toBe('delete')
    expect(parseTicketsAction({ title: 'Hola' })).toBe('create')
  })
  it('id de ticket estable si trae external_id', () => {
    expect(ticketsExternalId({ title: 'X', external_id: 'abc' })).toBe('tix:abc')
  })
  it('onboarding lee leadId o email', () => {
    expect(onboardingFormIds({ config: { leadId: '12' } })).toEqual({ leadId: 12, email: null })
    expect(onboardingFormIds({ datos: { contacto_email: 'a@b.c' } })).toEqual({ leadId: null, email: 'a@b.c' })
  })
})

describe('Retell: número de origen', () => {
  it('lo saca de call_inbound', () => {
    expect(retellFromNumber({ call_inbound: { from_number: '+34600111222' } })).toBe('+34600111222')
    expect(retellFromNumber({})).toBeNull()
  })
})
