import { describe, expect, it } from 'vitest'
import {
  EVENTS,
  decide,
  describeRule,
  digestText,
  effectiveRule,
  emptyPrefs,
  eventsFor,
  getEvent,
  inSilence,
  madridParts,
  madridTime,
  nextDigestTime,
  normalizePrefs,
  parseHHMM,
  passesFilters,
  ruleChange,
  silenceEnd,
  type Prefs,
} from './rules'

const ev = (key: string) => getEvent(key)!
// Noviembre: Madrid va a UTC+1. El 23/11/2026 es lunes.
const madrid = (iso: string) => new Date(`${iso}+01:00`)

describe('hora de Madrid', () => {
  it('convierte en invierno y en verano', () => {
    expect(madridTime(2026, 11, 23, '09:00').toISOString()).toBe('2026-11-23T08:00:00.000Z')
    expect(madridTime(2026, 7, 1, '09:00').toISOString()).toBe('2026-07-01T07:00:00.000Z')
    expect(madridParts(madrid('2026-11-23T09:30:00')).weekday).toBe(1)
  })

  it('entiende las horas como se dicen', () => {
    expect(parseHHMM('9')).toBe('09:00')
    expect(parseHHMM('9:30')).toBe('09:30')
    expect(parseHHMM('21h')).toBe('21:00')
    expect(parseHHMM('25:00')).toBeNull()
    expect(parseHHMM('mañana')).toBeNull()
  })

  it('el resumen diario sale hoy si aún no ha pasado la hora y si no mañana', () => {
    expect(nextDigestTime({ repetir: 'diario', hora: '09:00' }, madrid('2026-11-23T08:00:00')).toISOString()).toBe('2026-11-23T08:00:00.000Z')
    expect(nextDigestTime({ repetir: 'diario', hora: '09:00' }, madrid('2026-11-23T10:00:00')).toISOString()).toBe('2026-11-24T08:00:00.000Z')
  })

  it('los laborables saltan el fin de semana y el de cada hora va a la hora en punto', () => {
    // Viernes 27 a las 10:00 → lunes 30 a las 9:00
    expect(nextDigestTime({ repetir: 'laborables', hora: '09:00' }, madrid('2026-11-27T10:00:00')).toISOString()).toBe('2026-11-30T08:00:00.000Z')
    expect(nextDigestTime({ repetir: 'cada_hora', hora: '09:00' }, madrid('2026-11-23T10:20:00')).toISOString()).toBe('2026-11-23T10:00:00.000Z')
  })

  it('horas de silencio que cruzan la medianoche', () => {
    const s = { desde: '21:00', hasta: '08:00' }
    expect(inSilence(s, madrid('2026-11-23T22:00:00'))).toBe(true)
    expect(inSilence(s, madrid('2026-11-23T07:59:00'))).toBe(true)
    expect(inSilence(s, madrid('2026-11-23T12:00:00'))).toBe(false)
    expect(silenceEnd(s, madrid('2026-11-23T22:00:00')).toISOString()).toBe('2026-11-24T07:00:00.000Z')
  })
})

describe('reglas por defecto', () => {
  it('todo por WhatsApp: el canal común (correo, Telegram y push) no recibe avisos', () => {
    for (const e of eventsFor('comun')) {
      const r = effectiveRule(e, 'comun', emptyPrefs())
      expect(r.canales, e.key).toEqual([])
    }
  })

  it('al WhatsApp del socio: el blog en resumen a las 9 y los avisos del sistema apagados', () => {
    expect(effectiveRule(ev('blog_revision'), 'socio', emptyPrefs())).toMatchObject({ modo: 'resumen', hora: '09:00', canales: ['whatsapp'] })
    expect(effectiveRule(ev('sistema'), 'socio', emptyPrefs()).activo).toBe(false)
    expect(effectiveRule(ev('lead_nuevo'), 'socio', emptyPrefs()).modo).toBe('inmediato')
  })

  it('el equipo solo ve sus avisos, no los de los socios', () => {
    const keys = eventsFor('equipo').map((e) => e.key)
    expect(keys).toEqual([
      'ticket_asignado',
      'incidencia_mi_proyecto',
      'tarea_asignada',
      'recordatorio_incidencia_equipo',
      'recordatorio_ticket_equipo',
      'recordatorio_tarea',
      'tarea_movida',
      'tarea_vence',
    ])
    expect(keys).not.toContain('lead_nuevo')
    expect(EVENTS.every((e) => e.nombre && e.descripcion)).toBe(true)
  })

  it('lo que cambia la persona va encima de lo de por defecto, y nunca un canal que no es suyo', () => {
    const prefs: Prefs = { ...emptyPrefs(), reglas: { lead_nuevo: { modo: 'resumen', canales: ['telegram', 'whatsapp'] } } }
    const r = effectiveRule(ev('lead_nuevo'), 'socio', prefs)
    expect(r.modo).toBe('resumen')
    expect(r.canales).toEqual(['whatsapp'])
  })

  it('una configuración guardada rara no rompe nada', () => {
    expect(normalizePrefs(null)).toEqual(emptyPrefs())
    expect(normalizePrefs({ silencio: { desde: '25:00', hasta: '8' }, pausa_hasta: 'nunca' })).toEqual(emptyPrefs())
  })
})

