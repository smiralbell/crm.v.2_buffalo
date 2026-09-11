import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import ProjectTaskBoard, {
  type TasksView,
} from '@/components/gestion-proyecto/ProjectTaskBoard'
import ProjectDashboard from '@/components/gestion-proyecto/ProjectDashboard'
import { ArrowLeft, AlertCircle, CalendarDays, GanttChart, Kanban } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectTask } from '@/lib/gestion-proyecto/types'

type Tab = 'dashboard' | 'tareas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'tareas', label: 'Tareas' },
]

const TASK_VIEWS: { id: TasksView; label: string; icon: typeof Kanban }[] = [
  { id: 'board', label: 'Tablero', icon: Kanban },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'gantt', label: 'Gantt', icon: GanttChart },
]

export default function GestionProyectoDetailPage() {
  const router = useRouter()
  const { id, tab: urlTab, view: urlView } = router.query
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [tasksView, setTasksView] = useState<TasksView>('board')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proyecto, setProyecto] = useState<{
    id: string
    name: string
    service_type: string
    status: string
    config_ref: string | null
    lead_id: number | null
  } | null>(null)
  const [tasks, setTasks] = useState<ProjectTask[]>([])

  useEffect(() => {
    if (!router.isReady) return
    if (urlTab === 'tareas') setActiveTab('tareas')
    else setActiveTab('dashboard')

    const v = Array.isArray(urlView) ? urlView[0] : urlView
    if (v === 'calendar' || v === 'gantt' || v === 'board') setTasksView(v)
  }, [router.isReady, urlTab, urlView])

  const load = useCallback(async () => {
    if (!id || typeof id !== 'string') return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || data.hint || 'Error al cargar')
      setProyecto(data.proyecto)
      setTasks(
        (data.tasks || []).map((t: ProjectTask) => ({
          ...t,
          estimated_hours: t.estimated_hours ?? null,
          due_date: t.due_date ?? null,
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

  useEffect(() => {
    if (!proyecto?.lead_id) return
    const lead = String(proyecto.lead_id)
    if (router.query.lead === lead) return
    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, lead },
      },
      undefined,
      { shallow: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto?.lead_id])

  const replaceQuery = (tab: Tab, view?: TasksView) => {
    if (typeof id !== 'string') return
    const q = new URLSearchParams()
    q.set('tab', tab)
    if (tab === 'tareas' && view && view !== 'board') q.set('view', view)
    if (proyecto?.lead_id) q.set('lead', String(proyecto.lead_id))
    router.replace(`/gestion-proyecto/proyectos/${id}?${q.toString()}`, undefined, {
      shallow: true,
    })
  }

  const switchTab = (tab: Tab) => {
    setActiveTab(tab)
    replaceQuery(tab, tab === 'tareas' ? tasksView : undefined)
  }

  const switchTasksView = (view: TasksView) => {
    setTasksView(view)
    setActiveTab('tareas')
    replaceQuery('tareas', view)
  }

  return (
    <Layout>
      <div className="w-full space-y-3 pb-8 -mt-4 lg:-mt-5">
        {proyecto && (
          <div className="sticky top-0 z-10 -mx-1 relative flex items-center justify-center border-b border-gray-200 bg-[#f7f8fa] min-h-[40px]">
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
                  className={cn(
                    'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    activeTab === tab.id
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-800'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'tareas' && (
              <div className="absolute right-0 flex items-center gap-0.5">
                {TASK_VIEWS.map((tab) => {
                  const Icon = tab.icon
                  const active = tasksView === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => switchTasksView(tab.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                        active
                          ? 'border-gray-900 text-gray-900'
                          : 'border-transparent text-gray-400 hover:text-gray-700'
                      )}
                      title={tab.label}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            )}
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
          ) : activeTab === 'tareas' ? (
            <ProjectTaskBoard
              projectId={proyecto.id}
              tasks={tasks}
              onChange={setTasks}
              view={tasksView}
              onViewChange={switchTasksView}
              hideViewSwitcher
            />
          ) : null
        ) : null}
      </div>
    </Layout>
  )
}
