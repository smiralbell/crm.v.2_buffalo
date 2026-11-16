import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowLeft, Loader2, Trash2, Copy, KeyRound, Eye, EyeOff, Pencil, ListTodo, ExternalLink } from 'lucide-react'
import DeleteUserDialog from '@/components/usuarios/DeleteUserDialog'
import type { CrmRole } from '@/lib/auth'
import UserProjectsEditor from '@/components/usuarios/UserProjectsEditor'
import UserWhatsAppAgentCard from '@/components/usuarios/UserWhatsAppAgentCard'

const ROLE_LABEL: Record<CrmRole, string> = {
  admin: 'Admin',
  developer: 'Developer',
  comercial: 'Comercial',
  project_manager: 'Project manager',
}

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

export default function UsuarioDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [user, setUser] = useState<{
    id: number
    name: string
    email: string
    role: CrmRole
    active: boolean
  } | null>(null)
  const [stats, setStats] = useState<{
    projects_count: number
    open_tickets_count: number
    open_tasks_count: number
  } | null>(null)
  const [projects, setProjects] = useState<
    { id: string; name: string; status: string; service_type: string }[]
  >([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [credentials, setCredentials] = useState<{ email: string; password: string | null } | null>(
    null
  )
  const [showPassword, setShowPassword] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

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

  const openProfileEdit = () => {
    if (!user) return
    setEditName(user.name)
    setEditEmail(user.email)
    setProfileOpen(true)
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSavingProfile(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          email: editEmail.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al actualizar')
      setUser((u) => (u && data.user ? { ...u, ...data.user } : u))
      setCredentials((c) =>
        c && data.user ? { ...c, email: data.user.email } : c
      )
      setProfileOpen(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error')
    } finally {
      setSavingProfile(false)
    }
  }

  return (
    <Layout>
      <div className="w-full space-y-6">
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
            {(() => {
              const isDeveloperUser = user.role === 'developer'
              return (
                <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">{user.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{ROLE_LABEL[user.role] || user.role}</Badge>
                  <Badge variant="secondary" className={user.active ? '' : 'opacity-60'}>
                    {user.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl gap-1.5"
                  onClick={openProfileEdit}
                >
                  <Pencil className="h-4 w-4" />
                  Editar nombre / correo
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={toggleActive}>
                  {user.active ? 'Desactivar' : 'Activar'}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Borrar usuario
                </Button>
              </div>
            </div>

            {credentials && user.role !== 'admin' && (
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
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Proyectos', value: stats.projects_count },
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

            {(isDeveloperUser || user.role === 'project_manager') && (
              <UserProjectsEditor
                userId={user.id}
                description={
                  user.role === 'project_manager'
                    ? 'Solo verá estos proyectos en Onboarding, Proyectos y Retención. Leads, Pipelines y Marketing los ve completos.'
                    : 'Proyectos en los que trabaja (Proyectos, Retención y tickets).'
                }
                onSaved={load}
              />
            )}

            {!isDeveloperUser && user.role === 'comercial' && (
              <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
                Los comerciales acceden al dashboard de cold calling, campañas y facturas propias desde su panel lateral.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                  <ListTodo className="h-4 w-4 text-gray-500" />
                  Tareas
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Su tablero de tareas: las sueltas
                  {user.role === 'comercial' ? '' : ' y las de sus proyectos'}. Desde ahí le puedes poner tareas nuevas.
                </p>
              </div>
              <a
                href={`/usuarios/${user.id}/tareas`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
              >
                Abrir tareas
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {(isDeveloperUser || user.role === 'project_manager') && (
              <UserWhatsAppAgentCard
                userId={user.id}
                userName={user.name}
                roleLabel={user.role === 'project_manager' ? 'project manager' : 'developer'}
              />
            )}
                </>
              )
            })()}
          </>
        ) : null}
      </div>

      <DeleteUserDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        user={user}
        onDeleted={() => void router.push('/usuarios')}
      />

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

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar nombre y correo</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit_name">Nombre</Label>
              <Input
                id="edit_name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nombre visible"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_email">Correo</Label>
              <Input
                id="edit_email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                required
              />
            </div>
            <p className="text-xs text-gray-500">
              Solo cambia nombre y correo. Rol y contraseña se quedan igual. Si cambias el correo,
              ese usuario entra con el nuevo email la próxima vez.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProfileOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
