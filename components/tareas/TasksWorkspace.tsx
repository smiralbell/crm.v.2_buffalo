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
import { PeopleFilter, PeopleSummary } from '@/components/tareas/PeopleFilter'
import {
  buildNameIndex,
  buildPersonOptions,
  filterByPeople,
  normName,
  userKey,
  type PersonKey,
} from '@/lib/tareas/people'
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
  /** Panel de admin: personas marcadas en el filtro */
  people: PersonKey[]
  /** De quién son estas preferencias (dos socios pueden usar el mismo navegador) */
  ownerId?: number | null
}

const TASK_VIEWS: TasksView[] = ['board', 'calendar', 'gantt']

function readPrefs(key: string): Prefs {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as Partial<Prefs>) : {}
    return {
      filters: { ...EMPTY_FILTERS, ...(parsed.filters ?? {}) },
      view: parsed.view && TASK_VIEWS.includes(parsed.view) ? parsed.view : 'board',
      people: Array.isArray(parsed.people) ? parsed.people.filter((k) => typeof k === 'string') : [],
      ownerId: typeof parsed.ownerId === 'number' ? parsed.ownerId : null,
    }
  } catch {
    return { filters: EMPTY_FILTERS, view: 'board', people: [], ownerId: null }
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

/** Cada cuánto se recargan las tareas con la pestaña abierta. */
const REFRESH_MS = 30_000

/** Módulo Tareas: tareas sueltas de la persona y las de sus proyectos, en el tablero de proyecto. */
export default function TasksWorkspace({ scopeUserId, storageKey }: Props) {
  const [data, setData] = useState<TareasResponse | null>(null)
  const [tasks, setTasks] = useState<WorkTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<TaskFilterState>(EMPTY_FILTERS)
  const [view, setView] = useState<TasksView>('board')
  const [selectedPeople, setSelectedPeople] = useState<PersonKey[]>([])
  const restored = useRef(false)
  /** Dueño de las preferencias leídas; se compara con quien mira al cargar */
  const savedOwner = useRef<number | null | undefined>(undefined)
  const prefsKey = `${storageKey}:prefs`

  // Filtros, vista y personas recordados en este navegador
  useEffect(() => {
    const prefs = readPrefs(prefsKey)
    setFilters({ ...prefs.filters, person: 'all', hideDone: false })
    setView(prefs.view)
    setSelectedPeople(prefs.people)
    savedOwner.current = prefs.ownerId
    restored.current = true
  }, [prefsKey])

  const meId = data?.me?.id ?? null
  useEffect(() => {
    if (restored.current) writePrefs(prefsKey, { filters, view, people: selectedPeople, ownerId: meId })
  }, [filters, view, selectedPeople, prefsKey, meId])

  // Un socio que entra por primera vez (o en un navegador que usaba otro) empieza
  // viendo sus tareas; con «Todos» o el filtro de personas ve las del resto.
  useEffect(() => {
    if (!data || !restored.current || scopeUserId) return
    const me = data.me
    if (me.role !== 'admin' || !(me.id > 0)) return
    if (savedOwner.current === me.id) return
    savedOwner.current = me.id
    setSelectedPeople([userKey(me.id)])
  }, [data, scopeUserId])

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

  // Cambios en curso (crear, mover, editar…): mientras haya alguno no se refresca,
  // para no pisar lo que se ve en pantalla antes de que el servidor responda.
  const pending = useRef(0)
  const track = useCallback(async <R,>(work: () => Promise<R>): Promise<R> => {
    pending.current += 1
    try {
      return await work()
    } finally {
      pending.current -= 1
    }
  }, [])

  /** Recarga sin spinner: lo que cambien otros (o el agente de WhatsApp) aparece solo. */
  const refresh = useCallback(async () => {
    if (pending.current > 0 || document.hidden) return
    try {
      const url = scopeUserId ? `/api/tareas?user_id=${scopeUserId}` : '/api/tareas'
      const res = await requestJson<TareasResponse>(url, { method: 'GET' }, 'No se pudieron cargar las tareas')
      if (pending.current > 0) return // empezó un cambio mientras cargaba
      setData(res)
      setTasks(res.tasks)
      setError('')
    } catch {
      // fallo puntual de red: se reintenta en el siguiente ciclo
    }
  }, [scopeUserId])

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const projectNames = useMemo(
    () => new Map((data?.projects ?? []).map((p) => [p.id, p.name])),
    [data]
  )

  /** Cada tarea se guarda donde vive: las sueltas en /api/tareas, las de proyecto en su proyecto. */
  const client = useMemo<TaskBoardClient>(() => {
    const isPersonal = (task: ProjectTask) => (task as WorkTask).source === 'personal'
    const base: TaskBoardClient = {
      create: async (target, body) => {
        if (target.startsWith('user:')) {
          const {
            assignee: _assignee,
            assignee_user_ids: _ids,
            extra_assignees: _extra,
            ...rest
          } = body
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
      uploadAttachments: async (task, files) => {
        if (!isPersonal(task)) return projectTaskClient(task.project_id).uploadAttachments(task, files)
        if (files.length === 0) return []
        const formData = new FormData()
        for (const file of files) formData.append('file', file)
        const data = await requestJson<{ attachments?: WorkTask['attachments'] }>(
          `/api/tareas/${task.id}/attachments`,
          { method: 'POST', body: formData },
          'No se pudieron subir los archivos'
        )
        return data.attachments || []
      },
      attachmentUrl: (task, attId) =>
        isPersonal(task)
          ? `/api/tareas/${task.id}/attachments/${attId}`
          : projectTaskClient(task.project_id).attachmentUrl(task, attId),
      deleteAttachment: async (task, attId) => {
        if (!isPersonal(task)) return projectTaskClient(task.project_id).deleteAttachment(task, attId)
        await requestJson(`/api/tareas/${task.id}/attachments/${attId}`, { method: 'DELETE' }, 'No se pudo quitar el archivo')
      },
    }
    return {
      create: (target, body) => track(() => base.create(target, body)),
      update: (task, body) => track(() => base.update(task, body)),
      remove: (task) => track(() => base.remove(task)),
      uploadAttachments: (task, files) => track(() => base.uploadAttachments(task, files)),
      attachmentUrl: base.attachmentUrl,
      deleteAttachment: (task, attId) => track(() => base.deleteAttachment(task, attId)),
    }
  }, [projectNames, track])

  const me = data?.me
  const scope = data?.scope_user ?? null
  const viewingSelf = !!scope && !!me && scope.id === me.id
  /** Panel de super admin: las tareas de todo el equipo */
  const adminOverview = me?.role === 'admin' && !scope

  const people = useMemo(() => data?.people ?? [], [data])
  const nameIndex = useMemo(() => buildNameIndex(people), [people])
  // El filtro de personas solo existe en el panel de admin
  const activePeople = useMemo(() => (adminOverview ? selectedPeople : []), [adminOverview, selectedPeople])

  /** Todos los filtros juntos (los de la barra y el de personas). */
  const visibleOf = useCallback(
    (list: WorkTask[]) => filterByPeople(applyTaskFilters(list, filters), activePeople, nameIndex),
    [filters, activePeople, nameIndex]
  )
  const visible = useMemo(() => visibleOf(tasks), [tasks, visibleOf])

  // Recuentos por persona con el resto de filtros aplicados (buscar, prioridad…)
  const personOptions = useMemo(
    () => (adminOverview ? buildPersonOptions(applyTaskFilters(tasks, filters), people, nameIndex) : []),
    [adminOverview, tasks, filters, people, nameIndex]
  )
  const meKey = me && me.id > 0 ? userKey(me.id) : null

  // El tablero devuelve la lista filtrada cambiada; se junta con la completa.
  const onBoardChange = useCallback(
    (next: WorkTask[]) => {
      setTasks((prev) => mergeVisibleTasks(prev, visibleOf(prev), next))
    },
    [visibleOf]
  )

  /** Admin: pasar una tarea a otra persona (suelta → dueño; de proyecto → responsable). */
  const reassign = useCallback(
    async (task: WorkTask, personId: number | null) => {
      const person = personId == null ? null : people.find((p) => p.id === personId) ?? null
      try {
        const updated = await track(async () => {
          if (task.source === 'personal') {
            if (!person) throw new Error('Elige a una persona')
            return requestJson<WorkTask>(
              `/api/tareas/${task.id}`,
              jsonInit('PATCH', { user_id: person.id }),
              'No se pudo cambiar de persona'
            )
          }
          const res = await projectTaskClient(task.project_id).update(task, { assignee: person?.name ?? null })
          return {
            ...task,
            ...res,
            estimated_hours: toNumber(res.estimated_hours),
            source: 'project' as const,
            project_name: task.project_name,
          }
        })
        setTasks((prev) =>
          prev.map((t) => (t.id === updated.id ? { ...t, ...updated, attachments: t.attachments } : t))
        )
      } catch (e) {
        alert(e instanceof Error ? e.message : 'No se pudo cambiar de persona')
      }
    },
    [people, track]
  )

  // Con una sola persona marcada, "Nueva tarea" se la pone a ella
  const singleUserTarget =
    adminOverview && activePeople.length === 1 && activePeople[0].startsWith('u:')
      ? `user:${activePeople[0].slice(2)}`
      : undefined

  const createTargets = useMemo<TaskCreateTarget[]>(() => {
    if (!data) return []
    const personal: TaskCreateTarget[] = scope
      ? [
          {
            id: `user:${scope.id}`,
            label: viewingSelf ? 'Tarea suelta (mía)' : `Tarea suelta para ${scope.name}`,
            group: 'Sin proyecto',
            attachments: true,
          },
        ]
      : data.people.map((p) => ({ id: `user:${p.id}`, label: p.name, group: 'Tarea suelta para…', attachments: true }))
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
        people={
          adminOverview ? (
            <PeopleFilter
              options={personOptions}
              selected={selectedPeople}
              onChange={setSelectedPeople}
              meKey={meKey}
            />
          ) : undefined
        }
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
          {adminOverview && (
            <PeopleSummary options={personOptions} selected={selectedPeople} onChange={setSelectedPeople} />
          )}
          <ProjectTaskBoard<WorkTask>
            tasks={visible}
            onChange={onBoardChange}
            client={client}
            view={view}
            onViewChange={setView}
            hideViewSwitcher
            createTargets={createTargets}
            defaultCreateTarget={scope ? `user:${scope.id}` : singleUserTarget}
            canDelete={(task) => canDeleteWorkTask(viewer, task)}
            emptyColumnText={tasks.length > 0 && visible.length === 0 ? 'Nada con estos filtros' : 'Sin tareas'}
            renderCardContext={(task) => <TaskOrigin task={task} showOwner={adminOverview} />}
            renderDialogContext={(task) => {
              // La tarea abierta puede ir por detrás: se usa la versión más reciente
              const latest = tasks.find((t) => t.id === task.id) ?? task
              return (
                <div className="space-y-2">
                  <TaskOriginDetail task={latest} />
                  {/* Las de proyecto se reparten con «Para quién» (uno o varios developers) */}
                  {adminOverview && people.length > 0 && latest.source === 'personal' && (
                    <PersonPicker task={latest} people={people} nameIndex={nameIndex} onPick={reassign} />
                  )}
                </div>
              )
            }}
          />
        </>
      )}
    </div>
  )
}

/** Admin, en la tarea abierta: a quién le toca. */
function PersonPicker({
  task,
  people,
  nameIndex,
  onPick,
}: {
  task: WorkTask
  people: { id: number; name: string }[]
  nameIndex: Map<string, number>
  onPick: (task: WorkTask, personId: number | null) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const current =
    task.source === 'personal' ? task.owner_user_id : nameIndex.get(normName(task.assignee)) ?? null
  const external = task.source === 'project' && task.assignee && current == null ? task.assignee : null
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
      <span className="font-medium text-gray-700">Persona</span>
      <select
        value={current ?? (external ? 'external' : '')}
        disabled={saving}
        onChange={async (e) => {
          const v = e.target.value
          if (v === 'external') return
          setSaving(true)
          await onPick(task, v === '' ? null : Number(v))
          setSaving(false)
        }}
        className="h-9 min-w-[12rem] rounded-lg border border-gray-200 bg-white px-2 text-sm text-gray-900 outline-none focus:border-gray-400 disabled:opacity-60"
      >
        {task.source === 'project' && <option value="">Sin asignar</option>}
        {external && <option value="external">{external} (fuera del CRM)</option>}
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {saving && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
    </label>
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
