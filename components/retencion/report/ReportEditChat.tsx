'use client'

import { useRef, useState, useEffect } from 'react'
import { Loader2, ArrowUp, Sparkles, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export type EditChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type Props = {
  proyectoId: string
  reportId: string | null
  /** contenido BRM actual del informe */
  content: string
  /** callback cuando el editor devuelve un nuevo contenido */
  onContentUpdate: (content: string, note: string) => void
  disabled?: boolean
}

const SUGGESTIONS = [
  'Acorta el resumen ejecutivo',
  'Añade una sección de próximos pasos',
  'Mete la tabla de llamadas por día',
  'Tono más formal',
]

export default function ReportEditChat({
  proyectoId,
  reportId,
  content,
  onContentUpdate,
  disabled,
}: Props) {
  const [messages, setMessages] = useState<EditChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (instruction: string) => {
    const text = instruction.trim()
    if (!text || sending || !reportId) return
    setError('')
    setSending(true)
    const nextMessages: EditChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    try {
      const res = await fetch(
        `/api/retencion/proyectos/${proyectoId}/informes/${reportId}/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instruction: text,
            content,
            messages: messages.slice(-8),
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error editando el informe')
      const note: string = data.note || 'Informe actualizado'
      onContentUpdate(data.content || content, note)
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: data.warning ? `${note}\n\nAviso: ${data.warning}` : note,
        },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
      setMessages(nextMessages)
    } finally {
      setSending(false)
    }
  }

  const noReport = !reportId

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900">Editar en directo</p>
          <p className="text-[11px] text-zinc-400">Pide cambios y el informe se reescribe</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              Escribe una instrucción para retocar el informe. Ejemplos:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={noReport || sending || disabled}
                  onClick={() => void send(s)}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600 hover:border-zinc-300 hover:bg-white disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-6',
                m.role === 'user'
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-800'
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 px-3 py-2 text-[13px] text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Reescribiendo el informe…
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-600">
            <RotateCcw className="h-3.5 w-3.5" />
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            placeholder={noReport ? 'Abre un informe primero' : 'Ej: añade la tabla de llamadas por día…'}
            rows={2}
            disabled={noReport || sending || disabled}
            className="min-h-[44px] resize-none rounded-xl text-[13px]"
          />
          <Button
            type="button"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl"
            disabled={noReport || sending || disabled || !input.trim()}
            onClick={() => void send(input)}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
