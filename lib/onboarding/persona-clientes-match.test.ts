import { describe, expect, it } from 'vitest'
import { normalizeClientName, pickClientFolder } from './persona-clientes-match'

describe('normalizeClientName', () => {
  it('quita acentos, puntuación y sufijos de sociedad', () => {
    expect(normalizeClientName('AISF PARTNERS S.L.')).toBe('aisf partners')
    expect(normalizeClientName('Préstamos Ñandú, S.A.')).toBe('prestamos nandu')
  })
})

describe('pickClientFolder', () => {
  const folders = [
    { id: '1', name: 'GLS' },
    { id: '2', name: 'AISF PARTNERS S.L.' },
    { id: '3', name: 'MARTA…' },
    { id: '4', name: 'VICENTE ELIAS Y…' },
  ]

  it('usa la carpeta con el mismo nombre normalizado', () => {
    expect(pickClientFolder('Aisf Partners', folders)).toEqual({ folder: folders[1], matchedBy: 'exacto' })
  })

  it('reconoce nombres truncados por Drive', () => {
    expect(pickClientFolder('Marta García López', folders)).toEqual({ folder: folders[2], matchedBy: 'prefijo' })
  })

  it('no adivina si no hay coincidencia: devuelve null para crear', () => {
    expect(pickClientFolder('Nueva Empresa SL', folders)).toEqual({ folder: null, matchedBy: 'creada' })
  })

  it('no usa un prefijo demasiado corto', () => {
    const corto = [{ id: '9', name: 'AB…' }]
    expect(pickClientFolder('Abogados Unidos', corto).folder).toBeNull()
  })

  it('se niega a elegir si hay carpetas duplicadas', () => {
    const dup = [
      { id: '1', name: 'GLS' },
      { id: '2', name: 'GLS' },
    ]
    expect(() => pickClientFolder('GLS', dup)).toThrow(/2 carpetas/)
  })
})
