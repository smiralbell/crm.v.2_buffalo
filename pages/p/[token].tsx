import Head from 'next/head'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'

/**
 * Portal del cliente: sus tickets y abrir uno nuevo. Público (enlace mágico), sin Layout del CRM.
 * Se sirve en el dominio de formularios (forms.agenciabuffalo.es/p/…).
 */
type Update = { author_name: string | null; message: string; status: string | null; is_from_client: boolean; created_at: string }
type Ticket = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  created_at: string
  updates: Update[]
}

const STATUS: Record<string, { label: string; cls: string }> = {
  open: { label: 'Abierto', cls: 'bg-sky-50 text-sky-700' },
  in_progress: { label: 'En curso', cls: 'bg-amber-50 text-amber-700' },
  resolved: { label: 'Resuelto', cls: 'bg-emerald-50 text-emerald-700' },
  closed: { label: 'Cerrado', cls: 'bg-gray-100 text-gray-600' },
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function PortalPage() {
  const router = useRouter()
  const token = typeof router.query.token === 'string' ? router.query.token : ''
  const [project, setProject] = useState<string>('')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading')
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium', reporter_name: '', reporter_email: '' })
  const [sending, setSending] = useState(false)
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/p/${encodeURIComponent(token)}`)
      if (res.status === 404) return setState('invalid')
      if (!res.ok) return setState('error')
      const data = await res.json()
      setProject(data.project?.name || '')
      setTickets(data.tickets || [])
      setState('ready')
    } catch {
      setState('error')
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setFormMsg(null)
    try {
      const res = await fetch(`/api/p/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar')
      setForm((f) => ({ ...f, title: '', description: '', priority: 'medium' }))
      setFormMsg({ ok: true, text: 'Recibido. El equipo ya está avisado.' })
      await load()
    } catch (err) {
      setFormMsg({ ok: false, text: err instanceof Error ? err.message : 'No se pudo enviar' })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Head>
        <title>{project ? `${project} · Buffalo` : 'Portal del cliente · Buffalo'}</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-900 sm:py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/buffalo-mark.png" alt="Buffalo" width={40} height={40} className="h-10 w-10 rounded-xl" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Portal del cliente</p>
              <h1 className="text-xl font-bold">{project || 'Buffalo'}</h1>
            </div>
          </header>

          {state === 'loading' && <p className="text-sm text-gray-500">Cargando…</p>}
          {state === 'invalid' && (
            <p className="rounded-2xl bg-white p-6 text-sm text-gray-600 shadow-sm">
              Este enlace no es válido o ha caducado. Pide uno nuevo a tu contacto en Buffalo.
            </p>
          )}
          {state === 'error' && (
            <p className="rounded-2xl bg-white p-6 text-sm text-red-600 shadow-sm">No se ha podido cargar. Inténtalo de nuevo en un momento.</p>
          )}

          {state === 'ready' && (
            <>
              <section className="rounded-2xl bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-base font-semibold">Abrir una incidencia</h2>
                <form onSubmit={submit} className="mt-4 space-y-3">
                  <input
                    required
                    minLength={3}
                    maxLength={200}
                    placeholder="¿Qué ocurre? (título)"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
                  />
                  <textarea
                    rows={4}
                    maxLength={5000}
                    placeholder="Cuéntanos los detalles: qué hacías, qué esperabas y qué pasó."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input
                      placeholder="Tu nombre"
                      value={form.reporter_name}
                      onChange={(e) => setForm({ ...form, reporter_name: e.target.value })}
                      className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Tu email"
                      value={form.reporter_email}
                      onChange={(e) => setForm({ ...form, reporter_email: e.target.value })}
                      className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
                    />
                    <select
                      value={form.priority}
                      onChange={(e) => setForm({ ...form, priority: e.target.value })}
                      className="h-11 rounded-xl border border-gray-200 px-3 text-sm"
                    >
                      <option value="low">Prioridad baja</option>
                      <option value="medium">Prioridad media</option>
                      <option value="high">Prioridad alta</option>
                      <option value="critical">Crítica (no funciona)</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={sending}
                      className="h-11 rounded-xl bg-gray-900 px-5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                    >
                      {sending ? 'Enviando…' : 'Enviar incidencia'}
                    </button>
                    {formMsg && <p className={formMsg.ok ? 'text-sm text-emerald-700' : 'text-sm text-red-600'}>{formMsg.text}</p>}
                  </div>
                </form>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-semibold">Mis tickets</h2>
                {tickets.length === 0 && <p className="text-sm text-gray-500">Todavía no has abierto ninguna incidencia.</p>}
                {tickets.map((t) => {
                  const st = STATUS[t.status] || { label: t.status, cls: 'bg-gray-100 text-gray-600' }
                  const isOpen = open === t.id
                  return (
                    <article key={t.id} className="rounded-2xl bg-white shadow-sm">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : t.id)}
                        className="flex w-full items-start justify-between gap-3 p-4 text-left"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{t.title}</p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {fmt(t.created_at)}
                            {t.updates.length ? ` · ${t.updates.length} respuesta(s)` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.label}</span>
                      </button>
                      {isOpen && (
                        <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3 text-sm">
                          {t.description && <p className="whitespace-pre-wrap text-gray-700">{t.description}</p>}
                          {t.updates.map((u, i) => (
                            <div key={i} className={`rounded-xl px-3 py-2 ${u.is_from_client ? 'bg-gray-50' : 'bg-emerald-50'}`}>
                              <p className="text-xs font-medium text-gray-500">
                                {u.is_from_client ? 'Tú' : u.author_name || 'Equipo Buffalo'} · {fmt(u.created_at)}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-gray-800">{u.message}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  )
                })}
              </section>
            </>
          )}
        </div>
      </main>
    </>
  )
}
