import type { GetServerSideProps } from 'next'
import { getActiveFormBySlug } from '@/lib/onboarding/public-forms'
import { preparePublicFormDocument } from '@/lib/onboarding/prepare-public-form-html'

/**
 * Sirve el HTML del formulario como documento completo (no dentro de React).
 * Así se respetan <html>/<head>/<style>/<script> y cualquier HTML pegado.
 * Sin Layout ni auth CRM.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const slug = typeof ctx.params?.slug === 'string' ? ctx.params.slug.trim().toLowerCase() : ''
  const res = ctx.res

  if (!slug) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>No encontrado</title></head><body><p>Formulario no encontrado.</p></body></html>'
    )
    return { props: {} }
  }

  try {
    const form = await getActiveFormBySlug(slug)
    if (!form) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.setHeader('X-Robots-Tag', 'noindex, nofollow')
      res.end(
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="robots" content="noindex,nofollow"/><title>No disponible</title></head><body style="font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#6b7280"><p>Formulario no disponible.</p></body></html>'
      )
      return { props: {} }
    }

    const documentHtml = preparePublicFormDocument(form.html, form.slug, form.title)
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    res.setHeader('Cache-Control', 'private, no-store')
    res.end(documentHtml)
    return { props: {} }
  } catch (error) {
    console.error('[f/slug]', error)
    res.statusCode = 500
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Error</title></head><body style="font-family:system-ui;padding:2rem"><p>Error al cargar el formulario.</p></body></html>'
    )
    return { props: {} }
  }
}

export default function PublicOnboardingFormPage() {
  return null
}
