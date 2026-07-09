import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import ProjectOnboardingPanel from '@/components/gestion-proyecto/ProjectOnboardingPanel'
import ProjectTaskBoard from '@/components/gestion-proyecto/ProjectTaskBoard'
import ProjectDashboard from '@/components/gestion-proyecto/ProjectDashboard'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import type { ProjectDoc, ProjectOnboarding, ProjectTask } from '@/lib/gestion-proyecto/types'

type Tab = 'dashboard' | 'onboarding' | 'tareas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'tareas', label: 'Tareas' },
]

export default function GestionProyectoDetailPage() {
  const router = useRouter()
  const { id, tab: urlTab } = router.query
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proyecto, setProyecto] = useState<{
    id: string
    name: string
    service_type: string
    status: string
    config_ref: string | null
  } | null>(null)
  const [onboarding, setOnboarding] = useState<ProjectOnboarding | null>(null)
  const [docs, setDocs] = useState<ProjectDoc[]>([])
  const [tasks, setTasks] = useState<ProjectTask[]>([])

  useEffect(() => {
    if (!router.isReady) return
    if (urlTab === 'tareas') setActiveTab('tareas')
    else if (urlTab === 'onboarding') setActiveTab('onboarding')
    else setActiveTab('dashboard')
  }, [router.isReady, urlTab])

  const load = useCallback(async () => {
    if (!id || typeof id !== 'string') return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.hint || 'Error al cargar')
      setProyecto(data.proyecto)
      setOnboarding(data.onboarding)
      setDocs(data.docs || [])
      setTasks(
        (data.tasks || []).map((t: ProjectTask) => ({
          ...t,
          estimated_hours: t.estimated_hours ?? null,
        }))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (router.isReady && id) load()
  }, [router.isReady, id, load])

  const switchTab = (tab: Tab) => {
    setActiveTab(tab)
    if (typeof id === 'string') {
      router.replace(`/gestion-proyecto/proyectos/${id}?tab=${tab}`, undefined, { shallow: true })
    }
  }

  return (
    <Layout>
      <div className="w-full max-w-7xl mx-auto space-y-3 pb-8 -mt-4 lg:-mt-5">
        {proyecto && (
          <div className="sticky top-0 z-10 -mx-1 relative flex items-center justify-center border-b border-gray-200 bg-[#f7f8fa] pb-0 pt-0 min-h-[40px]">
            <Link
              href="/gestion-proyecto"
              className="absolute left-0 inline-flex shrink-0 items-center justify-center w-8 h-8 text-gray-500 rounded-lg hover:bg-white hover:text-gray-900 transition-colors"
              title="Volver"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-0.5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando...</div>
        ) : proyecto ? (
          activeTab === 'dashboard' ? (
            <ProjectDashboard projectId={proyecto.id} />
          ) : activeTab === 'onboarding' && onboarding ? (
            <ProjectOnboardingPanel
              projectId={proyecto.id}
              onboarding={onboarding}
              docs={docs}
              onOnboardingChange={setOnboarding}
              onDocsChange={setDocs}
            />
          ) : activeTab === 'tareas' ? (
            <ProjectTaskBoard projectId={proyecto.id} tasks={tasks} onChange={setTasks} />
          ) : null
        ) : null}
      </div>
    </Layout>
  )
}
