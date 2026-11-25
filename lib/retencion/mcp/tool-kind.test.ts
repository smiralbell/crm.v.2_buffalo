import { describe, expect, it } from 'vitest'
import { toolKind } from './readonly'

describe('toolKind', () => {
  it('lectura cuando declara readOnlyHint y el nombre es de consulta', () => {
    expect(toolKind({ name: 'listar_llamadas', annotations: { readOnlyHint: true } })).toBe('lectura')
    expect(toolKind({ name: 'get_schedule', annotations: { readOnlyHint: true } })).toBe('lectura')
  })
  it('escritura cuando no declara solo lectura o el nombre escribe', () => {
    expect(toolKind({ name: 'crear_cita' })).toBe('escritura')
    expect(toolKind({ name: 'send_email', annotations: { readOnlyHint: true } })).toBe('escritura')
  })
  it('eliminar cuando es destructiva o el nombre borra', () => {
    expect(toolKind({ name: 'borrar_lead' })).toBe('eliminar')
    expect(toolKind({ name: 'reset', annotations: { destructiveHint: true } })).toBe('eliminar')
  })
})
