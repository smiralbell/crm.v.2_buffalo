import { useEffect, useMemo, useState } from 'react'
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
import { AlertTriangle, Grip, Paperclip, Plus, Trash2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { estimateTaskHours } from '@/lib/gestion-proyecto/dashboard-metrics'
import type { ProjectTask, TaskPriority, TaskStatus } from '@/lib/gestion-proyecto/types'

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'pending', label: 'Pendiente' },
  { id: 'in_progress', label: 'En curso' },
  { id: 'done', label: 'Hecho' },
]

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

interface ProjectTaskBoardProps {
  projectId: string
  tasks: ProjectTask[]
  onChange: (tasks: ProjectTask[]) => void
}

export default function ProjectTaskBoard({ projectId, tasks, onChange }: ProjectTaskBoardProps) {
  const [draggedTask, setDraggedTask] = useState<ProjectTask | null>(null)
  const [draggedOver, setDraggedOver] = useState<TaskStatus | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createStatus, setCreateStatus] = useState<TaskStatus>('pending')
  const [viewTask, setViewTask] = useState<ProjectTask | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [assignee, setAssignee] = useState('')
  const [estimatedHours, setEstimatedHours] = useState('')
  const [teamMembers, setTeamMembers] = useState<{ id: number; name: string; color: string | null }[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectTask | null>(null)
  const [deleting, setDeleting] = useState(false)

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, ProjectTask[]> = {
      pending: [],
      in_progress: [],
      done: [],
    }
    for (const task of tasks) {
      map[task.status].push(task)
    }
    for (const col of COLUMNS) {
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
    setAssignee('')
    setEstimatedHours('')
    setFiles([])
    setCreateOpen(true)
  }

  const uploadAttachments = async (taskId: string, list: File[]) => {
    if (list.length === 0) return []
    const formData = new FormData()
    for (const file of list) {
      formData.append('file', file)
    }
    const res = await fetch(
      `/api/gestion-proyecto/proyectos/${projectId}/tasks/${taskId}/attachments/upload`,
      { method: 'POST', body: formData }
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'No se pudieron subir los archivos')
    return data.attachments || []
  }

  const createTask = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const res = await fetch(`/api/gestion-proyecto/proyectos/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          status: createStatus,
          priority,
          assignee: assignee.trim() || undefined,
          estimated_hours: estimatedHours ? Number(estimatedHours) : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la tarea')

      let attachments = data.attachments || []
      if (files.length > 0) {
        try {
          attachments = await uploadAttachments(data.id, files)
        } catch (e) {
          alert(
            e instanceof Error
              ? `Tarea creada, pero: ${e.message}`
              : 'Tarea creada, pero falló la subida de archivos'
          )
        }
      }

      onChange([...tasks, { ...data, estimated_hours: data.estimated_hours ?? null, attachments }])
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

    const prev = tasks
    const optimistic = tasks.map((t) =>
      t.id === draggedTask.id ? { ...t, status: targetStatus } : t
    )
    onChange(optimistic)
    const moved = draggedTask
    setDraggedTask(null)
    setDraggedOver(null)

    if (viewTask?.id === moved.id) {
      setViewTask({ ...moved, status: targetStatus })
    }

    try {
      const res = await fetch(
        `/api/gestion-proyecto/proyectos/${projectId}/tasks/${moved.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo mover la tarea')
      onChange(optimistic.map((t) => (t.id === data.id ? { ...t, ...data, attachments: t.attachments } : t)))
      if (viewTask?.id === data.id) {
        setViewTask((v) => (v ? { ...v, ...data, attachments: v.attachments } : v))
      }
    } catch (e) {
      onChange(prev)
      alert(e instanceof Error ? e.message : 'Error al mover tarea')
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/gestion-proyecto/proyectos/${projectId}/tasks/${deleteTarget.id}`,
        { method: 'DELETE' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'No se pudo eliminar')
      }
      onChange(tasks.filter((t) => t.id !== deleteTarget.id))
      if (viewTask?.id === deleteTarget.id) setViewTask(null)
      setDeleteTarget(null)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar tarea')
    } finally {
      setDeleting(false)
    }
  }

  const columnLabel = (status: TaskStatus) =>
    COLUMNS.find((c) => c.id === status)?.label || status

  return (
    <div className="grid gap-4 lg:grid-cols-3 min-w-0">
      {COLUMNS.map((column) => {
        const columnTasks = grouped[column.id]
        const isOver = draggedOver === column.id

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

            <div className="flex-1 p-3 space-y-3">
              {columnTasks.length === 0 && (
                <p className="px-2 py-8 text-center text-xs text-gray-400">Sin tareas</p>
              )}
              {columnTasks.map((task) => {
                const isDragging = draggedTask?.id === task.id
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
                    className={cn(
                      'rounded-xl border border-gray-200 bg-white p-3 shadow-sm h-[148px] flex flex-col overflow-hidden',
                      'hover:shadow-md hover:border-gray-300 transition-all duration-200 cursor-pointer',
                      isDragging && 'opacity-40 scale-[0.98]'
                    )}
                  >
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
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2 break-all min-w-0">
                            {task.title}
                          </p>
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
                            <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 px-2 py-0.5 rounded-full border border-gray-200 max-w-full truncate">
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
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
            <DialogDescription>
              Columna: {columnLabel(createStatus)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="task_desc">
                Descripción
              </label>
              <Textarea
                id="task_desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalles, criterios de aceptación, contexto técnico..."
                rows={10}
                className="min-h-[220px] resize-y"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="task_assignee">
                  Asignado a
                </label>
                <select
                  id="task_assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="">Sin asignar</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
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
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Prioridad</p>
              <div className="flex gap-2 max-w-md">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriority(p.id)}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                      priority === p.id ? p.className : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700" htmlFor="task_files">
                Adjuntos (opcional)
              </label>
              <input
                id="task_files"
                type="file"
                multiple
                className="w-full text-sm"
                onChange={(e) => setFiles(Array.from(e.target.files || []))}
              />
              {files.length > 0 && (
                <p className="text-xs text-gray-500">{files.length} archivo(s) seleccionado(s)</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={createTask} disabled={creating || !title.trim()}>
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
                </div>
                <DialogTitle className="text-left text-lg leading-snug break-all [overflow-wrap:anywhere] pr-8">
                  {viewTask.title}
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 pb-4">
                {viewTask.description ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 max-w-full overflow-hidden">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed break-all [overflow-wrap:anywhere]">
                      {viewTask.description}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">Sin descripción</p>
                )}
                {(viewTask.attachments?.length ?? 0) > 0 && (
                  <div className="mt-5 space-y-2">
                    <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                      <Paperclip className="h-4 w-4" />
                      Adjuntos
                    </p>
                    <ul className="space-y-1.5">
                      {viewTask.attachments!.map((att) => (
                        <li key={att.id}>
                          <a
                            href={`/api/gestion-proyecto/proyectos/${projectId}/tasks/${viewTask.id}/attachments/${att.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-indigo-600 hover:underline"
                          >
                            {att.file_name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <DialogFooter className="shrink-0 gap-2 sm:gap-0 px-6 py-4 border-t border-gray-100 bg-white">
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
                <Button onClick={() => setViewTask(null)}>Cerrar</Button>
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
