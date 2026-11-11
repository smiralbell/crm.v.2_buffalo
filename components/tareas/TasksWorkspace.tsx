import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ExternalLink, FolderKanban, ListTodo, Loader2 } from 'lucide-react'
import ProjectTaskBoard, { VIEW_TABS, type TasksView } from '@/components/gestion-proyecto/ProjectTaskBoard'
import {
  jsonInit,
  projectTaskClient,
  requestJson,
  type TaskBoardClient,
  type TaskCreateTarget,
} from '@/components/gestion-proyecto/task-board-client'
import TaskFiltersBar from '@/components/tareas/TaskFiltersBar'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ProjectTask } from '@/lib/gestion-proyecto/types'
import {
  EMPTY_FILTERS,
  applyTaskFilters,
  mergeVisibleTasks,
  type TaskFilterState,
} from '@/lib/tareas/filters'
import { canDeleteWorkTask } from '@/lib/tareas/permissions'
import type { TareasResponse, WorkTask } from '@/lib/tareas/types'

interface Props {
  /** Admin, desde la ficha de un usuario: solo las tareas de esa persona */
  scopeUserId?: number
  /** Para recordar filtros y vista de cada sitio por separado */
  storageKey: string
}

interface Prefs {
  filters: TaskFilterState
  view: TasksView
}

const TASK_VIEWS: TasksView[] = ['board', 'calendar', 'gantt']

function readPrefs(key: string): Prefs {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as Partial<Prefs>) : {}
    return {
      filters: { ...EMPTY_FILTERS, ...(parsed.filters ?? {}) },
      view: parsed.view && TASK_VIEWS.includes(parsed.view) ? parsed.view : 'board',
    }
  } catch {
    return { filters: EMPTY_FILTERS, view: 'board' }
  }
}

function writePrefs(key: string, prefs: Prefs) {
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs))
  } catch {
    // sin almacenamiento: no pasa nada
  }
}

const toNumber = (v: unknown) => (v == null ? null : Number(v))

