import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertCircle, Check, Save, Search } from 'lucide-react'

interface ProjectConfig {
  id: string
  name: string
  config_ref: string | null
  ticket_callback_url: string | null
  ticket_callback_token: string | null
  ticket_count: number
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

export default function TicketsConfigPage() {
  const [projects, setProjects] = useState<ProjectConfig[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftUrl, setDraftUrl] = useState('')
  const [draftToken, setDraftToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [needsMigration, setNeedsMigration] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tickets/config')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setProjects(data.projects || [])
      setNeedsMigration(!!data.needs_migration)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return projects.slice(0, 8)
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.config_ref && p.config_ref.toLowerCase().includes(q))
    ).slice(0, 8)
  }, [projects, search])

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedId) ?? null,
    [projects, selectedId]
  )

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

  return (
    <Layout>
      <div className="space-y-5 max-w-xl mx-auto">
        <Link
          href="/tickets"
          className="inline-flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {needsMigration && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Ejecuta en Postgres: <code className="font-mono text-xs">prisma/ALTER_PROYECTOS_TICKET_CALLBACK.sql</code>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Cargando…</div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  if (selected && e.target.value !== selected.name) {
                    setSelectedId(null)
                  }
                }}
                onFocus={() => {
                  if (selected) setSearch('')
                  setSelectedId(null)
                }}
                placeholder="Buscar cliente o proyecto…"
                className="w-full h-11 rounded-xl border border-gray-200 pl-10 pr-3 text-sm"
              />
              {search && !selectedId && filtered.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => pickProject(p)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                      >
                        <p className="text-sm font-medium text-gray-900">{p.name}</p>
                        {p.config_ref && (
                          <p className="text-xs font-mono text-gray-400 mt-0.5">{p.config_ref}</p>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {search && !selectedId && filtered.length === 0 && (
                <p className="mt-2 text-sm text-gray-400 px-1">Sin resultados</p>
              )}
            </div>

            {selected && (
              <Card className="border border-gray-200 shadow-sm">
                <CardContent className="pt-6 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selected.name}</p>
                    {selected.config_ref && (
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{selected.config_ref}</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">URL callback</label>
                    <input
                      type="url"
                      value={draftUrl}
                      onChange={(e) => setDraftUrl(e.target.value)}
                      placeholder="https://dashboard.cliente.com/api/webhooks/buffalo-tickets"
                      className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Token Bearer</label>
                    <input
                      type="text"
                      value={draftToken}
                      onChange={(e) => setDraftToken(e.target.value)}
                      placeholder="opcional"
                      className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono"
                    />
                  </div>
                  <Button
                    onClick={save}
                    disabled={saving}
                    className="w-full bg-gray-900 hover:bg-gray-800"
                  >
                    {saved ? (
                      <><Check className="h-4 w-4 mr-2" /> Guardado</>
                    ) : (
                      <><Save className="h-4 w-4 mr-2" /> Guardar</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
