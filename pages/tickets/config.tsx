import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { AlertCircle, ArrowLeft, ArrowRightLeft, Check, Copy, KeyRound, Save, Search, Siren, Ticket } from 'lucide-react'
import TicketsWebhookGuideDownload from '@/components/tickets/TicketsWebhookGuideDownload'
import { cn } from '@/lib/utils'

interface ProjectConfig {
  id: string
  name: string
  config_ref: string | null
  ticket_callback_url: string | null
  ticket_callback_token: string | null
  ticket_count: number
}

interface Connection {
  tickets_webhook_url: string
  tickets_webhook_token: string
  incidents_webhook_url: string
  incidents_webhook_token: string | null
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

/** Una fila con un dato y su botón de copiar. */
function CopyField({ label, value, hint }: { label: string; value: string; hint?: React.ReactNode }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // sin portapapeles: se puede seleccionar a mano
    }
  }
  return (
    <div>
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <code
          className="min-w-0 flex-1 select-all truncate rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800"
          title={value}
        >
          {value || '—'}
        </code>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          aria-label={`Copiar ${label}`}
          className="shrink-0 rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  )
}

function Block({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Ticket
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export default function TicketsConfigPage() {
  const [projects, setProjects] = useState<ProjectConfig[]>([])
  const [conn, setConn] = useState<Connection | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftUrl, setDraftUrl] = useState('')
  const [draftToken, setDraftToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [envCopied, setEnvCopied] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tickets/config')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setProjects(data.projects || [])
      setConn(data.connection || null)
      setNeedsMigration(!!data.needs_migration)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects.slice(0, 8)
    return projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.config_ref && p.config_ref.toLowerCase().includes(q)) ||
          p.id.toLowerCase().startsWith(q)
      )
      .slice(0, 8)
  }, [projects, search])

  const selected = useMemo(() => projects.find((p) => p.id === selectedId) ?? null, [projects, selectedId])

  const pickProject = (p: ProjectConfig) => {
    setSelectedId(p.id)
    setSearch(p.name)
    setDraftUrl(p.ticket_callback_url || '')
    setDraftToken(p.ticket_callback_token || '')
    setSaved(false)
  }

  const save = async () => {
    if (!selectedId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/tickets/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: selectedId,
          ticket_callback_url: draftUrl,
          ticket_callback_token: draftToken,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  /** Las variables tal cual van en el .env / EasyPanel del panel del cliente. */
  const envBlock = useMemo(() => {
    if (!selected || !conn) return ''
    return [
      `BUFFALO_TICKETS_WEBHOOK_URL=${conn.tickets_webhook_url}`,
      `BUFFALO_TICKETS_WEBHOOK_TOKEN=${conn.tickets_webhook_token}`,
      `BUFFALO_PROJECT_REF=${selected.config_ref || selected.id}`,
      `BUFFALO_CALLBACK_TOKEN=${draftToken}`,
    ].join('\n')
  }, [selected, conn, draftToken])

  const copyEnv = async () => {
    try {
      await navigator.clipboard.writeText(envBlock)
      setEnvCopied(true)
      setTimeout(() => setEnvCopied(false), 1500)
    } catch {
      // sin portapapeles
    }
  }

  const callbackDirty =
    !!selected &&
    (draftUrl !== (selected.ticket_callback_url || '') || draftToken !== (selected.ticket_callback_token || ''))

  return (
    <Layout>
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link href="/tickets">
            <Button variant="ghost" size="sm" className="rounded-xl text-gray-600">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Tickets
            </Button>
          </Link>
          <TicketsWebhookGuideDownload compact />
        </div>

        {needsMigration && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Ejecuta en Postgres: <code className="font-mono text-xs">prisma/ALTER_PROYECTOS_TICKET_CALLBACK.sql</code>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading && !projects.length ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  if (selected && e.target.value !== selected.name) setSelectedId(null)
                }}
                onFocus={() => {
                  if (selected) setSearch('')
                  setSelectedId(null)
                }}
                placeholder="Busca un cliente, su referencia o su ID…"
                className="h-12 w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-3 text-sm shadow-sm"
              />
              {search && !selectedId && filtered.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pickProject(p)}
                        className="flex w-full items-center justify-between gap-3 border-b border-gray-50 px-4 py-3 text-left last:border-0 hover:bg-gray-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">{p.name}</span>
                          <span className="block truncate font-mono text-xs text-gray-400">{p.config_ref || p.id}</span>
                        </span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {p.ticket_count} ticket{p.ticket_count === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {search && !selectedId && filtered.length === 0 && (
                <p className="mt-2 px-1 text-sm text-gray-400">Sin resultados</p>
              )}
            </div>

            {!selected && !search && (
              <p className="px-1 text-sm text-gray-500">
                Busca un cliente para ver todo lo que necesita su panel: referencia del proyecto, tokens, URLs y las
                variables listas para copiar.
              </p>
            )}

            {selected && conn && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-gray-900 px-5 py-4 text-white">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{selected.name}</p>
                    <p className="truncate font-mono text-xs text-gray-400">
                      {selected.config_ref || 'Sin referencia: se usa el ID del proyecto'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs">
                    {selected.ticket_count} ticket{selected.ticket_count === 1 ? '' : 's'}
                  </span>
                </div>

                <Block
                  icon={KeyRound}
                  title="Variables para el panel del cliente"
                  subtitle="Pégalas en el .env o en EasyPanel de su panel."
                >
                  <pre className="overflow-x-auto rounded-xl bg-gray-950 px-4 py-3 font-mono text-xs leading-relaxed text-gray-100">
                    {envBlock}
                  </pre>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-gray-400">
                      {draftToken
                        ? 'BUFFALO_CALLBACK_TOKEN es el token de callback de abajo.'
                        : 'Aún no hay token de callback: escríbelo abajo y guarda.'}
                    </p>
                    <Button size="sm" variant="outline" className="shrink-0 rounded-xl" onClick={copyEnv}>
                      {envCopied ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}
                      Copiar todo
                    </Button>
                  </div>
                </Block>

                <Block
                  icon={Ticket}
                  title="Tickets · del panel del cliente al CRM"
                  subtitle="Cuando el cliente abre un ticket, su panel lo manda aquí."
                >
                  <CopyField label="Endpoint" value={conn.tickets_webhook_url} />
                  <CopyField
                    label="Token (Authorization: Bearer)"
                    value={conn.tickets_webhook_token}
                    hint={
                      <>
                        El mismo para todos los clientes. Viene de <code className="text-[10px]">TICKETS_WEBHOOK_TOKEN</code>.
                      </>
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CopyField
                      label="project_ref"
                      value={selected.config_ref || ''}
                      hint={selected.config_ref ? undefined : 'Este proyecto no tiene referencia: usa project_id.'}
                    />
                    <CopyField label="project_id" value={selected.id} />
                  </div>
                </Block>

                <Block
                  icon={ArrowRightLeft}
                  title="Respuestas · del CRM al panel del cliente"
                  subtitle="Cuando respondéis o cambiáis el estado de un ticket, el CRM avisa a esta URL."
                >
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">URL de callback</span>
                    <input
                      type="url"
                      value={draftUrl}
                      onChange={(e) => setDraftUrl(e.target.value)}
                      placeholder="https://dashboard.cliente.com/api/webhooks/buffalo-tickets"
                      className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Token de callback (BUFFALO_CALLBACK_TOKEN)
                    </span>
                    <input
                      type="text"
                      value={draftToken}
                      onChange={(e) => setDraftToken(e.target.value)}
                      placeholder="Distinto para cada cliente"
                      className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 font-mono text-sm"
                    />
                  </label>
                  <div className="flex justify-end">
                    <Button onClick={save} disabled={saving || !callbackDirty} className="rounded-xl">
                      {saved ? (
                        <>
                          <Check className="mr-2 h-4 w-4" /> Guardado
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" /> Guardar
                        </>
                      )}
                    </Button>
                  </div>
                </Block>

                <Block
                  icon={Siren}
                  title="Incidencias · errores de producción (Retención)"
                  subtitle="Para que su sistema nos avise de errores, igual que en la pestaña Incidencias."
                >
                  <CopyField label="Endpoint" value={conn.incidents_webhook_url} />
                  <CopyField
                    label="Token (Authorization: Bearer)"
                    value={conn.incidents_webhook_token || ''}
                    hint={
                      <>
                        El mismo para todos. Viene de <code className="text-[10px]">RETENCION_INCIDENTS_TOKEN</code>.
                      </>
                    }
                  />
                  <CopyField label="client_id (este proyecto)" value={selected.id} />
                </Block>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
