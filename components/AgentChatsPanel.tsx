'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
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

export default function AgentChatsPanel({ embedded = false }: { embedded?: boolean }) {
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
      const raw = (data.sessions || []) as { sessionId: string; messageCount: number }[]
      const nextSessions = raw.map((r) => ({
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
    <div className={embedded ? '' : 'mx-auto w-full max-w-[min(100%,1400px)] pb-8'}>
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/50 p-4">
          <p className="text-xs text-gray-500 mb-3">
            Conversaciones del widget / chat web (historial n8n). Abre una sesión para ver el hilo completo.
          </p>
          <form onSubmit={handleSearch} className="flex w-full gap-2">
            <Input
              placeholder="Buscar por session_id…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="border-gray-200 bg-white flex-1"
            />
            <Button type="submit" variant="secondary" className="shrink-0 px-4 rounded-xl">
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </form>
        </div>
        {listError ? (
          <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{listError}</div>
        ) : null}

        {listLoading ? (
          <div className="flex flex-1 items-center justify-center py-20 text-sm text-gray-500">
            Cargando sesiones…
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-20 text-center text-sm text-gray-500">
            <MessageSquare className="h-10 w-10 text-gray-300" />
            No hay sesiones que coincidan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-0 text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50/90 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3.5">Sesión</th>
                  <th className="w-28 px-4 py-3.5 text-right">Mensajes</th>
                  <th className="w-14 px-3 py-3.5" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map((s) => (
                  <tr key={s.sessionId} className="group transition-colors hover:bg-gray-50/80">
                    <td className="px-5 py-4">
                      <Link
                        href={sessionHref(s.sessionId)}
                        className="block text-[13px] font-medium text-gray-900 tracking-wide decoration-gray-300 underline-offset-2 hover:underline"
                      >
                        {s.sessionId}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-right text-gray-600">{s.messageCount}</td>
                    <td className="px-3 py-4">
                      <Link
                        href={sessionHref(s.sessionId)}
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-full border border-gray-200',
                          'bg-white text-gray-400 transition-all',
                          'group-hover:border-gray-300 group-hover:bg-gray-900 group-hover:text-white'
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/50 px-5 py-3.5 text-sm text-gray-600">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-gray-200 bg-white"
              disabled={page <= 1 || listLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-gray-200 bg-white"
              disabled={page >= totalPages || listLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
