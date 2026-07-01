import Head from 'next/head'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PublicOutboundForm from '@/components/demos/PublicOutboundForm'
import type { OutboundFormFieldRef } from '@/lib/demos/types'
import { Lock, PhoneCall } from 'lucide-react'

type GateState = 'loading' | 'password' | 'form' | 'inactive' | 'error'

export default function PublicFormularioPage() {
  const router = useRouter()
  const token = router.query.token as string | undefined

  const [gate, setGate] = useState<GateState>('loading')
  const [nombreCliente, setNombreCliente] = useState('')
  const [fields, setFields] = useState<OutboundFormFieldRef[]>([])
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [pageError, setPageError] = useState('')

  const loadMeta = useCallback(async () => {
    if (!token) return
    setGate('loading')
    setPageError('')
    try {
      const res = await fetch(`/api/formulario/${token}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Formulario no disponible')

      setNombreCliente(data.nombre_cliente || 'Demo')

      if (!data.active) {
        setGate('inactive')
        return
      }

      if (data.authenticated && Array.isArray(data.fields)) {
        setFields(data.fields)
        setGate('form')
        return
      }

      if (!data.has_password) {
        setPageError('Este formulario aún no está activado. Contacta con quien te lo envió.')
        setGate('error')
        return
      }

      setGate('password')
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Error al cargar')
      setGate('error')
    }
  }, [token])

  useEffect(() => {
    if (router.isReady && token) loadMeta()
  }, [router.isReady, token, loadMeta])

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !password.trim()) return
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch(`/api/formulario/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Contraseña incorrecta')
      setFields(data.fields || [])
      setGate('form')
      setPassword('')
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Error de acceso')
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <>
      <Head>
        <title>{nombreCliente ? `${nombreCliente} — Formulario` : 'Formulario'}</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white px-4 py-10">
        <div className="mx-auto max-w-lg">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100">
              <PhoneCall className="h-6 w-6 text-violet-700" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              {nombreCliente || 'Formulario de contacto'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">Solicitud de llamada telefónica</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {gate === 'loading' && (
              <p className="text-center text-sm text-gray-500">Cargando…</p>
            )}

            {gate === 'error' && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {pageError}
              </p>
            )}

            {gate === 'inactive' && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Este formulario no está disponible en este momento.
              </p>
            )}

            {gate === 'password' && (
              <form onSubmit={submitPassword} className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Lock className="h-4 w-4 text-violet-600" />
                  Introduce la contraseña que te han facilitado para acceder.
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="form-password">Contraseña</Label>
                  <Input
                    id="form-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="rounded-xl"
                    autoFocus
                    placeholder="Contraseña de acceso"
                  />
                </div>
                {authError && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {authError}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={authLoading || !password.trim()}
                  className="w-full rounded-xl bg-violet-700 hover:bg-violet-800"
                >
                  {authLoading ? 'Verificando…' : 'Acceder al formulario'}
                </Button>
              </form>
            )}

            {gate === 'form' && token && (
              <PublicOutboundForm
                token={token}
                demoNombre={nombreCliente}
                fields={fields}
              />
            )}
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">Powered by Engranaje</p>
        </div>
      </div>
    </>
  )
}
