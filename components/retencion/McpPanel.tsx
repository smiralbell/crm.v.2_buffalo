import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Pencil, Plug, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import { useAuth } from '@/components/AuthContext'

type ToolInfo = {
  name: string
  description?: string
  annotations?: { readOnlyHint?: boolean; title?: string } | null
}

type McpServer = {
  id: number
  nombre: string
  url: string
  transport: 'auto' | 'http' | 'sse'
  auth_type: 'none' | 'bearer' | 'header'
  auth_header: string | null
  estado: 'conectado' | 'bloqueado' | 'error'
  detalle: string | null
  server_name: string | null
  tools: ToolInfo[]
  checked_at: string | null
  tiene_secreto: boolean
  secreto_pista: string | null
}

type Form = {
  nombre: string
  url: string
  transport: McpServer['transport']
  auth_type: McpServer['auth_type']
  auth_header: string
  auth_secret: string
}

const EMPTY: Form = { nombre: '', url: '', transport: 'auto', auth_type: 'bearer', auth_header: '', auth_secret: '' }

const inputCls =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none disabled:bg-gray-50'

function formatDate(v: string | null): string {
  return v ? new Date(v).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

export default function McpPanel({ proyectoId, proyectoName }: { proyectoId: string; proyectoName: string }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [servers, setServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<McpServer | 'new' | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [blocked, setBlocked] = useState<{ name: string; motivo: string }[]>([])
  const [checking, setChecking] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/mcp`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setServers(data.servers)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [proyectoId])

  useEffect(() => {
    void load()
  }, [load])

  const startNew = () => {
    setForm({ ...EMPTY, nombre: `MCP ${proyectoName}` })
    setFormError('')
    setBlocked([])
    setEditing('new')
  }

  const startEdit = (s: McpServer) => {
    setForm({
      nombre: s.nombre,
      url: s.url,
      transport: s.transport,
      auth_type: s.auth_type,
      auth_header: s.auth_header || '',
      auth_secret: '',
    })
    setFormError('')
    setBlocked([])
    setEditing(s)
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    setFormError('')
    setBlocked([])
    try {
      const isNew = editing === 'new'
      const body = {
        nombre: form.nombre,
        url: form.url,
        transport: form.transport,
        auth_type: form.auth_type,
        auth_header: form.auth_type === 'header' ? form.auth_header : null,
        // Al editar, dejarlo vacío mantiene el token guardado.
        ...(form.auth_type === 'none' ? { auth_secret: '' } : form.auth_secret || isNew ? { auth_secret: form.auth_secret } : {}),
      }
      const res = await fetch(
        isNew ? `/api/retencion/proyectos/${proyectoId}/mcp` : `/api/retencion/proyectos/${proyectoId}/mcp/${editing.id}`,
        { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      const data = await res.json()
      if (!res.ok) {
        setBlocked(Array.isArray(data.bloqueadas) ? data.bloqueadas : [])
        throw new Error(data.error || 'No se pudo conectar')
      }
      setEditing(null)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'No se pudo conectar')
    } finally {
      setSaving(false)
    }
  }

  const recheck = async (s: McpServer) => {
    setChecking(s.id)
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/mcp/${s.id}`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.server) setServers((prev) => prev.map((x) => (x.id === s.id ? data.server : x)))
    } finally {
      setChecking(null)
    }
  }

  const remove = async (s: McpServer) => {
    if (!window.confirm(`¿Desconectar «${s.nombre}»? El agente de Telegram dejará de poder consultarlo.`)) return
    const res = await fetch(`/api/retencion/proyectos/${proyectoId}/mcp/${s.id}`, { method: 'DELETE' })
    if (res.ok) setServers((prev) => prev.filter((x) => x.id !== s.id))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900">MCP del proyecto</p>
            <p className="mt-0.5">
              Conecta el MCP que han hecho los developers para consultar el proyecto desde el agente de Telegram. Solo se
              aceptan MCP de solo lectura: cada herramienta debe declarar <code className="text-xs">readOnlyHint: true</code>.
              Se comprueba al conectar y antes de cada consulta.
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={startNew}
            className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Conectar MCP
          </button>
        )}
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}

      {loading && !servers.length && <div className="py-10 text-center text-sm text-gray-400">Cargando…</div>}

      {!loading && !servers.length && !error && (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
          Este proyecto aún no tiene ningún MCP conectado.
        </p>
      )}

      {servers.map((s) => {
        const ok = s.estado === 'conectado'
        return (
          <article key={s.id} className={`rounded-2xl border bg-white p-4 ${ok ? 'border-gray-200' : 'border-amber-300'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-gray-400" />
                  <h3 className="truncate text-sm font-semibold text-gray-900">{s.nombre}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      ok ? 'bg-emerald-50 text-emerald-700' : s.estado === 'bloqueado' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {ok ? 'Conectado · solo lectura' : s.estado === 'bloqueado' ? 'Bloqueado' : 'Sin conexión'}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">{s.url}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {s.tools.length} herramienta(s)
                  {s.auth_type !== 'none' && ` · acceso ${s.auth_type === 'bearer' ? 'Bearer' : s.auth_header} ${s.secreto_pista || ''}`}
                  {` · comprobado ${formatDate(s.checked_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void recheck(s)}
                  disabled={checking === s.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${checking === s.id ? 'animate-spin' : ''}`} />
                  Comprobar
                </button>
                {isAdmin && (
                  <>
                    <button type="button" onClick={() => startEdit(s)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => void remove(s)} className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600" aria-label="Desconectar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {!ok && s.detalle && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{s.detalle} El agente no lo usará hasta que vuelva a pasar la comprobación.</p>
              </div>
            )}

            {s.tools.length > 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setOpen(open === s.id ? null : s.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open === s.id ? 'rotate-180' : ''}`} />
                  Ver herramientas
                </button>
                {open === s.id && (
                  <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-100">
                    {s.tools.map((t) => (
                      <li key={t.name} className="flex items-start gap-2 px-3 py-2">
                        {t.annotations?.readOnlyHint ? (
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        )}
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-gray-900">{t.name}</p>
                          {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{t.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </article>
        )
      })}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{editing === 'new' ? 'Conectar MCP' : 'Editar MCP'}</h2>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">Nombre</span>
                <input className={inputCls} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">URL del servidor MCP</span>
                <input
                  className={inputCls}
                  value={form.url}
                  spellCheck={false}
                  placeholder="https://mcp.cliente.com/mcp"
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Acceso</span>
                  <select
                    className={inputCls}
                    value={form.auth_type}
                    onChange={(e) => setForm({ ...form, auth_type: e.target.value as Form['auth_type'] })}
                  >
                    <option value="bearer">Token (Bearer)</option>
                    <option value="header">Cabecera propia</option>
                    <option value="none">Sin autenticación</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Transporte</span>
                  <select
                    className={inputCls}
                    value={form.transport}
                    onChange={(e) => setForm({ ...form, transport: e.target.value as Form['transport'] })}
                  >
                    <option value="auto">Automático</option>
                    <option value="http">Streamable HTTP</option>
                    <option value="sse">SSE</option>
                  </select>
                </label>
              </div>
              {form.auth_type === 'header' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Nombre de la cabecera</span>
                  <input
                    className={inputCls}
                    value={form.auth_header}
                    spellCheck={false}
                    placeholder="X-API-Key"
                    onChange={(e) => setForm({ ...form, auth_header: e.target.value })}
                  />
                </label>
              )}
              {form.auth_type !== 'none' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Token o clave</span>
                  <input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    className={inputCls}
                    value={form.auth_secret}
                    placeholder={editing !== 'new' && editing.tiene_secreto ? `Guardado ${editing.secreto_pista || ''} · déjalo vacío para mantenerlo` : ''}
                    onChange={(e) => setForm({ ...form, auth_secret: e.target.value })}
                  />
                  <span className="mt-1 block text-xs text-gray-400">Se guarda cifrado y no se vuelve a mostrar.</span>
                </label>
              )}
            </div>

            {formError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                <p>{formError}</p>
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

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !form.nombre.trim() || !form.url.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                {saving ? 'Comprobando…' : 'Comprobar y conectar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
