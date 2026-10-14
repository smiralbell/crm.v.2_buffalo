import { describe, expect, it } from 'vitest'
import { normalizeEmail, phoneKey, phoneTail, samePhone, toE164 } from '@/lib/identity/normalize'
import { normalizePhoneNumber } from '@/lib/demos/phone'
import { normalizePhoneDigits } from '@/lib/coldcall/import-duplicate-check'

describe('identidad: teléfono', () => {
  it('móvil español sin prefijo → +34 (antes demos devolvía +612…)', () => {
    expect(toE164('612 34 56 78')).toBe('+34612345678')
    expect(normalizePhoneNumber('612345678')).toBe('+34612345678')
  })

  it('respeta el prefijo que venga', () => {
    expect(toE164('+34 612 345 678')).toBe('+34612345678')
    expect(toE164('+44 7700 900123')).toBe('+447700900123')
    expect(toE164('34612345678')).toBe('+34612345678')
  })

  it('«00» inicial es prefijo internacional', () => {
    expect(toE164('0034612345678')).toBe('+34612345678')
  })

  it('rechaza basura', () => {
    expect(toE164('')).toBeNull()
    expect(toE164('abc')).toBeNull()
    expect(toE164('12345')).toBeNull()
  })

  it('clave de cold calling: mismo resultado que antes', () => {
    expect(normalizePhoneDigits('612 345 678')).toBe('34612345678')
    expect(normalizePhoneDigits('+34 612345678')).toBe('34612345678')
    expect(normalizePhoneDigits('0034612345678')).toBe('34612345678')
    expect(normalizePhoneDigits('12345678')).toBeNull()
    expect(phoneKey(null)).toBeNull()
  })

  it('compara números escritos de formas distintas', () => {
    expect(samePhone('612345678', '+34 612 34 56 78')).toBe(true)
    expect(samePhone('612345678', '612345679')).toBe(false)
    expect(phoneTail('+34612345678')).toBe('612345678')
  })
})

describe('identidad: email', () => {
  it('normaliza mayúsculas y espacios', () => {
    expect(normalizeEmail('  Ana@Ejemplo.COM ')).toBe('ana@ejemplo.com')
  })
  it('descarta lo que no es un email', () => {
    expect(normalizeEmail('ana')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
  })
})
