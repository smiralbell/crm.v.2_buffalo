import { describe, expect, it } from 'vitest'
import { normalizeWebFormPayload, parseWebFormSubmission } from '@/lib/marketing/web-form-submissions.types'

const meta = { estado: 'pendiente', notas: null, responded_at: null, created_at: '2026-10-14T10:00:00.000Z' }

describe('webhook de formularios: site + page + form', () => {
  it('formato nuevo: site, page y form con nombres en español', () => {
    const n = normalizeWebFormPayload({
      site: 'agenciabuffalo.es',
      page: '/contacto',
      form: { nombre: 'Ana', email: 'ana@x.com', telefono: '612345678', empresa: 'Acme' },
    })
    expect(n.site).toBe('agenciabuffalo.es')
    expect(n.page).toBe('/contacto')
    expect(n.cuerpo).toMatchObject({
      fullname: 'Ana',
      email: 'ana@x.com',
      phone: '612345678',
      company: 'Acme',
      page_url: 'https://agenciabuffalo.es/contacto',
    })
  })

  it('campos planos + website', () => {
    const n = normalizeWebFormPayload({
      website: 'formacion.agenciabuffalo.es',
      page: '/diagnostico',
      nombre: 'Luis',
      correo: 'luis@y.com',
    })
    expect(n.site).toBe('formacion.agenciabuffalo.es')
    expect(n.cuerpo?.fullname).toBe('Luis')
    expect(n.cuerpo?.email).toBe('luis@y.com')
  })

  it('formato viejo de n8n { cuerpo, etiqueta } sigue valiendo', () => {
    const n = normalizeWebFormPayload({
      etiqueta: 'footer',
      cuerpo: { fullname: 'Eva', email: 'eva@z.com', page_url: 'https://agenciabuffalo.es/agentes' },
    })
    expect(n.etiqueta).toBe('footer')
    expect(n.site).toBe('agenciabuffalo.es')
    expect(n.page).toBe('/agentes')
    expect(n.cuerpo?.email).toBe('eva@z.com')
  })

  it('saca el dominio de la URL si no viene site', () => {
    const n = normalizeWebFormPayload({
      form: { email: 'a@b.c', page_url: 'https://www.agenciabuffalo.es/agentes?utm_source=meta' },
    })
    expect(n.site).toBe('agenciabuffalo.es')
    expect(n.page).toBe('/agentes?utm_source=meta')
  })

  it('etiqueta puede ir dentro del form', () => {
    const n = normalizeWebFormPayload({
      site: 'agenciabuffalo.es',
      page: '/',
      form: { email: 'a@b.c', etiqueta: 'footer' },
    })
    expect(n.etiqueta).toBe('footer')
  })

  it('parsea site/page en la fila del listado', () => {
    const row = parseWebFormSubmission(
      1,
      { site: 'agenciabuffalo.es', page: '/contacto', form: { nombre: 'Ana', email: 'ana@x.com' } },
      meta
    )
    expect(row.site).toBe('agenciabuffalo.es')
    expect(row.page).toBe('/contacto')
    expect(row.fullname).toBe('Ana')
    expect(row.email).toBe('ana@x.com')
  })
})
