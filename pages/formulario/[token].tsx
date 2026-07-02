import Head from 'next/head'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import PublicOutboundForm from '@/components/demos/PublicOutboundForm'
import PublicFormShell, { PublicFormButton } from '@/components/demos/PublicFormShell'
import {
  DEFAULT_OUTBOUND_FORM_BRANDING,
  FORM_FONT_OPTIONS,
  googleFontsHref,
  normalizeFormFontId,
  resolveFormFontFamily,
  type FormFontId,
} from '@/lib/demos/form-branding'
import type { OutboundFormBrandingRef, OutboundFormFieldRef } from '@/lib/demos/types'
import { Lock } from 'lucide-react'

type GateState = 'loading' | 'password' | 'form' | 'inactive' | 'error'

export default function PublicFormularioPage() {
  const router = useRouter()
  const token = router.query.token as string | undefined

  const [gate, setGate] = useState<GateState>('loading')
  const [nombreCliente, setNombreCliente] = useState('')
  const [fields, setFields] = useState<OutboundFormFieldRef[]>([])
  const [branding, setBranding] = useState<OutboundFormBrandingRef>(DEFAULT_OUTBOUND_FORM_BRANDING)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [pageError, setPageError] = useState('')

  const applyMeta = (data: Record<string, unknown>) => {
    setNombreCliente(String(data.nombre_cliente || 'Demo'))
    if (data.branding && typeof data.branding === 'object') {
      const b = data.branding as OutboundFormBrandingRef
      setBranding({
        ...DEFAULT_OUTBOUND_FORM_BRANDING,
        ...b,
        font_id: normalizeFormFontId(b.font_id),
      })
    }
  }

  const fontHref = googleFontsHref(normalizeFormFontId(branding.font_id))

  const loadMeta = useCallback(async () => {
    if (!token) return
    setGate('loading')
    setPageError('')
    try {
      const res = await fetch(`/api/formulario/${token}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Formulario no disponible')

      applyMeta(data)

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
      applyMeta(data)
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
        {fontHref && <link rel="stylesheet" href={fontHref} />}
      </Head>
      <PublicFormShell nombreCliente={nombreCliente} branding={branding}>
        {gate === 'loading' && <p className="text-center text-sm text-gray-500">Cargando…</p>}

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
              <Lock className="h-4 w-4" style={{ color: branding.color_secondary }} />
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
            <PublicFormButton type="submit" disabled={authLoading || !password.trim()}>
              {authLoading ? 'Verificando…' : 'Acceder al formulario'}
            </PublicFormButton>
          </form>
        )}

        {gate === 'form' && token && (
          <PublicOutboundForm token={token} fields={fields} branding={branding} />
        )}
      </PublicFormShell>
    </>
  )
}
