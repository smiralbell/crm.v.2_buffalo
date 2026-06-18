import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { requireAuth } from '@/lib/auth'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatChatMessageText } from '@/lib/format-chat-text'

interface ChatMessage {
  id: number
  role: string
  text: string
}

interface AgentChatSessionPageProps {
  sessionId: string
}

const MESSAGES_CACHE_MS = 120_000

export const getServerSideProps: GetServerSideProps<AgentChatSessionPageProps> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  const raw = context.params?.sessionId
  const sessionId = Array.isArray(raw) ? raw[0] : raw
  if (!sessionId || typeof sessionId !== 'string') {
    return { notFound: true }
  }

  return { props: { sessionId } }
}

export default function AgentChatSessionPage({ sessionId }: AgentChatSessionPageProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const cacheRef = useRef<{ at: number; messages: ChatMessage[]; truncated: boolean } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    const hit = cacheRef.current
    if (hit && Date.now() - hit.at < MESSAGES_CACHE_MS) {
      setMessages(hit.messages)
      setTruncated(hit.truncated)
      setLoading(false)
      setError(null)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams({ sessionId })
      const res = await fetch(`/api/agent-chats/messages?${q}`, { signal: ac.signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'No se pudieron cargar los mensajes')
      }
      const data = await res.json()
      const list = (data.messages || []) as ChatMessage[]
      const trunc = Boolean(data.truncated)
      setMessages(list)
      setTruncated(trunc)
      cacheRef.current = { messages: list, truncated: trunc, at: Date.now() }
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && e.name === 'AbortError')
      if (aborted) return
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
    return () => abortRef.current?.abort()
  }, [load])

  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [loading, messages])

  return (
    <Layout>
      <div className="mx-auto flex w-full min-h-[calc(100vh-8rem)] max-w-[min(100%,1400px)] flex-col">
        <header className="sticky top-0 z-20 mb-4 flex shrink-0 flex-col gap-3 rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" className="shrink-0 border-gray-200 bg-white rounded-xl" asChild>
              <Link href="/agent-chats">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Sesiones
              </Link>
            </Button>
            <div className="h-8 w-px shrink-0 bg-gray-200 hidden sm:block" aria-hidden />
            <p className="min-w-0 truncate text-xs text-gray-600 tracking-wide sm:text-[13px]" title={sessionId}>
              {sessionId}
            </p>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200/60 bg-gradient-to-b from-gray-50 via-white to-gray-50 shadow-inner">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: `radial-gradient(circle at 20% 10%, rgb(243 244 246 / 0.9) 0%, transparent 45%),
                radial-gradient(circle at 85% 90%, rgb(229 231 235 / 0.8) 0%, transparent 40%)`,
            }}
            aria-hidden
          />

          <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-10 sm:py-8">
            {error ? (
              <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
                {error}
              </div>
            ) : loading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-gray-500">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
                <p className="text-sm">Cargando conversación…</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-500">
                No hay mensajes en esta sesión.
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:gap-5">
                {truncated ? (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-center text-xs leading-relaxed text-amber-950 shadow-sm">
                    Vista parcial: solo se cargan los primeros mensajes para no saturar la base de datos.
                  </div>
                ) : null}

                {messages.map((m) => {
                  const isUser = m.role === 'user'
                  const isAssistant = m.role === 'assistant'
                  const body = formatChatMessageText(m.text)

                  return (
                    <div
                      key={m.id}
                      className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[min(100%,88%)] sm:max-w-[min(100%,75%)]',
                          isUser && 'pl-4 sm:pl-16',
                          !isUser && 'pr-4 sm:pr-16'
                        )}
                      >
                        <div
                          className={cn(
                            'relative px-4 py-3.5 text-[15px] leading-relaxed shadow-md sm:px-5 sm:py-4',
                            'ring-1 ring-black/5',
                            isUser &&
                              'rounded-2xl rounded-br-md bg-gray-900 text-white shadow-gray-900/15',
                            isAssistant &&
                              'rounded-2xl rounded-bl-md border border-gray-200/90 bg-white text-gray-800 shadow-gray-200/60',
                            !isUser &&
                              !isAssistant &&
                              'rounded-2xl rounded-bl-md border border-gray-200/90 bg-gray-50 text-gray-900'
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                            {body || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} className="h-1 shrink-0" aria-hidden />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
