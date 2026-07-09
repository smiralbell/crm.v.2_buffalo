import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, Loader2, Plus, Trash2, FolderKanban, Copy, KeyRound, Eye, EyeOff } from 'lucide-react'
import type { DeveloperAssignment } from '@/lib/developer/assignments'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') {
      return { redirect: { destination: '/dashboard', permanent: false } }
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

const statusLabel: Record<string, string> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  done: 'Hecha',
  cancelled: 'Cancelada',
}

export default function UsuarioDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{
    id: number
    name: string
    email: string
    active: boolean
  } | null>(null)
  const [stats, setStats] = useState<{
    projects_count: number
    open_assignments_count: number
    open_tickets_count: number
    open_tasks_count: number
  } | null>(null)
  const [projects, setProjects] = useState<
    { id: string; name: string; status: string; service_type: string }[]
  >([])
  const [assignments, setAssignments] = useState<DeveloperAssignment[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [scopeText, setScopeText] = useState('')
  const [deliverables, setDeliverables] = useState('')
  const [referenceLinks, setReferenceLinks] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [credentials, setCredentials] = useState<{ email: string; password: string | null } | null>(
    null
  )
  const [showPassword, setShowPassword] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert(`${label} copiado`)
    } catch {
      alert('No se pudo copiar')
    }
  }

  const load = () => {
    if (!id || typeof id !== 'string') return
    setLoading(true)
    setError('')
    fetch(`/api/users/${id}/detail`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Error al cargar')
        setUser(d.user)
        setStats(d.stats)
        setProjects(d.projects || [])
        setAssignments(d.assignments || [])
        setCredentials(d.credentials || { email: d.user.email, password: null })
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (router.isReady && id) load()
  }, [router.isReady, id])

  const toggleActive = async () => {
    if (!user) return
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !user.active }),
    })
    if (res.ok) load()
  }

  const createAssignment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${user.id}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          summary: summary || undefined,
          scope_text: scopeText || undefined,
          deliverables: deliverables || undefined,
          reference_links: referenceLinks || undefined,
          due_date: dueDate || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.hint || data.error || 'Error al crear')
      setTitle('')
      setSummary('')
      setScopeText('')
      setDeliverables('')
      setReferenceLinks('')
      setDueDate('')
      setAssignOpen(false)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setSaving(false)
    }
  }

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setResettingPassword(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar')
      setCredentials((c) => (c ? { ...c, password: newPassword } : c))
      setNewPassword('')
      setPasswordOpen(false)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error')
    } finally {
      setResettingPassword(false)
    }
  }

  const removeAssignment = async (assignmentId: string) => {
    if (!user || !confirm('¿Eliminar esta asignación?')) return
    const res = await fetch(`/api/users/${user.id}/assignments/${assignmentId}`, {
      method: 'DELETE',
    })
    if (res.ok) load()
  }

  return (
    <Layout>
      <div className="w-full max-w-5xl mx-auto space-y-6">
        <Link
          href="/usuarios"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Usuarios
        </Link>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : user ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{user.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
                <div className="mt-2">
                  <Badge variant="secondary" className={user.active ? '' : 'opacity-60'}>
                    {user.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-xl" onClick={toggleActive}>
                  {user.active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button className="gap-2 rounded-xl" onClick={() => setAssignOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Nueva asignación
                </Button>
              </div>
            </div>

            {credentials && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-gray-900">Credenciales de acceso</h2>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 rounded-xl"
                    onClick={() => setPasswordOpen(true)}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Restablecer contraseña
                  </Button>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Correo</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-mono text-gray-900 break-all">{credentials.email}</p>
                      <button
                        type="button"
                        onClick={() => copyText(credentials.email, 'Correo')}
                        className="shrink-0 p-1.5 text-gray-400 hover:text-gray-700"
                        title="Copiar correo"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Contraseña</p>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-mono text-gray-900 break-all">
                        {credentials.password
                          ? showPassword
                            ? credentials.password
                            : '••••••••'
                          : 'Sin registrar — restablece para guardarla'}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        {credentials.password && (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="p-1.5 text-gray-400 hover:text-gray-700"
                              title={showPassword ? 'Ocultar' : 'Mostrar'}
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyText(credentials.password!, 'Contraseña')}
                              className="p-1.5 text-gray-400 hover:text-gray-700"
                              title="Copiar contraseña"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-400">
                  La contraseña se guarda cuando la creas o restableces desde aquí. Usuarios antiguos
                  pueden no tenerla hasta que la actualices.
                </p>
              </div>
            )}

            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Proyectos', value: stats.projects_count },
                  { label: 'Asignaciones abiertas', value: stats.open_assignments_count },
                  { label: 'Tickets abiertos', value: stats.open_tickets_count },
                  { label: 'Tareas abiertas', value: stats.open_tasks_count },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Asignaciones puntuales</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tareas sin proyecto grande — aparecen en Proyectos del developer como mini-proyecto.
                </p>
              </div>
              {assignments.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  Sin asignaciones puntuales
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {assignments.map((a) => (
                    <li key={a.id} className="px-5 py-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900">{a.title}</p>
                          <Badge variant="outline">{statusLabel[a.status] || a.status}</Badge>
                        </div>
                        {a.summary && (
                          <p className="text-sm text-gray-600 mt-1">{a.summary}</p>
                        )}
                        {a.due_date && (
                          <p className="text-xs text-gray-400 mt-1">
                            Entrega: {new Date(a.due_date).toLocaleDateString('es-ES')}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAssignment(a.id)}
                        className="shrink-0 text-red-500 hover:text-red-700"
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-900">Proyectos asignados</h2>
              </div>
              {projects.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  Sin proyectos vinculados
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {projects.map((p) => (
                    <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FolderKanban className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                      </div>
                      <Link
                        href={`/gestion-proyecto/proyectos/${p.id}`}
                        className="text-xs font-medium text-gray-500 hover:text-gray-900 shrink-0"
                      >
                        Ver →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </div>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva asignación para {user?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={createAssignment} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="a_title">Título *</Label>
              <Input
                id="a_title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Configurar API de Meta"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a_summary">Resumen breve</Label>
              <Input
                id="a_summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Entrar al Business Manager y dejar la integración lista"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a_scope">Qué tiene que hacer</Label>
              <Textarea
                id="a_scope"
                value={scopeText}
                onChange={(e) => setScopeText(e.target.value)}
                rows={4}
                placeholder="Pasos concretos, accesos necesarios, criterios de éxito..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a_deliverables">Entregables</Label>
              <Textarea
                id="a_deliverables"
                value={deliverables}
                onChange={(e) => setDeliverables(e.target.value)}
                rows={2}
                placeholder="Documento con IDs, capturas, checklist..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a_links">Enlaces de referencia</Label>
              <Textarea
                id="a_links"
                value={referenceLinks}
                onChange={(e) => setReferenceLinks(e.target.value)}
                rows={2}
                placeholder="URLs, docs internas..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="a_due">Fecha límite (opcional)</Label>
              <Input
                id="a_due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear asignación'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restablecer contraseña</DialogTitle>
          </DialogHeader>
          <form onSubmit={resetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new_pass">Nueva contraseña</Label>
              <Input
                id="new_pass"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required
              />
            </div>
            <p className="text-xs text-gray-500">
              Quedará visible en credenciales para que puedas compartirla con el developer.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={resettingPassword}>
                {resettingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