describe('decidir qué se hace con un aviso', () => {
  const lead = ev('lead_nuevo')
  const now = madrid('2026-11-23T12:00:00')

  it('al momento, si no hay nada que lo impida', () => {
    expect(decide(effectiveRule(lead, 'socio', emptyPrefs()), emptyPrefs(), now, {})).toEqual({ action: 'queue', at: now, digest: false })
  })

  it('desactivado o filtrado: no se manda (y se dice por qué)', () => {
    const off = { ...emptyPrefs(), reglas: { lead_nuevo: { activo: false } } }
    expect(decide(effectiveRule(lead, 'socio', off), off, now, {})).toEqual({ action: 'skip', reason: 'desactivado' })
    const meta = { ...emptyPrefs(), reglas: { lead_nuevo: { origen: ['meta'] } } }
    expect(decide(effectiveRule(lead, 'socio', meta), meta, now, { data: { origen: 'web' } })).toMatchObject({ action: 'skip' })
    expect(decide(effectiveRule(lead, 'socio', meta), meta, now, { data: { origen: 'Meta' } })).toMatchObject({ digest: false })
  })

  it('en horas de silencio se guarda para cuando terminen, salvo lo urgente si lo ha pedido', () => {
    const night = madrid('2026-11-23T23:00:00')
    const quiet: Prefs = { ...emptyPrefs(), silencio: { desde: '21:00', hasta: '08:00' } }
    const r = effectiveRule(ev('incidencia_nueva'), 'socio', quiet)
    expect(decide(r, quiet, night, { urgent: true })).toMatchObject({ digest: true, at: new Date('2026-11-24T07:00:00Z') })
    const bypass = { ...quiet, reglas: { incidencia_nueva: { urgente_salta_silencio: true } } }
    expect(decide(effectiveRule(ev('incidencia_nueva'), 'socio', bypass), bypass, night, { urgent: true })).toMatchObject({ digest: false })
  })

  it('en modo resumen va a la próxima hora del resumen, fuera del silencio', () => {
    const p: Prefs = { ...emptyPrefs(), silencio: { desde: '00:00', hasta: '10:00' } }
    const d = decide(effectiveRule(ev('blog_revision'), 'socio', p), p, now, {})
    // Mañana a las 9 cae en silencio → a las 10
    expect(d).toMatchObject({ action: 'queue', digest: true, at: new Date('2026-11-24T09:00:00Z') })
  })

  it('en pausa, todo espera a que vuelva y le llega en un resumen', () => {
    const p: Prefs = { ...emptyPrefs(), pausa_hasta: '2026-11-30T08:00:00.000Z' }
    expect(decide(effectiveRule(lead, 'socio', p), p, now, { urgent: true })).toMatchObject({ digest: true, at: new Date('2026-11-30T08:00:00Z') })
  })

  it('filtros de prioridad y proyecto', () => {
    const r = { ...effectiveRule(ev('ticket_nuevo'), 'socio', emptyPrefs()), prioridad_min: 'high' as const, proyectos: ['preico'] }
    expect(passesFilters(r, { prioridad: 'medium', proyecto: 'PREICO' }).ok).toBe(false)
    expect(passesFilters(r, { prioridad: 'critical', proyecto: 'PREICO Clínicas' }).ok).toBe(true)
    expect(passesFilters(r, { prioridad: 'high', proyecto: 'Otro' }).ok).toBe(false)
  })
})

describe('cambios desde el chat', () => {
  it('valida lo que se puede cambiar', () => {
    expect(ruleChange(ev('blog_revision'), 'socio', { activo: false })).toEqual({ ok: true, patch: { activo: false } })
    expect(ruleChange(ev('lead_nuevo'), 'socio', { modo: 'resumen', repetir: 'laborables', hora: '8:30' })).toEqual({
      ok: true,
      patch: { modo: 'resumen', repetir: 'laborables', hora: '08:30' },
    })
    expect(ruleChange(ev('ticket_nuevo'), 'socio', { prioridad_min: 'alta' })).toEqual({ ok: true, patch: { prioridad_min: 'high' } })
  })

  it('no deja canales de otro, filtros que el aviso no tiene ni valores raros', () => {
    expect(ruleChange(ev('lead_nuevo'), 'socio', { canales: ['telegram'] }).ok).toBe(false)
    expect(ruleChange(ev('tarea_asignada'), 'equipo', { canales: 'telegram' }).ok).toBe(false)
    expect(ruleChange(ev('blog_revision'), 'socio', { origen: 'meta' }).ok).toBe(false)
    expect(ruleChange(ev('lead_nuevo'), 'socio', { hora: '27:00' }).ok).toBe(false)
    expect(ruleChange(ev('lead_nuevo'), 'socio', {}).ok).toBe(false)
  })

  it('se describe en palabras', () => {
    const p = { ...emptyPrefs(), reglas: { ticket_nuevo: { prioridad_min: 'high' as const } } }
    expect(describeRule(ev('ticket_nuevo'), effectiveRule(ev('ticket_nuevo'), 'socio', p))).toBe(
      'Ticket nuevo: al momento por whatsapp (prioridad alta o más)'
    )
    expect(describeRule(ev('blog_revision'), effectiveRule(ev('blog_revision'), 'socio', emptyPrefs()))).toBe(
      'Blog para revisar: en un resumen cada día a las 09:00 por whatsapp'
    )
  })
})

describe('resúmenes', () => {
  it('agrupa por tipo de aviso', () => {
    const text = digestText(
      [
        { event: 'lead_nuevo', subject: 'Nuevo lead web: Ana', body: 'Nuevo lead web: Ana\nEmail: a@b.c\nAbrir: x' },
        { event: 'blog_revision', subject: 'Blog para revisar: IA en clínicas', body: '...' },
        { event: 'lead_nuevo', subject: 'Nuevo lead web: Luis', body: 'Luis' },
      ],
      'detallado',
      'horas de silencio'
    )
    expect(text).toContain('Mientras estabas en silencio (3)')
    expect(text).toContain('Lead nuevo (2)')
    expect(text).toContain('Email: a@b.c')
    expect(text).not.toContain('Abrir: x')
  })
})
