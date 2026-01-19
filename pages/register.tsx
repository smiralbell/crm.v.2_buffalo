import { useState } from 'react'
import { useRouter } from 'next/router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Register() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>('user')
  const [adminKey, setAdminKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name: name || undefined,
          role,
          adminKey: role === 'admin' ? adminKey : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al registrarse')
        setLoading(false)
        return
      }

      // Tras registrarse, va al dashboard (ya logueado)
      router.push('/dashboard')
    } catch (err) {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Crear cuenta</CardTitle>
          <CardDescription>
            Regístrate como usuario o administrador (requiere clave)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                type="text"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setRole('user')}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                    role === 'user'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700'
                  }`}
                  disabled={loading}
                >
                  Usuario
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                    role === 'admin'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700'
                  }`}
                  disabled={loading}
                >
                  Administrador
                </button>
              </div>
            </div>
            {role === 'admin' && (
              <div className="space-y-2">
                <Label htmlFor="adminKey">Clave de administrador</Label>
                <Input
                  id="adminKey"
                  type="password"
                  placeholder="Clave secreta"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  required={role === 'admin'}
                  disabled={loading}
                />
              </div>
            )}
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creando cuenta...' : 'Registrarse'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


