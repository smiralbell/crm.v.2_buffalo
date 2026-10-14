import { describe, expect, it } from 'vitest'
import {
  extraFormFields,
  isWebFormEmpty,
  normalizeWebFormPayload,
} from '@/lib/marketing/web-form-submissions.types'

describe('webhook de formularios', () => {
  it('lee site, page y campos de form', () => {
    const p = normalizeWebFormPayload({
      site: 'agenciabuffalo.es',
      page: '/contacto',
      form: { nombre: 'Ana', email: 'ana@x.com', mensaje: 'Hola' },
    })
    expect(p.site).toBe('agenciabuffalo.es')
    expect(p.page).toBe('/contacto')
    expect(p.cuerpo?.fullname).toBe('Ana')
    expect(p.cuerpo?.email).toBe('ana@x.com')
    expect(extraFormFields(p.cuerpo).some((f) => f.key === 'mensaje')).toBe(true)
  })

  it('acepta campos planos y pagina en español', () => {
    const p = normalizeWebFormPayload({
      site: 'formacion.agenciabuffalo.es',
      pagina: '/diagnostico',
      nombre: 'Luis',
      email: 'luis@x.com',
    })
    expect(p.site).toBe('formacion.agenciabuffalo.es')
    expect(p.page).toBe('/diagnostico')
    expect(p.cuerpo?.fullname).toBe('Luis')
  })

  it('sigue leyendo el JSON viejo de n8n { cuerpo, etiqueta }', () => {
    const p = normalizeWebFormPayload({
      etiqueta: 'contacto',
      cuerpo: { fullname: 'Eva', email: 'eva@x.com', page_url: 'https://agenciabuffalo.es/contacto' },
    })
    expect(p.etiqueta).toBe('contacto')
    expect(p.site).toBe('agenciabuffalo.es')
    expect(p.cuerpo?.email).toBe('eva@x.com')
  })

  it('detecta envío vacío', () => {
    expect(isWebFormEmpty(normalizeWebFormPayload({ site: 'x.es', page: '/' }))).toBe(true)
    expect(isWebFormEmpty(normalizeWebFormPayload({ site: 'x.es', form: { email: 'a@b.c' } }))).toBe(false)
  })
})
