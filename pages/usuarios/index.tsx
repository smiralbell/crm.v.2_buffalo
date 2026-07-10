import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, UserPlus, RefreshCw } from 'lucide-react'
import type { CrmUserPublic } from '@/lib/crm-users'
import type { CrmRole } from '@/lib/auth'
import type { UserWorkStats } from '@/lib/developer/assignments'

type UserRow = CrmUserPublic & { stats: UserWorkStats | null }

const ROLE_LABEL: Record<CrmRole, string> = {
  admin: 'Admin',
  developer: 'Developer',
  comercial: 'Comercial',
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

export default function UsuariosPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'developer' | 'comercial'>('developer')

  const load = () => {
    setLoading(true)
    setError('')
    fetch('/api/users')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || d.hint || 'Error al cargar')
        setUsers(d.users || [])
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear')
      setName('')
      setEmail('')
      setPassword('')
      setRole('developer')
      setCreateOpen(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Layout>
      <div className="w-full max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Usuarios</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 h-9 border border-gray-200 text-sm rounded-xl hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Button className="gap-2 rounded-xl" onClick={() => setCreateOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Nuevo usuario
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Cargando...</div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No hay usuarios creados</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-600">
                    <th className="px-4 py-3 text-left font-medium">Nombre</th>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Rol</th>
                    <th className="px-4 py-3 text-left font-medium">Estado</th>
                    <th className="px-4 py-3 text-center font-medium">Proyectos</th>
                    <th className="px-4 py-3 text-center font-medium">Asignaciones</th>
                    <th className="px-4 py-3 text-center font-medium">Tickets</th>
                    <th className="px-4 py-3 text-center font-medium">Tareas</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      role="link"
                      tabIndex={0}
                      onClick={() => router.push(`/usuarios/${u.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          router.push(`/usuarios/${u.id}`)
                        }
                      }}
                      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                      <td className="px-4 py-3 text-gray-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-gray-700">
                          {ROLE_LABEL[u.role] || u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {u.active ? (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                            Activo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-400">
                            Inactivo
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-700">
                        {u.stats?.projects_count ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-700">
                        {u.stats?.open_assignments_count ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-700">
                        {u.stats?.open_tickets_count ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-700">
                        {u.stats?.open_tasks_count ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={createUser} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="u_role">Rol</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as 'developer' | 'comercial')}
              >
                <SelectTrigger id="u_role" className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="comercial">Comercial</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {role === 'comercial'
                  ? 'Acceso a dashboard de campañas, cold calling y facturas propias.'
                  : 'Acceso al panel de proyectos, tickets y facturas propias.'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u_name">Nombre</Label>
              <Input
                id="u_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Laura"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u_email">Email</Label>
              <Input
                id="u_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="laura@buffalo.ai"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u_pass">Contraseña</Label>
              <Input
                id="u_pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                minLength={8}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating} className="gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Crear usuario
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}
