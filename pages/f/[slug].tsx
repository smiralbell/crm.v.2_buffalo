import Head from 'next/head'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Página pública del formulario de onboarding.
 * Sin Layout / sin sidebar / sin acceso al CRM.
 * Renderiza el HTML tal cual y captura el submit hacia /api/f/[slug].
 */
export default function PublicOnboardingFormPage() {
  const router = useRouter()
  const slug = typeof router.query.slug === 'string' ? router.query.slug : ''
  const mountRef = useRef<HTMLDivElement>(null)
  const [title, setTitle] = useState('Formulario')
  const [status, setStatus] = useState<'loading' | 'ready' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const bindForms = useCallback(
    (root: HTMLElement, formSlug: string) => {
      const forms = root.querySelectorAll('form')
      forms.forEach((form) => {
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault()
          const fd = new FormData(form)
          const payload: Record<string, unknown> = {}
          fd.forEach((value, key) => {
            if (!key) return
            if (payload[key] !== undefined) {
              const prev = payload[key]
              payload[key] = Array.isArray(prev) ? [...prev, String(value)] : [String(prev), String(value)]
            } else {
              payload[key] = typeof value === 'string' ? value : value.name
            }
          })

          const submitBtn = form.querySelector(
            'button[type="submit"], input[type="submit"]'
          ) as HTMLButtonElement | HTMLInputElement | null
          if (submitBtn) submitBtn.setAttribute('disabled', 'true')

          try {
            const res = await fetch(`/api/f/${encodeURIComponent(formSlug)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || 'No se pudo enviar')
            setStatus('done')
            setMessage(data.message || 'Formulario enviado correctamente. Gracias.')
            window.scrollTo({ top: 0, behavior: 'smooth' })
          } catch (e) {
            alert(e instanceof Error ? e.message : 'Error al enviar el formulario')
            if (submitBtn) submitBtn.removeAttribute('disabled')
          }
        })
      })
    },
    []
  )

  useEffect(() => {
    if (!router.isReady || !slug) return
    let cancelled = false

    ;(async () => {
      setStatus('loading')
      try {
        const res = await fetch(`/api/f/${encodeURIComponent(slug)}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Formulario no disponible')
        if (cancelled) return
        setTitle(data.title || 'Formulario')
        setStatus('ready')

        // Esperar al siguiente tick para tener el contenedor montado
        requestAnimationFrame(() => {
          const el = mountRef.current
          if (!el || cancelled) return
          el.innerHTML = String(data.html || '')
          bindForms(el, slug)
        })
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setMessage(e instanceof Error ? e.message : 'Formulario no disponible')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router.isReady, slug, bindForms])

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {status === 'loading' && (
        <div className="min-h-screen flex items-center justify-center bg-white text-sm text-gray-500">
          Cargando formulario…
        </div>
      )}

      {status === 'error' && (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
          <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            {message || 'Formulario no disponible'}
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
          <div className="max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
            <p className="text-base font-semibold text-emerald-900">Enviado</p>
            <p className="mt-2 text-sm text-emerald-800">{message}</p>
          </div>
        </div>
      )}

      {status === 'ready' && (
        <div className="min-h-screen bg-white">
          <div ref={mountRef} className="buffalo-public-form" />
        </div>
      )}
    </>
  )
}

// Sin getServerSideProps de auth → página pública aislada del CRM.
