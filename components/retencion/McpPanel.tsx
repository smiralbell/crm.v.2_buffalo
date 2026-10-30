import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/AuthContext'

/**
 * Conectores MCP del proyecto, con el mismo flujo que los «custom connectors» de Claude:
 * nombre + URL → detecta la autenticación → inicio de sesión, cliente OAuth y cabeceras → Añadir.
 */

type ToolInfo = { name: string; description?: string; annotations?: { readOnlyHint?: boolean; title?: string } | null }

type Connector = {
  id: number
  nombre: string
  url: string
  auth_mode: 'oauth' | 'none'
  oauth_client: 'published' | 'auto' | 'custom'
  header_names: string[]
  auth_server: string | null
  sesion_iniciada: boolean
  disabled_tools: string[]
  estado: 'pendiente' | 'conectado' | 'bloqueado' | 'error'
  detalle: string | null
  server_name: string | null
  tools: ToolInfo[]
  checked_at: string | null
}

type Detection = {
  abierto: boolean
  oauth: boolean
  servidor_autorizacion: string | null
  registro_automatico: boolean
  identidad_publicada: boolean
  necesita_cabeceras: boolean
  error: string | null
}

type SignIn = 'now' | 'later' | 'none'
type OAuthClient = 'published' | 'auto' | 'custom'
type Header = { name: string; value: string }

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none'

function api(proyectoId: string, path = '') {
  return `/api/retencion/proyectos/${proyectoId}/mcp${path}`
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Ha fallado la petición'), { data })
  return data as T
}

/** Ventana del login abierta en el mismo clic (si no, el navegador la bloquea). */
function openLoginWindow(): Window | null {
  const w = 520
  const h = 680
  const left = Math.max(0, window.screenX + (window.outerWidth - w) / 2)
  const top = Math.max(0, window.screenY + (window.outerHeight - h) / 2)
  return window.open('about:blank', 'buffalo-mcp-login', `width=${w},height=${h},left=${left},top=${top}`)
}

function StatusBadge({ c }: { c: Connector }) {
  const map = {
    conectado: ['Conectado', 'bg-emerald-50 text-emerald-700'],
    pendiente: ['Sin conectar', 'bg-gray-100 text-gray-600'],
    bloqueado: ['Bloqueado', 'bg-amber-50 text-amber-800'],
    error: ['Error', 'bg-red-50 text-red-700'],
  } as const
  const [label, cls] = map[c.estado]
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

function Radio({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  title: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
        checked ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <input type="radio" className="mt-0.5 accent-gray-900" checked={checked} onChange={onChange} disabled={disabled} />
      <span>
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>}
      </span>
    </label>
  )
}

