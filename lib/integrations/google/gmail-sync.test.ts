import { describe, expect, it } from 'vitest'
import { displayName, extractEmails, stripQuotedReply } from './gmail-sync'

describe('gmail-sync parsing', () => {
  it('extrae emails únicos en minúsculas de cabeceras To/Cc', () => {
    expect(extractEmails('"Ana Pérez" <Ana@Cliente.es>, bob@x.com, ana@cliente.es')).toEqual([
      'ana@cliente.es',
      'bob@x.com',
    ])
  })

  it('saca el nombre del remitente o cae al email', () => {
    expect(displayName('"Ana Pérez" <ana@cliente.es>')).toBe('Ana Pérez')
    expect(displayName('ana@cliente.es')).toBe('ana@cliente.es')
  })

  it('corta el hilo citado en español e inglés', () => {
    const es = 'Perfecto, lo vemos el jueves.\n\nEl lun, 1 sept 2026 a las 10:00, Sergi <s@agenciabuffalo.es> escribió:\n> propuesta'
    expect(stripQuotedReply(es)).toBe('Perfecto, lo vemos el jueves.')
    const en = 'Sounds good\nOn Mon, Sep 1, 2026 at 10:00 AM Sergi wrote:\n> hi'
    expect(stripQuotedReply(en)).toBe('Sounds good')
  })
})
