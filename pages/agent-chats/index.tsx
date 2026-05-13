import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronRight, MessageSquare, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionRow {
  sessionId: string
  messageCount: number
}

const SESSIONS_CACHE_MS = 45_000

function sessionHref(sessionId: string) {
  return `/agent-chats/${encodeURIComponent(sessionId)}`
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)
    return { props: {} }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

export default function AgentChatsIndexPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)

  const sessionsAbortRef = useRef<AbortController | null>(null)
  const sessionsCacheRef = useRef<{
    key: string
    sessions: SessionRow[]
    totalPages: number
    at: number
  } | null>(null)

  const loadSessions = useCallback(async () => {
    const cacheKey = `${page}|${search}`
    const cached = sessionsCacheRef.current
    if (cached && cached.key === cacheKey && Date.now() - cached.at < SESSIONS_CACHE_MS) {
      setSessions(cached.sessions)
      setTotalPages(cached.totalPages)
      setListLoading(false)
      setListError(null)
      return
    }

    sessionsAbortRef.current?.abort()
    const ac = new AbortController()
    sessionsAbortRef.current = ac

    setListLoading(true)
    setListError(null)
    try {
      const q = new URLSearchParams({
        page: String(page),
        search,
        pageSize: '15',
      })
      const res = await fetch(`/api/agent-chats/sessions?${q}`, { signal: ac.signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudieron cargar las sesiones')
      }
      const data = await res.json()
      const raw = (data.sessions || []) as {
        sessionId: string
        messageCount: number
      }[]
      const nextSessions: SessionRow[] = raw.map((r) => ({
        sessionId: r.sessionId,
        messageCount: r.messageCount,
      }))
      const nextTotalPages = data.pagination?.totalPages ?? 1
      setSessions(nextSessions)
      setTotalPages(nextTotalPages)
      sessionsCacheRef.current = {
        key: cacheKey,
        sessions: nextSessions,
        totalPages: nextTotalPages,
        at: Date.now(),
      }
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError')
      if (aborted) return
      setListError(e instanceof Error ? e.message : 'Error desconocido')
      setSessions([])
    } finally {
      if (!ac.signal.aborted) setListLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    void loadSessions()
    return () => {
      sessionsAbortRef.current?.abort()
    }
  }, [loadSessions])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-[min(100%,1400px)] pb-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-end">
            <form onSubmit={handleSearch} className="flex w-full gap-2 sm:max-w-xl">
              <Input
                placeholder="Buscar por session_id…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="border-slate-200 bg-white"
              />
              <Button type="submit" variant="secondary" className="shrink-0 px-3">
                <Search className="h-4 w-4" />
              </Button>
            </form>
          </div>
          {listError ? (
            <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{listError}</div>
          ) : null}

          {listLoading ? (
            <div className="flex items-center justify-center py-20 text-sm text-slate-500">
              Cargando sesiones…
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-sm text-slate-500">
              <MessageSquare className="h-10 w-10 text-slate-300" />
              No hay sesiones que coincidan.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-0 text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Sesión</th>
                    <th className="w-28 px-4 py-3.5 text-right">Mensajes</th>
                    <th className="w-14 px-3 py-3.5" aria-hidden />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <tr key={s.sessionId} className="group transition-colors hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <Link
                          href={sessionHref(s.sessionId)}
                          className="block font-mono text-[13px] font-medium text-slate-900 decoration-slate-300 underline-offset-2 hover:underline"
                        >
                          {s.sessionId}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-right tabular-nums text-slate-600">{s.messageCount}</td>
                      <td className="px-3 py-4">
                        <Link
                          href={sessionHref(s.sessionId)}
                          className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full border border-slate-200',
                            'bg-white text-slate-400 transition-all',
                            'group-hover:border-slate-300 group-hover:bg-slate-900 group-hover:text-white'
                          )}
                          aria-label="Abrir conversación"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-3.5 text-sm text-slate-600">
            <span className="tabular-nums">
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-slate-200 bg-white"
                disabled={page <= 1 || listLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-slate-200 bg-white"
                disabled={page >= totalPages || listLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
