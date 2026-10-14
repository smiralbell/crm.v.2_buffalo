import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuth } from '@/components/AuthContext'
import DeveloperDataGuide from '@/components/engranaje5/DeveloperDataGuide'
import IncidentsPanel from '@/components/retencion/IncidentsPanel'
import WatchSystemPanel from '@/components/retencion/WatchSystemPanel'
import { ArrowLeft, AlertCircle, Link2, Clock } from 'lucide-react'
import type { ProyectoRow } from '@/lib/engranaje5/project-services'
import type { ProjectServiceFlags } from '@/lib/engranaje5/data-column-guide'

type Tab = 'incidencias' | 'sistema' | 'guia'

const TABS: { id: Tab; label: string }[] = [
  { id: 'incidencias', label: 'Incidencias' },
  { id: 'sistema', label: 'Sistema' },
  { id: 'guia', label: 'Guía de desarrollo' },
]

function isValidTab(v: unknown): v is Tab {
  return v === 'incidencias' || v === 'sistema' || v === 'guia'
}

export default function RetencionProyectoDetailPage() {
  const router = useRouter()
  const { loading: authLoading } = useAuth()
  const { id, tab: urlTab } = router.query

  const [activeTab, setActiveTab] = useState<Tab>('incidencias')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proyecto, setProyecto] = useState<ProyectoRow | null>(null)
  const [services, setServices] = useState<ProjectServiceFlags | null>(null)
  const [webhookOpen, setWebhookOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [intervalLabel, setIntervalLabel] = useState('Frecuencia')

  useEffect(() => {
    if (!router.isReady || authLoading) return
    setActiveTab(isValidTab(urlTab) ? urlTab : 'incidencias')
  }, [router.isReady, urlTab, authLoading])

  const load = useCallback(async () => {
    if (!id || typeof id !== 'string') return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setProyecto(data.proyecto)
      setServices(data.services)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (router.isReady && id) void load()
  }, [router.isReady, id, load])

  const switchTab = (tab: Tab) => {
    setActiveTab(tab)
    if (typeof id === 'string') {
      void router.replace(`/retencion/proyectos/${id}?tab=${tab}`, undefined, { shallow: true })
    }
  }

  const sistema = activeTab === 'sistema'

  return (
    <Layout>
      <div className={`w-full ${sistema ? 'flex h-[calc(100dvh-8.5rem)] flex-col md:h-[calc(100dvh-6.25rem)] md:-my-7 md:pt-7' : 'space-y-4 pb-12'}`}>
        {proyecto && (
          <div className="relative flex shrink-0 items-center justify-center gap-1 border-b border-gray-200 bg-transparent">
            <Link
              href="/retencion"
              className="absolute left-0 top-1/2 -translate-y-1/2 mb-px inline-flex items-center justify-center w-8 h-8 text-gray-400 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors"
              aria-label="Volver a retención"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="absolute left-10 top-1/2 -translate-y-1/2 hidden sm:block max-w-[220px] truncate text-sm font-medium text-gray-600">
              {proyecto.name}
            </div>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                    border-b-2 -mb-px transition-colors rounded-t-lg
                    ${isActive
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  {tab.label}
                </button>
              )
            })}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 mb-px">
              {activeTab === 'incidencias' && (
                <button
                  type="button"
                  onClick={() => setWebhookOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  <Link2 className="h-4 w-4" />
                  Webhook
                </button>
              )}
              {activeTab === 'sistema' && (
                <button
                  type="button"
                  onClick={() => setScheduleOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
                >
                  <Clock className="h-4 w-4" />
                  {intervalLabel}
                </button>
              )}
            </div>
          </div>
        )}

        {loading && !proyecto && (
          <div className="py-20 text-center text-sm text-gray-400">Cargando proyecto…</div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {proyecto && activeTab === 'incidencias' && (
          <IncidentsPanel
            proyectoId={proyecto.id}
            proyectoName={proyecto.name}
            webhookOpen={webhookOpen}
            onWebhookOpenChange={setWebhookOpen}
          />
        )}

        {proyecto && activeTab === 'sistema' && (
          <div className="min-h-0 flex-1 pt-3">
            <WatchSystemPanel
              proyectoId={proyecto.id}
              onGoIncidents={() => switchTab('incidencias')}
              scheduleOpen={scheduleOpen}
              onScheduleOpenChange={setScheduleOpen}
              onIntervalLabel={setIntervalLabel}
            />
          </div>
        )}

        {proyecto && services && activeTab === 'guia' && (
          <DeveloperDataGuide projectId={proyecto.id} flags={services} />
        )}
      </div>
    </Layout>
  )
}
