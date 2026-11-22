import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Configurar los avisos automáticos desde el chat. Base de datos simulada: se
 * prueba que cada uno solo toca lo suyo y que lo que pide se guarda bien.
 */

const m = vi.hoisted(() => {
  const saved = new Map<string, unknown>()
  return {
    saved,
    getPrefs: vi.fn(async (key: string) => saved.get(key) ?? { silencio: null, pausa_hasta: null, estilo_resumen: null, reglas: {} }),
    savePrefs: vi.fn(async (key: string, prefs: unknown) => {
      saved.set(key, prefs)
    }),
    notificationHistory: vi.fn(async () => []),
  }
})

vi.mock('./notify', () => ({
  COMMON_KEY: 'comun',
  getPrefs: m.getPrefs,
  savePrefs: m.savePrefs,
  notificationHistory: m.notificationHistory,
}))
vi.mock('@/lib/db', () => ({ getPool: () => ({ query: vi.fn() }) }))
vi.mock('@/lib/telegram-agent/undo', () => ({
  snapshotWhere: vi.fn(async () => [{ owner_key: 'x', prefs: {} }]),
  recordUndo: vi.fn(async () => 7),
}))

import { notificationTools, runNotificationTool } from './tools'

const socio = { kind: 'socio' as const, ownerKey: 'chat:7000034600111222', chatId: 7000034600111222 }
const dev = { kind: 'equipo' as const, ownerKey: 'user:5', chatId: 7000034611223344 }
const ok = (r: unknown) => (r as { ok: boolean }).ok

beforeEach(() => {
  m.saved.clear()
  m.savePrefs.mockClear()
})

describe('socios', () => {
  it('«no me avises de los blogs» lo apaga solo en su WhatsApp', async () => {
    expect(ok(await runNotificationTool('avisos_auto_cambiar', { aviso: 'blog_revision', activo: false }, socio))).toBe(true)
    expect(m.savePrefs).toHaveBeenCalledWith(
      'chat:7000034600111222',
      expect.objectContaining({ reglas: { blog_revision: { activo: false } } })
    )
  })

  it('no hay canal común: todo va por WhatsApp, así que destino="comun" se rechaza', async () => {
    expect(ok(await runNotificationTool('avisos_auto_cambiar', { destino: 'comun', aviso: 'lead_nuevo', modo: 'resumen', hora: '9' }, socio))).toBe(false)
  })

  it('desde Telegram no tiene configuración personal', async () => {
    const tg = { ...socio, ownerKey: null }
    expect(ok(await runNotificationTool('avisos_auto_ver', {}, tg))).toBe(false)
  })

  it('«todos» con un filtro de prioridad solo se aplica a los avisos que lo admiten', async () => {
    await runNotificationTool('avisos_auto_cambiar', { aviso: 'todos', prioridad_min: 'alta' }, socio)
    const prefs = m.saved.get(socio.ownerKey) as { reglas: Record<string, unknown> }
    // Los avisos con filtro de prioridad: el de ticket nuevo y su recordatorio diario
    expect(Object.keys(prefs.reglas)).toEqual(['ticket_nuevo', 'recordatorio_ticket'])
  })

  it('horas de silencio, pausa y estilo, con validación', async () => {
    expect(ok(await runNotificationTool('avisos_auto_general', { silencio_desde: '21', silencio_hasta: '8' }, socio))).toBe(true)
    expect((m.saved.get(socio.ownerKey) as { silencio: unknown }).silencio).toEqual({ desde: '21:00', hasta: '08:00' })
    expect(ok(await runNotificationTool('avisos_auto_general', { pausa_hasta: '2000-01-01T00:00:00Z' }, socio))).toBe(false)
    expect(ok(await runNotificationTool('avisos_auto_general', { silencio_desde: 'pronto', silencio_hasta: '8' }, socio))).toBe(false)
  })
})

describe('equipo', () => {
  it('solo cambia los suyos: aunque pida el canal común, se guarda en su usuario', async () => {
    await runNotificationTool('avisos_auto_cambiar', { destino: 'comun', aviso: 'tarea_asignada', activo: false }, dev)
    expect(m.savePrefs).toHaveBeenCalledWith('user:5', expect.anything())
    expect(m.saved.has('comun')).toBe(false)
  })

  it('no puede tocar avisos de los socios ni usar otro canal que su WhatsApp', async () => {
    expect(ok(await runNotificationTool('avisos_auto_cambiar', { aviso: 'lead_nuevo', activo: true }, dev))).toBe(false)
    expect(ok(await runNotificationTool('avisos_auto_cambiar', { aviso: 'ticket_asignado', canales: ['email'] }, dev))).toBe(false)
    expect(m.savePrefs).not.toHaveBeenCalled()
  })

  it('sus herramientas no tienen destino y solo listan sus avisos', () => {
    const cambiar = notificationTools('equipo').find((t) => t.function.name === 'avisos_auto_cambiar')!
    const props = (cambiar.function.parameters as { properties: Record<string, { enum?: string[] }> }).properties
    expect(props.destino).toBeUndefined()
    expect(props.aviso.enum).toEqual([
      'ticket_asignado',
      'incidencia_mi_proyecto',
      'tarea_asignada',
      'recordatorio_incidencia_equipo',
      'recordatorio_ticket_equipo',
      'recordatorio_tarea',
      'tarea_movida',
      'tarea_vence',
      'todos',
    ])
  })
})