/** Módulo Tareas: tareas sueltas de la persona y las de sus proyectos, en el tablero de proyecto. */
export default function TasksWorkspace({ scopeUserId, storageKey }: Props) {
  const [data, setData] = useState<TareasResponse | null>(null)
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS)
  const [view, setView] = useState<TasksView>('board')
  const restored = useRef(false)
  const prefsKey = `${storageKey}:prefs`

  // Filtros y vista recordados en este navegador
  useEffect(() => {
    const prefs = readPrefs(prefsKey)
    setFilters({ ...prefs.filters, person: 'all', hideDone: false })
    setView(prefs.view)
    restored.current = true
  }, [prefsKey])

  useEffect(() => {
    if (restored.current) writePrefs(prefsKey, { filters, view })
  }, [filters, view, prefsKey])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const url = scopeUserId ? `/api/tareas?user_id=${scopeUserId}` : '/api/tareas'
      const res = await requestJson<TareasResponse>(url, { method: 'GET' }, 'No se pudieron cargar las tareas')
      setData(res)
      setTasks(res.tasks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [scopeUserId])

  useEffect(() => {
    void load()
  }, [load])

  const projectNames = useMemo(
    () => new Map((data?.projects ?? []).map((p) => [p.id, p.name])),
    [data]
  )

  /** Cada tarea se guarda donde vive: las sueltas en /api/tareas, las de proyecto en su proyecto. */
  const client = useMemo<TaskBoardClient>(() => {
    const isPersonal = (task: ProjectTask) => (task as WorkTask).source === 'personal'
    return {
      create: async (target, body) => {
        if (target.startsWith('user:')) {
          const { assignee: _assignee, ...rest } = body
          return requestJson<WorkTask>(
            '/api/tareas',
            jsonInit('POST', { ...rest, user_id: Number(target.slice('user:'.length)) }),
            'No se pudo crear la tarea'
          )
        }
        const projectId = target.slice('project:'.length)
        const created = await projectTaskClient(projectId).create(target, body)
        const work: WorkTask = {
          ...created,
          estimated_hours: toNumber(created.estimated_hours),
          source: 'project',
          project_name: projectNames.get(projectId) ?? null,
          owner_user_id: null,
          created_by_id: null,
          created_by_name: null,
        }
        return work
      },
      update: async (task, body) => {
        if (isPersonal(task)) {
          return requestJson<WorkTask>(`/api/tareas/${task.id}`, jsonInit('PATCH', body), 'No se pudo actualizar')
        }
        const updated = await projectTaskClient(task.project_id).update(task, body)
        return { ...updated, estimated_hours: toNumber(updated.estimated_hours) }
      },
      remove: async (task) => {
        if (isPersonal(task)) {
          await requestJson(`/api/tareas/${task.id}`, { method: 'DELETE' }, 'No se pudo eliminar')
          return
        }
        await projectTaskClient(task.project_id).remove(task)
      },
      uploadAttachments: async (task, files) =>
        isPersonal(task) ? [] : projectTaskClient(task.project_id).uploadAttachments(task, files),
      attachmentUrl: (task, attId) => projectTaskClient(task.project_id).attachmentUrl(task, attId),
    }
  }, [projectNames])

  const visible = useMemo(() => applyTaskFilters(tasks, filters), [tasks, filters])

  // El tablero devuelve la lista filtrada cambiada; se junta con la completa.
  const onBoardChange = useCallback(
    (next: WorkTask[]) => {
      setTasks((prev) => mergeVisibleTasks(prev, applyTaskFilters(prev, filters), next))
    },
    [filters]
  )

  const me = data?.me
  const scope = data?.scope_user ?? null
  const viewingSelf = !!scope && !!me && scope.id === me.id
  const adminOverview = me?.role === 'admin' && !scope

  const createTargets = useMemo<TaskCreateTarget[]>(() => {
    if (!data) return []
    const personal: TaskCreateTarget[] = scope
      ? [
          {
            id: `user:${scope.id}`,
            label: viewingSelf ? 'Tarea suelta (mía)' : `Tarea suelta para ${scope.name}`,
            group: 'Sin proyecto',
          },
        ]
      : data.people.map((p) => ({ id: `user:${p.id}`, label: p.name, group: 'Tarea suelta para…' }))
    const projects: TaskCreateTarget[] = data.projects.map((p) => ({
      id: `project:${p.id}`,
      label: p.name,
      group: 'En un proyecto',
      assignable: true,
      attachments: true,
    }))
    return [...personal, ...projects]
  }, [data, scope, viewingSelf])

  const viewer = { id: me?.id ?? -1, role: me?.role ?? '' }

  return (
    <div className="min-w-0 space-y-4">
      <TaskFiltersBar
        filters={filters}
        onChange={setFilters}
        projects={data?.projects ?? []}
        total={tasks.length}
        shown={visible.length}
        trailing={
          <div className="inline-flex h-10 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon
              const active = view === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  title={tab.label}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                    active ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{tab.label}</span>
                </button>
              )
            })}
          </div>
        }
      />

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : error && !data ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
              {error}
            </div>
          )}
          <ProjectTaskBoard<WorkTask>
            tasks={visible}
            onChange={onBoardChange}
            client={client}
            view={view}
            onViewChange={setView}
            hideViewSwitcher
            createTargets={createTargets}
            defaultCreateTarget={scope ? `user:${scope.id}` : undefined}
            canDelete={(task) => canDeleteWorkTask(viewer, task)}
            emptyColumnText={tasks.length > 0 && visible.length === 0 ? 'Nada con estos filtros' : 'Sin tareas'}
            renderCardContext={(task) => <TaskOrigin task={task} showOwner={adminOverview} />}
            renderDialogContext={(task) => <TaskOriginDetail task={task} />}
          />
        </>
      )}
    </div>
  )
}

/** Quién puso la tarea suelta, si no fue la propia persona. */
function assignedBy(task: WorkTask): string | null {
  return task.created_by_name && task.created_by_id !== task.owner_user_id ? task.created_by_name : null
}

function TaskOrigin({ task, showOwner }: { task: WorkTask; showOwner: boolean }) {
  if (task.source === 'project') {
    return (
      <span className="inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-indigo-700">
        <FolderKanban className="h-3 w-3 shrink-0" />
        <span className="truncate">{task.project_name || 'Proyecto'}</span>
      </span>
    )
  }
  const by = assignedBy(task)
  return (
    <span className="inline-flex max-w-full items-center gap-1 text-[11px] font-medium text-gray-500">
      <ListTodo className="h-3 w-3 shrink-0" />
      <span className="truncate">
        Tarea suelta
        {showOwner && task.assignee ? ` · ${task.assignee}` : ''}
        {!showOwner && by ? ` · de ${by}` : ''}
      </span>
    </span>
  )
}

function TaskOriginDetail({ task }: { task: WorkTask }) {
  if (task.source === 'project') {
    return (
      <Link
        href={`/gestion-proyecto/proyectos/${task.project_id}?tab=tareas`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
      >
        <FolderKanban className="h-4 w-4" />
        {task.project_name || 'Proyecto'}
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    )
  }
  const by = assignedBy(task)
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500">
      <ListTodo className="h-4 w-4" />
      Tarea suelta de <span className="font-medium text-gray-700">{task.assignee}</span>
      {by && (
        <>
          · asignada por <span className="font-medium text-gray-700">{by}</span>
        </>
      )}
    </p>
  )
}