function AddConnectorDialog({
  proyectoId,
  onClose,
  onAdded,
}: {
  proyectoId: string
  onClose: () => void
  onAdded: (c: Connector, loginWindow: Window | null, authorizeUrl?: string) => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [nombre, setNombre] = useState('')
  const [url, setUrl] = useState('')
  const [detection, setDetection] = useState<Detection | null>(null)
  const [signIn, setSignIn] = useState<SignIn>('now')
  const [oauthClient, setOauthClient] = useState<OAuthClient>('published')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [headers, setHeaders] = useState<Header[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [blocked, setBlocked] = useState<{ name: string; motivo: string }[]>([])

  const detect = async () => {
    setBusy(true)
    setError('')
    try {
      const { deteccion } = await send<{ deteccion: Detection }>(api(proyectoId, '/detect'), 'POST', { url })
      if (deteccion.error && !deteccion.abierto) throw new Error(deteccion.error)
      setDetection(deteccion)
      // Lo detectado preselecciona las opciones, como en Claude.
      setSignIn(deteccion.oauth ? 'now' : 'none')
      setOauthClient(deteccion.identidad_publicada ? 'published' : deteccion.registro_automatico ? 'auto' : 'custom')
      if (deteccion.necesita_cabeceras && !headers.length) setHeaders([{ name: 'Authorization', value: '' }])
      setStep(2)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    setBusy(true)
    setError('')
    setBlocked([])
    const loginWindow = signIn === 'now' ? openLoginWindow() : null
    try {
      const data = await send<{ server: Connector; authorize_url?: string | null; error_login?: string }>(
        api(proyectoId),
        'POST',
        {
          nombre,
          url,
          sign_in: signIn,
          oauth_client: oauthClient,
          client_id: oauthClient === 'custom' ? clientId : null,
          client_secret: oauthClient === 'custom' ? clientSecret : null,
          headers: headers.filter((h) => h.name.trim() || h.value),
          auth_server: detection?.servidor_autorizacion || null,
        }
      )
      if (data.error_login) {
        loginWindow?.close()
        setError(data.error_login)
        onAdded(data.server, null)
        return
      }
      onAdded(data.server, loginWindow, data.authorize_url || undefined)
    } catch (e) {
      loginWindow?.close()
      const d = (e as { data?: { bloqueadas?: { name: string; motivo: string }[] } }).data
      setBlocked(Array.isArray(d?.bloqueadas) ? d!.bloqueadas : [])
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const canAdd =
    nombre.trim() &&
    url.trim() &&
    (signIn === 'none' || oauthClient !== 'custom' || clientId.trim()) &&
    headers.every((h) => (!h.name.trim() && !h.value) || (h.name.trim() && h.value))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !busy && onClose()}>
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Atrás">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-base font-semibold text-gray-900">Añadir conector personalizado</h2>
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">MCP</span>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <>
              <p className="text-sm text-gray-500">
                Conecta el servidor MCP remoto del proyecto. Usa solo conectores de developers de confianza.
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Nombre</span>
                <input className={inputCls} value={nombre} autoFocus onChange={(e) => setNombre(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">URL del servidor MCP remoto</span>
                <input
                  className={inputCls}
                  value={url}
                  spellCheck={false}
                  placeholder="https://mcp.cliente.com/mcp"
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && url.trim() && void detect()}
                />
              </label>
            </>
          )}

          {step === 2 && detection && (
            <>
              <div className="flex items-start gap-2 rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <p>
                  {detection.oauth
                    ? `Este servidor usa inicio de sesión OAuth${detection.servidor_autorizacion ? ` (${detection.servidor_autorizacion})` : ''}.`
                    : detection.necesita_cabeceras
                      ? 'Este servidor pide credenciales pero no ofrece inicio de sesión: añade su clave en las cabeceras.'
                      : 'Este servidor no pide inicio de sesión.'}{' '}
                  Revisa lo detectado y cámbialo si tu servidor necesita otra cosa.
                </p>
              </div>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-gray-900">Autenticación</h3>
                <div className="space-y-2">
                  <Radio
                    checked={signIn === 'now'}
                    onChange={() => setSignIn('now')}
                    title="Iniciar sesión ahora"
                    hint="Se abre la página del servicio para entrar y dar permiso."
                  />
                  <Radio
                    checked={signIn === 'later'}
                    onChange={() => setSignIn('later')}
                    title="Iniciar sesión más tarde"
                    hint="Se añade el conector y se conecta luego con el botón Conectar."
                  />
                  <Radio checked={signIn === 'none'} onChange={() => setSignIn('none')} title="Sin inicio de sesión" />
                </div>
              </section>

              {signIn !== 'none' && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Cliente OAuth</h3>
                  <div className="space-y-2">
                    <Radio
                      checked={oauthClient === 'published'}
                      onChange={() => setOauthClient('published')}
                      title="Usar la identidad publicada del CRM (recomendado)"
                      hint={
                        detection.identidad_publicada
                          ? 'El servidor la admite.'
                          : 'Si el servidor no la admite, se registra automáticamente.'
                      }
                    />
                    <Radio
                      checked={oauthClient === 'auto'}
                      onChange={() => setOauthClient('auto')}
                      title="Registrar automáticamente"
                      hint={detection.registro_automatico ? 'El servidor admite registro dinámico.' : 'El servidor no anuncia registro dinámico.'}
                    />
                    <Radio checked={oauthClient === 'custom'} onChange={() => setOauthClient('custom')} title="Usar mi propio cliente OAuth" />
                  </div>
                  {oauthClient === 'custom' && (
                    <div className="mt-3 space-y-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-600">Client ID</span>
                        <input className={inputCls} value={clientId} spellCheck={false} onChange={(e) => setClientId(e.target.value)} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-600">Client secret (opcional)</span>
                        <input
                          type="password"
                          autoComplete="off"
                          className={inputCls}
                          value={clientSecret}
                          onChange={(e) => setClientSecret(e.target.value)}
                        />
                      </label>
                      <p className="text-xs text-gray-400">
                        URL de retorno que debes dar de alta en tu cliente:{' '}
                        <span className="break-all font-mono text-gray-600">{`${window.location.origin}/api/retencion/mcp/oauth/callback`}</span>
                      </p>
                    </div>
                  )}
                </section>
              )}

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Cabeceras de la petición</h3>
                  <button
                    type="button"
                    onClick={() => setHeaders([...headers, { name: '', value: '' }])}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Añadir cabecera
                  </button>
                </div>
                <p className="mb-2 text-xs text-gray-500">
                  Credenciales fijas, como una API key o un token, si el servidor no usa OAuth. Se envían en cada petición y se guardan cifradas.
                </p>
                {headers.map((h, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <input
                      className={`${inputCls} w-2/5`}
                      placeholder="Authorization"
                      spellCheck={false}
                      value={h.name}
                      onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                    <input
                      type="password"
                      autoComplete="off"
                      className={inputCls}
                      placeholder="Bearer …"
                      value={h.value}
                      onChange={(e) => setHeaders(headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    />
                    <button
                      type="button"
                      onClick={() => setHeaders(headers.filter((_, j) => j !== i))}
                      className="rounded-lg px-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Quitar cabecera"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </section>

              <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs text-emerald-900">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Solo se conectan MCP de solo lectura: todas sus herramientas deben declarar <code>readOnlyHint: true</code>. Se comprueba
                  al conectar y antes de cada consulta del agente.
                </p>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
              <p>{error}</p>
              {blocked.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4">
                  {blocked.slice(0, 15).map((b) => (
                    <li key={b.name}>
                      <span className="font-mono">{b.name}</span>: {b.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={step === 1 ? onClose : () => setStep(1)}
            className="rounded-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            {step === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={() => void detect()}
              disabled={busy || !nombre.trim() || !url.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Continuar
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void add()}
              disabled={busy || !canAdd}
              className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy ? (signIn === 'none' ? 'Comprobando…' : 'Añadiendo…') : 'Añadir'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ConnectorDetail({
  c,
  isAdmin,
  busy,
  onConnect,
  onDisconnect,
  onCheck,
  onRemove,
  onToggleTool,
}: {
  c: Connector
  isAdmin: boolean
  busy: string | null
  onConnect: () => void
  onDisconnect: () => void
  onCheck: () => void
  onRemove: () => void
  onToggleTool: (name: string, enabled: boolean) => void
}) {
  const [menu, setMenu] = useState(false)
  const needsLogin = c.auth_mode === 'oauth' && !c.sesion_iniciada
  const enabledCount = c.tools.filter((t) => !c.disabled_tools.includes(t.name)).length

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
            <Plug className="h-5 w-5 text-gray-500" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-gray-900">{c.nombre}</h3>
              <span className="rounded-full border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">Personalizado</span>
              <StatusBadge c={c} />
            </div>
            <p className="mt-1 truncate text-xs text-gray-500">{c.url}</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {c.auth_mode === 'oauth' ? `OAuth${c.auth_server ? ` · ${c.auth_server}` : ''}` : 'Sin inicio de sesión'}
              {c.header_names.length > 0 && ` · cabeceras: ${c.header_names.join(', ')}`}
              {c.checked_at && ` · comprobado ${new Date(c.checked_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}`}
            </p>
          </div>
        </div>
        <div className="relative flex items-center gap-2">
          {isAdmin && c.auth_mode === 'oauth' && (needsLogin || c.estado === 'bloqueado') ? (
            <button
              type="button"
              onClick={onConnect}
              disabled={busy === 'connect'}
              className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy === 'connect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Conectar
            </button>
          ) : (
            isAdmin &&
            c.auth_mode === 'oauth' && (
              <button
                type="button"
                onClick={onDisconnect}
                className="rounded-full border border-gray-200 px-4 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
              >
                Desconectar
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setMenu(!menu)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Más opciones"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-10 z-10 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
              <button
                type="button"
                onClick={() => {
                  setMenu(false)
                  onCheck()
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Comprobar ahora
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false)
                    onRemove()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Quitar
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {busy === 'check' && (
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Comprobando el conector…
        </div>
      )}

      {c.estado !== 'conectado' && (
        <div className="border-b border-gray-100 px-5 py-3">
          <div
            className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs ${
              c.estado === 'pendiente' ? 'bg-gray-50 text-gray-600' : 'bg-amber-50 text-amber-900'
            }`}
          >
            {c.estado === 'pendiente' ? <KeyRound className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <p>
              {c.estado === 'pendiente'
                ? 'Falta iniciar sesión. Pulsa Conectar para entrar en el servicio y dar permiso.'
                : `${c.detalle || 'No se ha podido conectar.'} El agente no lo usará hasta que pase la comprobación.`}
            </p>
          </div>
        </div>
      )}

      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">Permisos de las herramientas</h4>
            <p className="mt-0.5 text-xs text-gray-500">
              {c.tools.length
                ? `${enabledCount} de ${c.tools.length} activadas para el agente de Telegram`
                : 'Las herramientas aparecerán al conectar.'}
            </p>
          </div>
        </div>
        {c.tools.length > 0 && (
          <>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Herramientas de solo lectura</p>
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
              {c.tools.map((t) => {
                const enabled = !c.disabled_tools.includes(t.name)
                const ro = t.annotations?.readOnlyHint === true
                return (
                  <li key={t.name} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 items-start gap-2">
                      {ro ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900">{t.annotations?.title || t.name}</p>
                        {t.annotations?.title && <p className="font-mono text-[11px] text-gray-400">{t.name}</p>}
                        {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{t.description}</p>}
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      disabled={!isAdmin}
                      onClick={() => onToggleTool(t.name, !enabled)}
                      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                        enabled ? 'bg-gray-900' : 'bg-gray-200'
                      }`}
                      aria-label={enabled ? `Desactivar ${t.name}` : `Activar ${t.name}`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-[18px]' : 'left-0.5'}`}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

export default function McpPanel({ proyectoId }: { proyectoId: string; proyectoName?: string }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [connectors, setConnectors] = useState<Connector[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await send<{ servers: Connector[] }>(api(proyectoId), 'GET')
      setConnectors(data.servers)
      setSelectedId((prev) => (prev && data.servers.some((s) => s.id === prev) ? prev : data.servers[0]?.id ?? null))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => {
    void load()
  }, [load])

  // La ventana del login avisa al terminar.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'buffalo-mcp-oauth') return
      setBusy(null)
      setNotice({ ok: Boolean(e.data.ok), text: String(e.data.mensaje || '') })
      void load()
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [load])

  const selected = useMemo(() => connectors.find((c) => c.id === selectedId) || null, [connectors, selectedId])

  const replace = (c: Connector | null) => {
    if (c) setConnectors((prev) => prev.map((x) => (x.id === c.id ? c : x)))
  }

  const goToLogin = (win: Window | null, url: string) => {
    if (win && !win.closed) win.location.href = url
    else window.location.href = url
  }

  const connect = async (c: Connector) => {
    const win = openLoginWindow()
    setBusy('connect')
    setNotice(null)
    try {
      const data = await send<{ authorize_url?: string; server?: Connector }>(api(proyectoId, `/${c.id}`), 'POST', { accion: 'conectar' })
      if (data.authorize_url) {
        goToLogin(win, data.authorize_url)
        return
      }
      win?.close()
      replace(data.server || null)
      setBusy(null)
    } catch (e) {
      win?.close()
      setBusy(null)
      setNotice({ ok: false, text: e instanceof Error ? e.message : String(e) })
    }
  }

  const check = async (c: Connector) => {
    setBusy('check')
    try {
      const data = await send<{ server: Connector }>(api(proyectoId, `/${c.id}`), 'POST', { accion: 'comprobar' })
      replace(data.server)
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (c: Connector) => {
    if (!window.confirm(`¿Cerrar la sesión de «${c.nombre}»? El agente dejará de poder consultarlo hasta que vuelvas a conectar.`)) return
    const data = await send<{ server: Connector }>(api(proyectoId, `/${c.id}`), 'POST', { accion: 'desconectar' })
    replace(data.server)
  }

  const remove = async (c: Connector) => {
    if (!window.confirm(`¿Quitar el conector «${c.nombre}»? Se borra su configuración y su sesión.`)) return
    await send(api(proyectoId, `/${c.id}`), 'DELETE')
    setConnectors((prev) => prev.filter((x) => x.id !== c.id))
    setSelectedId(null)
    void load()
  }

  const toggleTool = async (c: Connector, name: string, enabled: boolean) => {
    const disabled = enabled ? c.disabled_tools.filter((t) => t !== name) : [...c.disabled_tools, name]
    replace({ ...c, disabled_tools: disabled })
    try {
      const data = await send<{ server: Connector }>(api(proyectoId, `/${c.id}`), 'PATCH', { disabled_tools: disabled })
      replace(data.server)
    } catch {
      replace(c)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Conectores</h2>
          <p className="text-sm text-gray-500">MCP del proyecto para consultarlo desde el agente de Telegram. Solo lectura.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Añadir conector
          </button>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}
      {notice && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <p>{notice.text}</p>
          <button type="button" onClick={() => setNotice(null)} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Cerrar aviso">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading && <div className="py-10 text-center text-sm text-gray-400">Cargando…</div>}

      {!loading && !connectors.length && !error && (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-12 text-center">
          <Plug className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-900">Este proyecto aún no tiene conectores</p>
          <p className="mt-1 text-sm text-gray-500">Añade el MCP que han hecho los developers para poder consultarlo desde Telegram.</p>
        </div>
      )}

      {connectors.length > 0 && (
        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <ul className="space-y-1">
            {connectors.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    c.id === selectedId ? 'bg-gray-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white">
                    <Plug className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{c.nombre}</p>
                    <p className="truncate text-xs text-gray-500">
                      {c.estado === 'conectado' ? 'Conectado' : c.estado === 'pendiente' ? 'Sin conectar' : c.estado === 'bloqueado' ? 'Bloqueado' : 'Error'}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <ConnectorDetail
              c={selected}
              isAdmin={isAdmin}
              busy={busy}
              onConnect={() => void connect(selected)}
              onDisconnect={() => void disconnect(selected)}
              onCheck={() => void check(selected)}
              onRemove={() => void remove(selected)}
              onToggleTool={(name, enabled) => void toggleTool(selected, name, enabled)}
            />
          )}
        </div>
      )}

      {adding && (
        <AddConnectorDialog
          proyectoId={proyectoId}
          onClose={() => setAdding(false)}
          onAdded={(c, win, authorizeUrl) => {
            setAdding(false)
            setConnectors((prev) => [...prev.filter((x) => x.id !== c.id), c])
            setSelectedId(c.id)
            if (authorizeUrl) {
              setBusy('connect')
              goToLogin(win, authorizeUrl)
            } else {
              win?.close()
            }
          }}
        />
      )}
    </div>
  )
}
