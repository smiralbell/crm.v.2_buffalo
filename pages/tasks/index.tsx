import { useEffect, useMemo, useState } from 'react'
import { requireAuth } from '@/lib/auth'
import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import Layout from '@/components/Layout'
import { Plus, CheckCircle2, Edit, Filter, Trash2, LayoutGrid, List } from 'lucide-react'

type Task = {
  id: number
  title: string
  description: string | null
  project: string
  priority: 'low' | 'medium' | 'high'
  status: 'todo' | 'doing' | 'done'
  due_date: string | null
  completed_at: string | null
  client_id: number
  client_name: string | null
  assignee_id: number
  assignee_name: string
}

type TeamMember = {
  id: number
  name: string
  color: string | null
}

type Client = {
  id: number
  nombre: string | null
}

interface TasksPageProps {
  initialTasks: Task[]
  meta: {
    teamMembers: TeamMember[]
    clients: Client[]
    projects: string[]
  }
}

export const getServerSideProps: GetServerSideProps<TasksPageProps> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `http://${context.req.headers.host}`
  const res = await fetch(`${baseUrl}/api/tasks?includeMeta=1`, {
    headers: {
      cookie: context.req.headers.cookie || '',
    },
  })

  if (!res.ok) {
    return {
      props: {
        initialTasks: [],
        meta: { teamMembers: [], clients: [], projects: [] },
      },
    }
  }

  const data = await res.json()

  return {
    props: {
      initialTasks: data.tasks || [],
      meta: data.meta || { teamMembers: [], clients: [], projects: [] },
    },
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

function PriorityBadge({ priority }: { priority: Task['priority'] }) {
  const map: Record<Task['priority'], { label: string; className: string }> = {
    low: { label: 'Low', className: 'bg-gray-100 text-gray-700' },
    medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-800' },
    high: { label: 'High', className: 'bg-red-100 text-red-800' },
  }
  const p = map[priority] || map.medium
  return <Badge className={p.className}>{p.label}</Badge>
}

function StatusBadge({ status }: { status: Task['status'] }) {
  const map: Record<Task['status'], { label: string; className: string }> = {
    todo: { label: 'To do', className: 'bg-gray-100 text-gray-700' },
    doing: { label: 'Doing', className: 'bg-blue-100 text-blue-800' },
    done: { label: 'Done', className: 'bg-green-100 text-green-800' },
  }
  const s = map[status]
  return <Badge className={s.className}>{s.label}</Badge>
}

export default function TasksPage({ initialTasks, meta }: TasksPageProps) {
  const router = useRouter()
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [loading, setLoading] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(meta.teamMembers || [])

  const [filters, setFilters] = useState<{
    assigneeId?: string
    clientId?: string
    project?: string
    status?: 'pending' | 'done' | 'all'
    priority?: 'low' | 'medium' | 'high' | 'all'
    orderByDue: 'asc' | 'desc'
  }>({
    status: 'pending',
    priority: 'all',
    orderByDue: 'asc',
  })
  const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'status'>('due_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const [formOpen, setFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [newMemberName, setNewMemberName] = useState('')
  const [creatingMember, setCreatingMember] = useState(false)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

  const [form, setForm] = useState<{
    title: string
    description: string
    assigneeId: string
    clientId: string
    project: string
    priority: 'low' | 'medium' | 'high'
    dueDate: string
  }>({
    title: '',
    description: '',
    assigneeId: '',
    clientId: '',
    project: '',
    priority: 'medium',
    dueDate: '',
  })

  const loadTasks = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
      if (filters.clientId) params.set('clientId', filters.clientId)
      if (filters.project) params.set('project', filters.project)
      if (filters.priority && filters.priority !== 'all') params.set('priority', filters.priority)
      if (filters.status === 'pending') params.set('onlyPending', '1')
      if (filters.status === 'done') params.set('onlyCompleted', '1')
      params.set('orderByDue', filters.orderByDue)

      const res = await fetch(`/api/tasks?${params.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setTasks(data.tasks || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Solo recargar desde el cliente cuando cambian filtros
    loadTasks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.assigneeId, filters.clientId, filters.project, filters.status, filters.priority, filters.orderByDue])

  const pendingCount = useMemo(() => tasks.filter((t) => t.status !== 'done').length, [tasks])
  const completedCount = useMemo(() => tasks.filter((t) => t.status === 'done').length, [tasks])
  const sortedTasks = useMemo(() => {
    const arr = [...tasks]
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortBy === 'due_date') {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity
        if (da === db) return 0
        return da < db ? dir : -dir
      }
      if (sortBy === 'priority') {
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
        const pa = order[a.priority] ?? 1
        const pb = order[b.priority] ?? 1
        if (pa === pb) return 0
        return pa < pb ? dir : -dir
      }
      if (sortBy === 'status') {
        const order: Record<string, number> = { todo: 0, doing: 1, done: 2 }
        const sa = order[a.status] ?? 0
        const sb = order[b.status] ?? 0
        if (sa === sb) return 0
        return sa < sb ? dir : -dir
      }
      return 0
    })
    return arr
  }, [tasks, sortBy, sortDir])

  const openNewTask = () => {
    setEditingTask(null)
    setForm({
      title: '',
      description: '',
      assigneeId: '',
      clientId: '',
      project: '',
      priority: 'medium',
      dueDate: '',
    })
    setFormOpen(true)
  }

  const openEditTask = (task: Task) => {
    setEditingTask(task)
    setForm({
      title: task.title,
      description: task.description || '',
      assigneeId: task.assignee_id ? String(task.assignee_id) : '',
      clientId: task.client_id ? String(task.client_id) : '',
      project: task.project || '',
      priority: task.priority,
      dueDate: task.due_date ? task.due_date.slice(0, 10) : '',
    })
    setFormOpen(true)
  }

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title) {
      alert('El título es obligatorio')
      return
    }

    const payload = {
      title: form.title,
      description: form.description || null,
      assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
      clientId: form.clientId ? Number(form.clientId) : null,
      project: form.project || null,
      priority: form.priority,
      status: editingTask ? editingTask.status : 'todo',
      dueDate: form.dueDate || null,
    }

    const url = editingTask ? `/api/tasks/${editingTask.id}` : '/api/tasks'
    const method = editingTask ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Error al guardar la tarea')
      return
    }

    setFormOpen(false)
    await loadTasks()
  }

  const markDone = async (task: Task) => {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markDone: true }),
    })
    if (!res.ok) {
      alert('Error al marcar como hecha')
      return
    }
    await loadTasks()
  }

  const handleCreateMember = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault()
    }
    if (!newMemberName.trim()) return
    setCreatingMember(true)
    try {
      const res = await fetch('/api/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMemberName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Error al crear persona')
        return
      }
      // Volver a cargar lista de personas
      const resMembers = await fetch('/api/team-members')
      const dataMembers = await resMembers.json()
      if (resMembers.ok && dataMembers.members) {
        setTeamMembers(dataMembers.members)
        // seleccionar automáticamente la nueva persona en el formulario
        if (data.id) {
          setForm((f) => ({ ...f, assigneeId: String(data.id) }))
        }
      }
      setNewMemberName('')
    } finally {
      setCreatingMember(false)
    }
  }

  const deleteTask = async (task: Task) => {
    const ok = window.confirm(`¿Eliminar la tarea "${task.title}"?`)
    if (!ok) return
    const res = await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    if (!res.ok) {
      alert('Error al eliminar la tarea')
      return
    }
    await loadTasks()
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-gray-900">Tareas</h1>
            <p className="text-gray-600 text-sm">
              Organiza el trabajo por cliente, proyecto y persona. Pendientes: {pendingCount} · Hechas: {completedCount}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center rounded-lg border bg-white p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 ${viewMode === 'table' ? 'bg-gray-100 text-gray-900' : 'text-gray-500'}`}
              >
                <List className="h-3 w-3" />
                Tabla
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1 rounded-md px-2 py-1 ${viewMode === 'cards' ? 'bg-gray-100 text-gray-900' : 'text-gray-500'}`}
              >
                <LayoutGrid className="h-3 w-3" />
                Tarjetas
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => loadTasks()} disabled={loading}>
              <Filter className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
            <Button onClick={openNewTask}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva tarea
            </Button>
          </div>
        </div>

        {/* Filtros */}
        <Card>
          <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div>
              <Label>Persona</Label>
              <Select
                value={filters.assigneeId || 'all'}
                onValueChange={(value) =>
                  setFilters((f) => ({ ...f, assigneeId: value === 'all' ? undefined : value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Select
                value={filters.clientId || 'all'}
                onValueChange={(value) =>
                  setFilters((f) => ({ ...f, clientId: value === 'all' ? undefined : value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {meta.clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.nombre || `Cliente #${c.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Proyecto</Label>
              <Select
                value={filters.project || 'all'}
                onValueChange={(value) =>
                  setFilters((f) => ({ ...f, project: value === 'all' ? undefined : value }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {meta.projects.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Estado</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(value) =>
                  setFilters((f) => ({ ...f, status: value as any }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="done">Hechas</SelectItem>
                  <SelectItem value="all">Todas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Orden fecha límite</Label>
              <Select
                value={filters.orderByDue}
                onValueChange={(value) =>
                  setFilters((f) => ({ ...f, orderByDue: value as 'asc' | 'desc' }))
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Más urgentes primero</SelectItem>
                  <SelectItem value="desc">Más lejanas primero</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Lista de tareas */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de tareas</CardTitle>
          </CardHeader>
          <CardContent>
            {viewMode === 'table' ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold text-gray-500">
                      <th className="px-3 py-2">Título</th>
                      <th className="px-3 py-2">Persona</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Proyecto</th>
                      <th
                        className="px-3 py-2 cursor-pointer select-none"
                        onClick={() => {
                          setSortBy('priority')
                          setSortDir((d) => (sortBy === 'priority' && d === 'asc' ? 'desc' : 'asc'))
                        }}
                      >
                        Prioridad
                      </th>
                      <th
                        className="px-3 py-2 cursor-pointer select-none"
                        onClick={() => {
                          setSortBy('due_date')
                          setSortDir((d) => (sortBy === 'due_date' && d === 'asc' ? 'desc' : 'asc'))
                        }}
                      >
                        Fecha límite
                      </th>
                      <th
                        className="px-3 py-2 cursor-pointer select-none"
                        onClick={() => {
                          setSortBy('status')
                          setSortDir((d) => (sortBy === 'status' && d === 'asc' ? 'desc' : 'asc'))
                        }}
                      >
                        Estado
                      </th>
                      <th className="px-3 py-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTasks.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-gray-500">
                          No hay tareas con los filtros actuales.
                        </td>
                      </tr>
                    ) : (
                      sortedTasks.map((task) => (
                        <tr key={task.id} className="border-b last:border-none hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-gray-900">{task.title}</div>
                            {task.description && (
                              <div className="text-xs text-gray-500 line-clamp-2">{task.description}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{task.assignee_name || '-'}</td>
                          <td className="px-3 py-2 text-gray-700">
                            {task.client_name || (task.client_id ? `#${task.client_id}` : '-')}
                          </td>
                          <td className="px-3 py-2 text-gray-700">{task.project || '-'}</td>
                          <td className="px-3 py-2">
                            <PriorityBadge priority={task.priority} />
                          </td>
                          <td className="px-3 py-2 text-gray-700">{formatDate(task.due_date)}</td>
                          <td className="px-3 py-2">
                            <StatusBadge status={task.status} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-2">
                              {task.status !== 'done' && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => markDone(task)}
                                  title="Marcar como hecha"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => openEditTask(task)}
                                title="Editar tarea"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => deleteTask(task)}
                                title="Eliminar tarea"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sortedTasks.length === 0 ? (
                  <div className="col-span-full py-6 text-center text-gray-500 text-sm">
                    No hay tareas con los filtros actuales.
                  </div>
                ) : (
                  sortedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex flex-col justify-between rounded-xl border bg-white p-4 shadow-sm"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs text-gray-500 uppercase tracking-wide">
                              {task.project || 'Sin proyecto'}
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">{task.title}</h3>
                          </div>
                          <StatusBadge status={task.status} />
                        </div>
                        {task.description && (
                          <p className="text-xs text-gray-600 line-clamp-3">{task.description}</p>
                        )}
                        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                          <span>
                            <span className="font-medium">Persona:</span>{' '}
                            {task.assignee_name || 'Sin asignar'}
                          </span>
                          <span>
                            <span className="font-medium">Cliente:</span>{' '}
                            {task.client_name || (task.client_id ? `#${task.client_id}` : 'Sin cliente')}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PriorityBadge priority={task.priority} />
                          <span className="text-xs text-gray-500">{formatDate(task.due_date)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {task.status !== 'done' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => markDone(task)}
                              title="Marcar como hecha"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditTask(task)}
                            title="Editar tarea"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => deleteTask(task)}
                            title="Eliminar tarea"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Formulario modal simple inline */}
        {formOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg rounded-xl bg-white shadow-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingTask ? 'Editar tarea' : 'Nueva tarea'}
                </h2>
                <button
                  className="text-gray-500 hover:text-gray-700 text-sm"
                  onClick={() => setFormOpen(false)}
                >
                  Cerrar
                </button>
              </div>
              <form onSubmit={handleSaveTask} className="space-y-4">
                <div className="space-y-1">
                  <Label>Título</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Descripción</Label>
                  <textarea
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Persona</Label>
                    <select
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={form.assigneeId}
                      onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                    >
                      <option value="">Selecciona persona</option>
                      {teamMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 flex gap-2">
                      <Input
                        placeholder="Nueva persona (ej. Sergi)"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={creatingMember}
                        onClick={() => handleCreateMember()}
                        className="h-8 text-xs"
                      >
                        Añadir
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Cliente</Label>
                    <select
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={form.clientId}
                      onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                    >
                      <option value="">Selecciona cliente</option>
                      {meta.clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre || `Cliente #${c.id}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <Label>Proyecto</Label>
                    <Input
                      value={form.project}
                      onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}
                      placeholder="Nombre del proyecto"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Prioridad</Label>
                    <select
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                      value={form.priority}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, priority: e.target.value as any }))
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Fecha límite</Label>
                    <Input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setFormOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingTask ? 'Guardar cambios' : 'Crear tarea'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}


