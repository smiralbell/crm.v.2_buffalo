import { GetServerSideProps } from 'next'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Settings, AlertCircle, Check, Save } from 'lucide-react'

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
  const [drafts, setDrafts] = useState<Record<string, { url: string; token: string }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [needsMigration, setNeedsMigration] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/tickets/config')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      const list: ProjectConfig[] = data.projects || []
      setProjects(list)
      setNeedsMigration(!!data.needs_migration)
      setDrafts(
        Object.fromEntries(
          list.map((p) => [
            p.id,
            {
              url: p.ticket_callback_url || '',
              token: p.ticket_callback_token || '',
            },
          ])
        )
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (projectId: string) => {
    const draft = drafts[projectId]
    if (!draft) return
    setSavingId(projectId)
    setError('')
    try {
      const res = await fetch('/api/tickets/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          ticket_callback_url: draft.url,
          ticket_callback_token: draft.token,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setSavedId(projectId)
      setTimeout(() => setSavedId(null), 2000)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Link
            href="/tickets"
            className="inline-flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-400" />
              Configurar respuestas
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              URL y token del webhook de cada cliente para enviar respuestas y cambios de estado.
            </p>
          </div>
        </div>

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
        ) : projects.length === 0 ? (
          <Card className="border border-gray-200">
            <CardContent className="py-12 text-center text-sm text-gray-400">
              No hay proyectos configurados todavía.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {projects.map((p) => (
              <Card key={p.id} className="border border-gray-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                    <span>{p.name}</span>
                    {p.config_ref && (
                      <span className="text-xs font-mono font-normal text-gray-400">{p.config_ref}</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">URL callback del cliente</label>
                    <input
                      type="url"
                      value={drafts[p.id]?.url ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], url: e.target.value, token: d[p.id]?.token ?? '' } }))
                      }
                      placeholder="https://dashboard.cliente.com/api/webhooks/buffalo-tickets"
                      className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Token Bearer (opcional)</label>
                    <input
                      type="text"
                      value={drafts[p.id]?.token ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [p.id]: { url: d[p.id]?.url ?? '', token: e.target.value } }))
                      }
                      placeholder="token-secreto-del-cliente"
                      className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm font-mono"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-gray-400">
                      {p.ticket_count} incidencia{p.ticket_count === 1 ? '' : 's'}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => save(p.id)}
                      disabled={savingId === p.id}
                      className="bg-gray-900 hover:bg-gray-800"
                    >
                      {savedId === p.id ? (
                        <><Check className="h-4 w-4 mr-1" /> Guardado</>
                      ) : (
                        <><Save className="h-4 w-4 mr-1" /> Guardar</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
