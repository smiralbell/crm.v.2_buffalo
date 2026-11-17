import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { AlertCircle, ArrowLeft, Search } from 'lucide-react'
import TicketsWebhookGuideDownload from '@/components/tickets/TicketsWebhookGuideDownload'
import TicketConnectionDetails, {
  type TicketConnection,
  type TicketProjectConfig,
} from '@/components/tickets/TicketConnectionDetails'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

/** Tickets → Conexión por cliente: busca un cliente y ve todo lo que necesita su panel. */
export default function TicketsConfigPage() {
  const [projects, setProjects] = useState<TicketProjectConfig[]>([])
  const [conn, setConn] = useState<TicketConnection | null>(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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

  const pickProject = (p: TicketProjectConfig) => {
    setSelectedId(p.id)
    setSearch(p.name)
  }

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

        <p className="px-1 text-sm text-gray-500">
          También lo tienes en cada proyecto de Retención, en la pestaña <b>Tickets</b> → <b>Conexión</b>.
        </p>

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
                <TicketConnectionDetails key={selected.id} project={selected} conn={conn} onSaved={() => void load()} />
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
