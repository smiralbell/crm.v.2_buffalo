import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  GanttChart,
  Grip,
  Kanban,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { estimateTaskHours } from '@/lib/gestion-proyecto/dashboard-metrics'
import {
  TASK_COLUMNS,
  TASK_STATUS_LABELS,
  STALE_DAYS,
  buildAssigneeColorMap,
  daysInCurrentColumn,
  isStaleTask,
} from '@/lib/gestion-proyecto/task-stale'
import type { ProjectTask, TaskPriority, TaskStatus } from '@/lib/gestion-proyecto/types'
import ProjectTaskCalendar from '@/components/gestion-proyecto/ProjectTaskCalendar'
import ProjectTaskGantt from '@/components/gestion-proyecto/ProjectTaskGantt'
import SubtaskList, { SubtaskChip } from '@/components/subtasks/SubtaskList'
import TaskAttachments from '@/components/gestion-proyecto/TaskAttachments'
import AssigneePicker, {
  EMPTY_SELECTION,
  selectionBody,
  selectionFromTask,
  useProjectDevelopers,
  type AssigneeSelection,
} from '@/components/gestion-proyecto/AssigneePicker'
import FileChips, { filesFromClipboard } from '@/components/gestion-proyecto/FileChips'
import type { Subtask } from '@/lib/subtasks'
import {
  projectTaskClient,
  type TaskBoardClient,
  type TaskCreateTarget,
} from '@/components/gestion-proyecto/task-board-client'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

type TasksView = 'board' | 'calendar' | 'gantt'

export const VIEW_TABS: { id: TasksView; label: string; icon: typeof Kanban }[] = [
  { id: 'board', label: 'Tablero', icon: Kanban },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'gantt', label: 'Gantt', icon: GanttChart },
]

export type { TasksView }

const PRIORITIES: { id: TaskPriority; label: string; className: string }[] = [
  { id: 'low', label: 'Baja', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'medium', label: 'Media', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'high', label: 'Alta', className: 'bg-rose-50 text-rose-800 border-rose-200' },
]

const priorityBadge: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-rose-100 text-rose-800',
}

/** Agrupa las opciones de "Dónde va" por su grupo, en el orden en que llegan. */
function groupTargets(targets: TaskCreateTarget[]): [string, TaskCreateTarget[]][] {
  const groups: [string, TaskCreateTarget[]][] = []
  for (const t of targets) {
    const key = t.group ?? ''
    const found = groups.find(([g]) => g === key)
    if (found) found[1].push(t)
    else groups.push([key, [t]])
  }
  return groups
}

interface ProjectTaskBoardProps<T extends ProjectTask = ProjectTask> {
  /** Tablero de un proyecto. Si no se pasa, hace falta `client`. */
  projectId?: string
  tasks: T[]
  onChange: (tasks: T[]) => void
  view?: TasksView
  onViewChange?: (view: TasksView) => void
  hideViewSwitcher?: boolean
  /** Dónde guardar (módulo Tareas: tareas sueltas y de varios proyectos) */
  client?: TaskBoardClient
  /** Opciones de "Dónde" al crear; el selector sale si hay más de una */
  createTargets?: TaskCreateTarget[]
  defaultCreateTarget?: string
  /** Etiqueta de origen encima del título (p. ej. el proyecto) */
  renderCardContext?: (task: T) => ReactNode
  /** Información extra en la cabecera de la tarea abierta */
  renderDialogContext?: (task: T) => ReactNode
  canDelete?: (task: T) => boolean
  /** Si se puede editar título, descripción, prioridad y horas (por defecto, sí) */
  canEdit?: (task: T) => boolean
  /** Texto cuando una columna está vacía */
  emptyColumnText?: string
  /**
   * La página pone su propio botón de "Nueva tarea": cada vez que cambia este
   * número se abre el formulario (y el tablero no pinta su barra de arriba).
   */
  createSignal?: number
  /** Buscador en la cabecera de cada columna */
  columnSearch?: boolean
  /** En «Hecho» solo se ven las N últimas hasta pulsar «Ver todas» */
  doneLimit?: number
}

