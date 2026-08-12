import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import NotebookWorkspace from '@/components/onboarding/notes/NotebookWorkspace'
import { ChevronLeft } from 'lucide-react'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'

export default function NotasPage() {
  const router = useRouter()
  const leadParam = router.query.lead
  const leadId =
    typeof leadParam === 'string' ? parseInt(leadParam, 10) : NaN

  const [meta, setMeta] = useState<{
    clientLabel: string
    projectTitle: string | null
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!router.isReady) return
    if (!Number.isFinite(leadId) || leadId <= 0) {
      setError('Falta el parámetro lead')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/onboarding/projects/${leadId}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Lead no encontrado')
        if (cancelled) return
        const nombre =
          (typeof router.query.nombre === 'string' && router.query.nombre) ||
          data.lead?.contact?.nombre ||
          data.contact?.nombre ||
          ''
        const empresa =
          (typeof router.query.empresa === 'string' && router.query.empresa) ||
          data.lead?.contact?.empresa ||
          data.contact?.empresa ||
          ''
        const cfg = parseConfiguradorConfig(
          data.lead?.configuracion || data.configuracion || null
        )
        setMeta({
          clientLabel: [empresa, nombre].filter(Boolean).join(' · ') || `Lead #${leadId}`,
          projectTitle: cfg?.title || data.proyecto?.name || null,
        })
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error cargando el lead')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router.isReady, leadId, router.query.nombre, router.query.empresa])

  return (
    <Layout>
      <div className="-m-3 sm:-m-6 lg:-mx-8 lg:-my-7 flex h-[calc(100dvh-3.5rem)] md:h-[100dvh] flex-col">
        <div className="shrink-0 px-3 pt-2 pb-0 sm:px-4">
          <Link
            href="/onboarding?tab=projects"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Onboarding
          </Link>
        </div>
        <div className="min-h-0 flex-1">
          {error ? (
            <div className="p-8 text-sm text-red-600">{error}</div>
          ) : !meta || !Number.isFinite(leadId) ? (
            <div className="p-8 text-sm text-muted-foreground">Cargando…</div>
          ) : (
            <NotebookWorkspace
              leadId={leadId}
              clientLabel={meta.clientLabel}
              projectTitle={meta.projectTitle}
            />
          )}
        </div>
      </div>
    </Layout>
  )
}
