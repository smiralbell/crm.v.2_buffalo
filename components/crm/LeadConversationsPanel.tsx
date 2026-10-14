import { useEffect, useMemo, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Msg = { channel: string; thread: string; role: 'contacto' | 'buffalo'; text: string; at: string | null }

const CHANNEL_LABEL: Record<string, string> = { web_chat: 'Chat web', whatsapp: 'WhatsApp' }

/** Conversaciones del lead en todos los canales (chat web y WhatsApp), agrupadas por hilo. */
export default function LeadConversationsPanel({ leadId }: { leadId: number }) {
  const [messages, setMessages] = useState<Msg[] | null>(null)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/leads/${leadId}/conversations`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d) => setMessages(d.messages || []))
      .catch(() => setMessages([]))
  }, [leadId])

  const threads = useMemo(() => {
    const map = new Map<string, { label: string; channel: string; items: Msg[] }>()
    for (const m of messages || []) {
      const t = map.get(m.thread) || {
        label: m.thread.startsWith('WhatsApp') ? m.thread : CHANNEL_LABEL[m.channel] || m.channel,
        channel: m.channel,
        items: [],
      }
      t.items.push(m)
      map.set(m.thread, t)
    }
    return Array.from(map.entries())
  }, [messages])

  if (!messages || messages.length === 0) return null
  const current = threads.find(([k]) => k === active) || threads[0]

  return (
    <Card className="border-gray-200 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          Conversaciones
        </CardTitle>
        {threads.length > 1 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {threads.map(([key, t]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActive(key)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  key === current[0] ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {t.label} · {t.items.length}
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {current[1].items.map((m, i) => (
            <li key={i} className={cn('flex', m.role === 'contacto' ? 'justify-start' : 'justify-end')}>
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                  m.role === 'contacto' ? 'bg-gray-100 text-gray-900' : 'bg-emerald-50 text-emerald-950'
                )}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.at && (
                  <p className="mt-1 text-[10px] text-gray-400">
                    {new Date(m.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
