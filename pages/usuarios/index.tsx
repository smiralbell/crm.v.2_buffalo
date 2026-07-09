import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, UserPlus, Shield, Code } from 'lucide-react'
import type { CrmUserPublic } from '@/lib/crm-users'

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
  const [users, setUsers] = useState<CrmUserPublic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

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
        body: JSON.stringify({ name, email, password, role: 'developer' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo crear')
      setName('')
      setEmail('')
      setPassword('')
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (id: number, active: boolean) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    if (res.ok) load()
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crea cuentas para developers. Solo tendrán acceso a Proyectos y tickets asignados.
          </p>
        </div>

        <form
          onSubmit={createUser}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4"
        >
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Nuevo developer
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600" htmlFor="u_name">
                Nombre
              </label>
              <Input
                id="u_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Laura"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-600" htmlFor="u_email">
                Email
              </label>
              <Input
                id="u_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="laura@buffalo.ai"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600" htmlFor="u_pass">
              Contraseña
            </label>
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
          <Button type="submit" disabled={creating} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Crear usuario
          </Button>
        </form>

        {error && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Usuarios del CRM</h2>
          </div>
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">Cargando...</div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">No hay usuarios creados</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {users.map((u) => (
                <li key={u.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{u.name}</p>
                      <Badge
                        variant="outline"
                        className={
                          u.role === 'admin'
                            ? 'border-gray-300 text-gray-700'
                            : 'border-indigo-200 text-indigo-700 bg-indigo-50'
                        }
                      >
                        {u.role === 'admin' ? (
                          <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Admin</span>
                        ) : (
                          <span className="flex items-center gap-1"><Code className="h-3 w-3" /> Developer</span>
                        )}
                      </Badge>
                      {!u.active && (
                        <Badge variant="outline" className="text-gray-400 border-gray-200">
                          Inactivo
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate mt-0.5">{u.email}</p>
                  </div>
                  {u.role === 'developer' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(u.id, u.active)}
                      className="shrink-0"
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  )
}