/** Texto en el que busca el buscador de columna. */
function taskSearchText(task: ProjectTask): string {
  const extra = task as ProjectTask & { project_name?: string | null; created_by_name?: string | null }
  return [task.title, task.description, task.assignee, extra.project_name, extra.created_by_name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export default function ProjectTaskBoard<T extends ProjectTask = ProjectTask>(
  props: ProjectTaskBoardProps<T>
) {
  // El tablero trabaja con ProjectTask; las propiedades extra de T se conservan
  // porque cada cambio se hace con { ...tarea, ...cambios }.
  const {
    projectId,
    view: controlledView,
    onViewChange,
    hideViewSwitcher = false,
    createTargets,
    defaultCreateTarget,
    emptyColumnText = 'Sin tareas',
    createSignal,
    columnSearch = false,
    doneLimit,
  } = props
  const [columnQuery, setColumnQuery] = useState<Record<string, string>>({})
  const [showAllDone, setShowAllDone] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ title: '', description: '', priority: 'medium' as TaskPriority, hours: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const tasks = props.tasks as ProjectTask[]
  const onChange = props.onChange as (tasks: ProjectTask[]) => void
  const renderCardContext = props.renderCardContext as ((task: ProjectTask) => ReactNode) | undefined
  const renderDialogContext = props.renderDialogContext as
    | ((task: ProjectTask) => ReactNode)
    | undefined
  const canDelete = (task: ProjectTask) =>
    props.canDelete ? (props.canDelete as (t: ProjectTask) => boolean)(task) : true
  const canEdit = (task: ProjectTask) =>
    props.canEdit ? (props.canEdit as (t: ProjectTask) => boolean)(task) : true
  const client = useMemo(
    () => props.client ?? projectTaskClient(projectId ?? ''),
    [props.client, projectId]
  )
  const [createTarget, setCreateTarget] = useState('')
  const target = createTargets?.find((t) => t.id === createTarget)
  /** En un proyecto siempre se puede asignar y adjuntar */
  const targetAssignable = createTargets ? Boolean(target?.assignable) : true
  const targetAttachments = createTargets ? Boolean(target?.attachments) : true
  const [internalView, setInternalView] = useState<TasksView>('board')
  const view = controlledView ?? internalView
  const setView = (next: TasksView) => {
    onViewChange?.(next)
    if (controlledView === undefined) setInternalView(next)
  }
  const [draggedTask, setDraggedTask] = useState<ProjectTask | null>(null)
  const [draggedOver, setDraggedOver] = useState<TaskStatus | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createStatus, setCreateStatus] = useState<TaskStatus>('pending')
  const [viewTask, setViewTask] = useState<ProjectTask | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [newAssignees, setNewAssignees] = useState<AssigneeSelection>(EMPTY_SELECTION)
  /** Si ya se tocó el selector, no se cambia la preselección al cargar */
  const assigneesTouched = useRef(false)
  const [estimatedHours, setEstimatedHours] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [teamMembers, setTeamMembers] = useState<{ id: number; name: string; color: string | null }[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)
  const createFileRef = useRef<HTMLInputElement>(null)
  const addFiles = (list: File[]) => {
    if (list.length) setFiles((prev) => [...prev, ...list])
  }
  const showTargetSelect = Boolean(createTargets && createTargets.length > 1)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectTask | null>(null)
  const [deleting, setDeleting] = useState(false)

  /** Proyecto de la tarea que se crea (en el módulo Tareas sale de "Dónde va") */
  const createProjectId = !targetAssignable
    ? null
    : projectId || (createTarget.startsWith('project:') ? createTarget.slice('project:'.length) : null)
  const createDevs = useProjectDevelopers(createOpen ? createProjectId : null)
  /** Developers del proyecto de la tarea abierta (las sueltas no tienen) */
  const viewDevs = useProjectDevelopers(viewTask?.project_id || null)
  // Otro proyecto en "Dónde va": se vuelve a preseleccionar
  useEffect(() => {
    assigneesTouched.current = false
  }, [createProjectId])
  // Preselección: el único developer del proyecto, o quien crea la tarea si es developer de él
  useEffect(() => {
    if (!createOpen || assigneesTouched.current || createDevs.loading) return
    if (createDevs.projectId !== createProjectId) return
    const { devs, meId } = createDevs
    const pick = devs.length === 1 ? [devs[0].id] : meId != null && devs.some((d) => d.id === meId) ? [meId] : []
    setNewAssignees({ ids: pick, extra: [] })
  }, [createOpen, createProjectId, createDevs])
  const [staleActionId, setStaleActionId] = useState<string | null>(null)
  const [newSubtasks, setNewSubtasks] = useState<Subtask[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  /** Guardados de subtareas en cola por tarea, para que no lleguen desordenados. */
  const subtaskSaves = useRef(new Map<string, Promise<void>>())
  /** Última lista de tareas, para no pisar cambios hechos mientras se guarda. */
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  /**
   * Cambia la lista partiendo SIEMPRE de la última versión, no de la que había
   * cuando empezó la petición. Así dos cambios seguidos (mover dos tarjetas,
   * crear mientras se guarda otra…) no se pisan al volver del servidor.
   */
  const applyChange = (fn: (list: ProjectTask[]) => ProjectTask[]) => {
    const next = fn(tasksRef.current)
    tasksRef.current = next
    onChange(next)
  }

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const assigneeColors = useMemo(
    () => buildAssigneeColorMap(tasks, teamMembers),
    [tasks, teamMembers]
  )
  const multipleAssignees = assigneeColors.size > 1

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, ProjectTask[]> = {
      pending: [],
      in_progress: [],
      buffalo_validation: [],
      done: [],
    }
    for (const task of tasks) {
      map[task.status].push(task)
    }
    for (const col of TASK_COLUMNS) {
      map[col.id].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    }
    return map
  }, [tasks])

  useEffect(() => {
    fetch('/api/team-members')
      .then((r) => r.json())
      .then((d) => setTeamMembers(d.members || d.team_members || []))
      .catch(() => setTeamMembers([]))
  }, [])

  const openCreate = (status: TaskStatus) => {
    setCreateStatus(status)
    setTitle('')
    setDescription('')
    setPriority('medium')
    setNewAssignees(EMPTY_SELECTION)
    assigneesTouched.current = false
    setEstimatedHours('')
    setDueDate('')
    setFiles([])
    setNewSubtasks([])
    setCreateTarget(
      createTargets?.some((t) => t.id === defaultCreateTarget)
        ? (defaultCreateTarget as string)
        : createTargets?.length === 1
          ? createTargets[0].id
          : ''
    )
    setCreateOpen(true)
  }

  // Botón "Nueva tarea" de la página (módulo Tareas)
  const lastCreateSignal = useRef(createSignal)
  useEffect(() => {
    if (createSignal === undefined || createSignal === lastCreateSignal.current) return
    lastCreateSignal.current = createSignal
    openCreate('pending')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal])

  const createTask = async () => {
    if (!title.trim()) return
    if (createTargets && !target) {
      alert('Elige dónde va la tarea')
      return
    }
    setCreating(true)
    try {
      const data = await client.create(createTarget, {
        title: title.trim(),
        description: description.trim() || undefined,
        status: createStatus,
        priority,
        ...(targetAssignable ? selectionBody(newAssignees) : {}),
        estimated_hours: estimatedHours ? Number(estimatedHours) : undefined,
        due_date: dueDate || null,
        subtasks: newSubtasks.length > 0 ? newSubtasks : undefined,
      })

      let attachments = data.attachments || []
      if (targetAttachments && files.length > 0) {
        try {
          attachments = await client.uploadAttachments(data, files)
        } catch (e) {
          alert(
            e instanceof Error
              ? `Tarea creada, pero: ${e.message}`
              : 'Tarea creada, pero falló la subida de archivos'
          )
        }
      }

      applyChange((list) => [
        ...list.filter((t) => t.id !== data.id),
        {
          ...data,
          estimated_hours: data.estimated_hours ?? null,
          due_date: data.due_date ?? (dueDate || null),
          attachments,
        },
      ])
      setCreateOpen(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear tarea')
    } finally {
      setCreating(false)
    }
  }

  const handleGripDragStart = (e: React.DragEvent, task: ProjectTask) => {
    e.stopPropagation()
    setDraggedTask(task)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', task.id)

    const card = (e.currentTarget as HTMLElement).closest('[data-task-card]')
    if (card instanceof HTMLElement) {
      const rect = card.getBoundingClientRect()
      const dragImage = card.cloneNode(true) as HTMLElement
      dragImage.style.transform = 'rotate(1.5deg)'
      dragImage.style.opacity = '0.9'
      dragImage.style.width = `${rect.width}px`
      document.body.appendChild(dragImage)
      dragImage.style.position = 'absolute'
      dragImage.style.top = '-1000px'
      e.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2)
      setTimeout(() => {
        if (document.body.contains(dragImage)) document.body.removeChild(dragImage)
      }, 0)
    }
  }

  const handleDrop = async (targetStatus: TaskStatus) => {
    if (!draggedTask || draggedTask.status === targetStatus) {
      setDraggedTask(null)
      setDraggedOver(null)
      return
    }

    const original = tasksRef.current.find((t) => t.id === draggedTask.id) ?? draggedTask
    const now = new Date().toISOString()
    applyChange((list) =>
      list.map((t) =>
        t.id === draggedTask.id
          ? {
              ...t,
              status: targetStatus,
              status_changed_at: now,
              stale_notice_active: false,
              stale_extension_until: null,
            }
          : t
      )
    )
    const moved = draggedTask
    setDraggedTask(null)
    setDraggedOver(null)

    if (viewTask?.id === moved.id) {
      setViewTask({ ...moved, status: targetStatus })
    }

    try {
      const data = await client.update(moved, { status: targetStatus })
      applyChange((list) =>
        list.map((t) => (t.id === data.id ? { ...t, ...data, attachments: t.attachments } : t))
      )
      if (viewTask?.id === data.id) {
        setViewTask((v) => (v ? { ...v, ...data, attachments: v.attachments } : v))
      }
    } catch (e) {
      // Solo se deshace esta tarjeta; el resto de cambios se respeta
      applyChange((list) => list.map((t) => (t.id === original.id ? original : t)))
      alert(e instanceof Error ? e.message : 'Error al mover tarea')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await client.remove(deleteTarget)
      applyChange((list) => list.filter((t) => t.id !== deleteTarget.id))
      if (viewTask?.id === deleteTarget.id) setViewTask(null)
      setDeleteTarget(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar tarea')
    } finally {
      setDeleting(false)
    }
  }

  const viewTaskId = viewTask?.id ?? null
  useEffect(() => {
    setEditing(false)
  }, [viewTaskId])

  const startEdit = (task: ProjectTask) => {
    setEditForm({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      hours: task.estimated_hours != null ? String(task.estimated_hours) : '',
    })
    setEditing(true)
  }

  const saveEdit = async (task: ProjectTask) => {
    const title = editForm.title.trim()
    if (!title) {
      alert('El título es obligatorio')
      return
    }
    const hours = editForm.hours.trim() ? Number(editForm.hours.replace(',', '.')) : null
    if (hours != null && (!Number.isFinite(hours) || hours <= 0)) {
      alert('Las horas tienen que ser un número mayor que 0')
      return
    }
    setSavingEdit(true)
    await patchTaskMeta(task.id, {
      title,
      description: editForm.description.trim() || null,
      priority: editForm.priority,
      estimated_hours: hours,
    })
    setSavingEdit(false)
    setEditing(false)
  }

  const patchTaskMeta = async (taskId: string, body: Record<string, unknown>) => {
    const current = tasksRef.current.find((t) => t.id === taskId)
    if (!current) return
    setStaleActionId(taskId)
    try {
      const data = await client.update(current, body)
      applyChange((list) =>
        list.map((t) => (t.id === taskId ? { ...t, ...data, attachments: t.attachments } : t))
      )
      if (viewTask?.id === taskId) {
        setViewTask((v) => (v ? { ...v, ...data, attachments: v.attachments } : v))
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al actualizar')
    } finally {
      setStaleActionId(null)
    }
  }

  const updateSubtasks = (taskId: string, subtasks: Subtask[]) => {
    // Optimista: se ve al momento y se guarda de fondo
    const prevTask = tasksRef.current.find((t) => t.id === taskId)
    applyChange((list) => list.map((t) => (t.id === taskId ? { ...t, subtasks } : t)))
    setViewTask((v) => (v && v.id === taskId ? { ...v, subtasks } : v))

    const save = async () => {
      try {
        if (!prevTask) return
        await client.update(prevTask, { subtasks })
      } catch (e) {
        const restore = prevTask?.subtasks ?? []
        applyChange((list) => list.map((t) => (t.id === taskId ? { ...t, subtasks: restore } : t)))
        setViewTask((v) => (v && v.id === taskId ? { ...v, subtasks: restore } : v))
        alert(e instanceof Error ? e.message : 'Error al guardar subtareas')
      }
    }
    const next = (subtaskSaves.current.get(taskId) ?? Promise.resolve()).then(save)
    subtaskSaves.current.set(taskId, next)
  }

  const columnLabel = (status: TaskStatus) => TASK_STATUS_LABELS[status] || status

  const formatDue = (value: string | null | undefined) => {
    if (!value) return null
    try {
      return format(parseISO(value.slice(0, 10)), 'd MMM yyyy', { locale: es })
    } catch {
      return value
    }
  }

  const getCardClassName = (task: ProjectTask, stale: boolean) => {
    if (task.status === 'done') {
      return 'border-emerald-300 bg-emerald-50/90 hover:border-emerald-400 hover:shadow-md'
    }
    if (stale) {
      return 'border-red-400 bg-red-50/95 hover:border-red-500 ring-1 ring-red-200/80'
    }
    if (task.status === 'buffalo_validation') {
      return 'border-violet-300 bg-violet-50/60 hover:border-violet-400 hover:shadow-md'
    }
    return 'border-gray-200 bg-white hover:shadow-md hover:border-gray-300'
  }

  return (
    <div className="space-y-4 min-w-0">
      {createSignal === undefined && (!hideViewSwitcher || view !== 'board') && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!hideViewSwitcher && (
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              {VIEW_TABS.map((tab) => {
                const Icon = tab.icon
                const active = view === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setView(tab.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          )}
          {view !== 'board' && (
            <Button
              type="button"
              size="sm"
              onClick={() => openCreate('pending')}
              className={cn(hideViewSwitcher && 'ml-auto')}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Nueva tarea
            </Button>
          )}
        </div>
      )}

      {view === 'calendar' && (
        <ProjectTaskCalendar
          tasks={tasks}
          onSelectTask={setViewTask}
          onMoveDueDate={(taskId, nextDue) => patchTaskMeta(taskId, { due_date: nextDue })}
        />
      )}

      {view === 'gantt' && <ProjectTaskGantt tasks={tasks} onSelectTask={setViewTask} />}

      {view === 'board' && (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 min-w-0">
      {TASK_COLUMNS.map((column) => {
        const columnTasks = grouped[column.id]
        const isOver = draggedOver === column.id
        const query = (columnQuery[column.id] || '').trim().toLowerCase()
        let shownTasks = query ? columnTasks.filter((t) => taskSearchText(t).includes(query)) : columnTasks
        let hiddenDone = 0
        const limitDone = column.id === 'done' && !!doneLimit && !showAllDone && !query
        if (limitDone && shownTasks.length > doneLimit!) {
          // Las que se hicieron más recientemente
          const recent = [...shownTasks].sort((a, b) =>
            (b.status_changed_at || b.updated_at).localeCompare(a.status_changed_at || a.updated_at)
          )
          hiddenDone = recent.length - doneLimit!
          shownTasks = recent.slice(0, doneLimit)
        }

        return (
          <div
            key={column.id}
            className={cn(
              'rounded-2xl border bg-gray-50/60 min-h-[420px] flex flex-col transition-colors min-w-0 overflow-hidden',
              isOver ? 'border-indigo-300 bg-indigo-50/40' : 'border-gray-200'
            )}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDraggedOver(column.id)
            }}
            onDragLeave={() => setDraggedOver(null)}
            onDrop={(e) => {
              e.preventDefault()
              handleDrop(column.id)
            }}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-200/80">
              <div className="flex items-center gap-2 min-w-0">
                <h4 className="text-sm font-semibold text-gray-900">{column.label}</h4>
                <span className="text-xs font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                  {columnTasks.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => openCreate(column.id)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                title="Nueva tarea"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {columnSearch && (
              <div className="px-3 pt-2.5">
                <input
                  value={columnQuery[column.id] || ''}
                  onChange={(e) => setColumnQuery((prev) => ({ ...prev, [column.id]: e.target.value }))}
                  placeholder={`Buscar en ${column.label.toLowerCase()}…`}
                  className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none"
                />
              </div>
            )}

            <div className="flex-1 p-3 space-y-3">
              {shownTasks.length === 0 && (
                <p className="px-2 py-8 text-center text-xs text-gray-400">
                  {query && columnTasks.length > 0 ? 'Nada con esta búsqueda' : emptyColumnText}
                </p>
              )}
              {shownTasks.map((task) => {
                const isDragging = draggedTask?.id === task.id
                const stale = isStaleTask(task)
                const daysInColumn = daysInCurrentColumn(task)
                const assigneeColor = task.assignee ? assigneeColors.get(task.assignee) : undefined
                const cardTint =
                  multipleAssignees && assigneeColor
                    ? { borderLeftWidth: 4, borderLeftColor: assigneeColor }
                    : undefined
                const isActing = staleActionId === task.id

                return (
                  <div
                    key={task.id}
                    data-task-card
                    role="button"
                    tabIndex={0}
                    onClick={() => setViewTask(task)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setViewTask(task)
                      }
                    }}
                    style={cardTint}
                    className={cn(
                      'rounded-xl border p-3 shadow-sm min-h-[148px] flex flex-col overflow-hidden transition-all duration-200 cursor-pointer',
                      getCardClassName(task, stale),
                      isDragging && 'opacity-40 scale-[0.98]'
                    )}
                  >
                    {task.stale_notice_active && (
                      <div
                        className="mb-2 -mx-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-[10px] leading-tight text-amber-900 font-medium">
                          Aviso: extensión solicitada. Confirma que sigues en desarrollo.
                        </p>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => patchTaskMeta(task.id, { acknowledge_stale: true })}
                          className="mt-1 text-[10px] font-semibold text-amber-800 underline hover:text-amber-950 disabled:opacity-50"
                        >
                          Sigo en desarrollo
                        </button>
                      </div>
                    )}

                    <div className="flex items-start gap-2 min-h-0 flex-1 overflow-hidden">
                      <div
                        draggable
                        onDragStart={(e) => handleGripDragStart(e, task)}
                        onDragEnd={() => {
                          setDraggedTask(null)
                          setDraggedOver(null)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="shrink-0 p-0.5 -ml-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none"
                        title="Arrastrar"
                      >
                        <Grip className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
                        {renderCardContext && (
                          <div className="mb-1 min-w-0">{renderCardContext(task)}</div>
                        )}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <p
                            className={cn(
                              'text-sm font-medium leading-snug line-clamp-2 break-all min-w-0',
                              task.status === 'done' ? 'text-emerald-900' : 'text-gray-900'
                            )}
                          >
                            {task.title}
                          </p>
                          {canDelete(task) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleteTarget(task)
                              }}
                              className="text-gray-300 hover:text-red-600 shrink-0"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                        {task.description && (
                          <p className="mt-1.5 text-xs text-gray-500 line-clamp-2 break-all overflow-hidden">
                            {task.description}
                          </p>
                        )}
                        <div className="mt-auto pt-2 flex flex-wrap items-center gap-1.5 overflow-hidden">
                          <Badge className={priorityBadge[task.priority]}>
                            {PRIORITIES.find((p) => p.id === task.priority)?.label}
                          </Badge>
                          {task.assignee && (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 max-w-full truncate"
                              style={
                                multipleAssignees && assigneeColor
                                  ? { backgroundColor: `${assigneeColor}18`, borderColor: `${assigneeColor}55` }
                                  : { backgroundColor: 'rgb(249 250 251)' }
                              }
                            >
                              <User className="h-3 w-3 shrink-0" />
                              <span className="truncate">{task.assignee}</span>
                            </span>
                          )}
                          {(task.attachments?.length ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                              <Paperclip className="h-3 w-3" />
                              {task.attachments!.length}
                            </span>
                          )}
                          {task.due_date && (
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600 px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50">
                              <CalendarDays className="h-3 w-3 shrink-0" />
                              {formatDue(task.due_date)}
                            </span>
                          )}
                          {(task.subtasks?.length ?? 0) > 0 && (
                            <SubtaskChip
                              subtasks={task.subtasks}
                              open={expanded.has(task.id)}
                              onToggle={() => toggleExpanded(task.id)}
                            />
                          )}
                        </div>
                        {expanded.has(task.id) && (task.subtasks?.length ?? 0) > 0 && (
                          <SubtaskList
                            compact
                            parentTitle={task.title}
                            subtasks={task.subtasks}
                            onChange={(next) => updateSubtasks(task.id, next)}
                            className="mt-2 border-t border-gray-100 pt-2"
                          />
                        )}
                      </div>
                    </div>

                    {stale && task.status !== 'done' && !task.stale_notice_active && (
                      <div
                        className="mt-2 pt-2 border-t border-red-200/80 flex items-center justify-between gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-700">
                          <Clock className="h-3 w-3" />
                          {daysInColumn}d sin mover ({'>'}={STALE_DAYS}d)
                        </span>
                        <button
                          type="button"
                          disabled={isActing}
                          onClick={() => patchTaskMeta(task.id, { extend_stale: true })}
                          className="text-[10px] font-semibold text-red-800 bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-md disabled:opacity-50"
                        >
                          +10 días
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {column.id === 'done' && !!doneLimit && !query && (hiddenDone > 0 || showAllDone) && (
                <button
                  type="button"
                  onClick={() => setShowAllDone((v) => !v)}
                  className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900"
                >
                  {showAllDone ? `Mostrar solo las ${doneLimit} últimas` : `Ver todas (${columnTasks.length})`}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="sr-only">
            <DialogTitle>Nueva tarea</DialogTitle>
            <DialogDescription>Columna: {columnLabel(createStatus)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-3">
              {showTargetSelect && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700" htmlFor="task_target">
                    Dónde va *
                  </label>
                  <select
                    id="task_target"
                    value={createTarget}
                    onChange={(e) => setCreateTarget(e.target.value)}
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="" disabled>
                      Elige una opción…
                    </option>
                    {groupTargets(createTargets!).map(([group, items]) =>
                      group ? (
                        <optgroup key={group} label={group}>
                          {items.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.label}
                            </option>
                          ))}
                        </optgroup>
                      ) : (
                        items.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))
                      )
                    )}
                  </select>
                </div>
              )}
              <div className={cn('space-y-1.5', showTargetSelect ? 'sm:col-span-2' : 'sm:col-span-3')}>
                <p className="text-sm font-medium text-gray-700">Prioridad</p>
                <div className="flex gap-2">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPriority(p.id)}
                      className={cn(
                        'h-10 flex-1 rounded-lg border px-3 text-xs font-medium transition-colors',
                        priority === p.id ? p.className : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {targetAssignable && createProjectId && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-gray-700">
                  Para quién{' '}
                  <span className="font-normal text-gray-400">(solo lo verán las personas marcadas)</span>
                </p>
                <AssigneePicker
                  devs={createDevs.devs}
                  loading={createDevs.loading}
                  value={newAssignees}
                  disabled={creating}
                  onChange={(next) => {
                    assigneesTouched.current = true
                    setNewAssignees(next)
                  }}
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700" htmlFor="task_hours">
                  Horas estimadas
                </label>
                <Input
                  id="task_hours"
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="Ej. 4"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700" htmlFor="task_due">
                  Fecha de finalización
                </label>
                <Input id="task_due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="task_title">
                Título *
              </label>
              <Input
                id="task_title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Qué hay que hacer"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="task_desc">
                Descripción
              </label>
              <div
                className={cn(
                  'overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow focus-within:border-gray-300 focus-within:ring-2 focus-within:ring-gray-100',
                  dragOver && 'border-indigo-300 ring-2 ring-indigo-100'
                )}
                onDragOver={(e) => {
                  if (!targetAttachments) return
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  if (!targetAttachments) return
                  e.preventDefault()
                  setDragOver(false)
                  addFiles(Array.from(e.dataTransfer.files || []))
                }}
              >
                <Textarea
                  id="task_desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onPaste={(e) => {
                    if (!targetAttachments) return
                    const pasted = filesFromClipboard(e.clipboardData)
                    if (!pasted.length) return
                    if (!e.clipboardData.getData('text/plain')) e.preventDefault()
                    addFiles(pasted)
                  }}
                  placeholder={
                    targetAttachments
                      ? 'Detalles, criterios de aceptación, contexto… Puedes pegar capturas con Ctrl+V.'
                      : 'Detalles, criterios de aceptación, contexto técnico...'
                  }
                  rows={6}
                  className="min-h-[140px] resize-y rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                />
                {targetAttachments && (
                  <div className="space-y-2 border-t border-gray-100 bg-gray-50/60 px-2.5 py-2">
                    <FileChips files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, j) => j !== i))} />
                    <div className="flex items-center gap-2">
                      <input
                        ref={createFileRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          addFiles(Array.from(e.target.files || []))
                          e.target.value = ''
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => createFileRef.current?.click()}
                        className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-200/70 hover:text-gray-800"
                        title="Adjuntar archivos"
                        aria-label="Adjuntar archivos"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-gray-400">
                        {files.length
                          ? `${files.length} adjunto${files.length === 1 ? '' : 's'} · se suben al crear la tarea`
                          : 'Adjunta archivos, arrástralos aquí o pega capturas con Ctrl+V'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-700">
                Subtareas <span className="font-normal text-gray-400">(opcional)</span>
              </p>
              <SubtaskList
                subtasks={newSubtasks}
                onChange={setNewSubtasks}
                disabled={creating}
                parentTitle={title.trim() || 'Nueva tarea'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button
              onClick={createTask}
              disabled={creating || !title.trim() || (Boolean(createTargets) && !target)}
            >
              {creating ? 'Creando...' : 'Crear tarea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewTask} onOpenChange={(open) => !open && setViewTask(null)}>
        <DialogContent className="w-[min(96vw,56rem)] max-w-none sm:max-w-none max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0">
          {viewTask && (
            <>
              <DialogHeader className="shrink-0 px-6 pt-6 pb-4 space-y-2 overflow-hidden min-w-0">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <Badge className={priorityBadge[viewTask.priority]}>
                    {PRIORITIES.find((p) => p.id === viewTask.priority)?.label}
                  </Badge>
                  <span className="text-xs text-gray-500">{columnLabel(viewTask.status)}</span>
                  {viewTask.assignee && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600 max-w-[40%] truncate">
                      <User className="h-3 w-3 shrink-0" />
                      {viewTask.assignee}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    ~{estimateTaskHours(viewTask)}h estimadas
                  </span>
                  {viewTask.due_date && (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <CalendarDays className="h-3 w-3" />
                      Fin: {formatDue(viewTask.due_date)}
                    </span>
                  )}
                </div>
                <DialogTitle className="text-left text-lg leading-snug break-all [overflow-wrap:anywhere] pr-8">
                  {viewTask.title}
                </DialogTitle>
                {renderDialogContext && <div className="pr-8">{renderDialogContext(viewTask)}</div>}
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-4">
                {editing && (
                  <div className="mb-5 space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700" htmlFor="edit_task_title">Título</label>
                      <Input
                        id="edit_task_title"
                        value={editForm.title}
                        onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700" htmlFor="edit_task_priority">Prioridad</label>
                        <select
                          id="edit_task_priority"
                          value={editForm.priority}
                          onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                          className="h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700" htmlFor="edit_task_hours">Horas estimadas</label>
                        <Input
                          id="edit_task_hours"
                          inputMode="decimal"
                          value={editForm.hours}
                          placeholder="Ej.: 2"
                          onChange={(e) => setEditForm((f) => ({ ...f, hours: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-gray-700" htmlFor="edit_task_desc">Descripción</label>
                      <Textarea
                        id="edit_task_desc"
                        rows={6}
                        value={editForm.description}
                        onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
                {viewTask.project_id && (
                  <div className="mb-4 space-y-2">
                    <p className="text-sm font-medium text-gray-700">Para quién</p>
                    <AssigneePicker
                      devs={viewDevs.devs}
                      loading={viewDevs.loading}
                      value={selectionFromTask(viewTask, viewDevs.devs)}
                      disabled={staleActionId === viewTask.id}
                      onChange={(next) => void patchTaskMeta(viewTask.id, selectionBody(next))}
                    />
                  </div>
                )}
                <div className="mb-4 space-y-2">
                  <label className="text-sm font-medium text-gray-700" htmlFor="view_task_due">
                    Fecha de finalización
                  </label>
                  <Input
                    id="view_task_due"
                    type="date"
                    value={viewTask.due_date || ''}
                    onChange={(e) => {
                      const next = e.target.value || null
                      setViewTask({ ...viewTask, due_date: next })
                      void patchTaskMeta(viewTask.id, { due_date: next })
                    }}
                    className="max-w-xs"
                  />
                </div>
                <div className="mb-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Subtareas</p>
                  <SubtaskList
                    parentTitle={viewTask.title}
                    subtasks={viewTask.subtasks}
                    onChange={(next) => updateSubtasks(viewTask.id, next)}
                  />
                </div>
                {viewTask.description ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 max-w-full overflow-hidden">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed break-all [overflow-wrap:anywhere]">
                      {viewTask.description}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Sin descripción</p>
                )}
                <TaskAttachments
                  task={viewTask}
                  client={client}
                  onChange={(attachments) => {
                    setViewTask((v) => (v ? { ...v, attachments } : v))
                    applyChange((list) => list.map((t) => (t.id === viewTask.id ? { ...t, attachments } : t)))
                  }}
                />
              </div>
              <DialogFooter className="shrink-0 gap-2 sm:gap-0 px-6 py-4 border-t border-gray-100 bg-white">
                {canDelete(viewTask) && (
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => {
                      setDeleteTarget(viewTask)
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                )}
                {canEdit(viewTask) &&
                  (editing ? (
                    <>
                      <Button variant="outline" onClick={() => setEditing(false)} disabled={savingEdit}>
                        Cancelar
                      </Button>
                      <Button onClick={() => void saveEdit(viewTask)} disabled={savingEdit}>
                        {savingEdit ? 'Guardando…' : 'Guardar cambios'}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" onClick={() => startEdit(viewTask)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                  ))}
                {!editing && <Button onClick={() => setViewTask(null)}>Cerrar</Button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Eliminar tarea
            </DialogTitle>
            <DialogDescription>
              Vas a eliminar la tarea{' '}
              <span className="font-semibold text-gray-900">{deleteTarget?.title}</span>. Esta acción
              no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar tarea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
