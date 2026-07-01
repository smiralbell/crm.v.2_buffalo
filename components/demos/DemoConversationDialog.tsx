import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import type { DemoConversationDetail, DemoMessage } from '@/lib/demos/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  demoId: number
  phone: string | null
  phoneLabel?: string
}

function fmtTime(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function splitAssistantBlocks(content: string): string[] {
  return content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

function MessageBubble({ message }: { message: DemoMessage }) {
  const isUser = message.role === 'user'
  const blocks = isUser ? [message.content] : splitAssistantBlocks(message.content)

  return (
    <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      {blocks.map((block, i) => (
        <div
          key={`${message.at || 't'}-${i}`}
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'rounded-br-md bg-emerald-600 text-white'
              : 'rounded-bl-md border border-gray-200 bg-white text-gray-800 shadow-sm'
          }`}
        >
          {block}
        </div>
      ))}
      {message.at && (
        <span className="px-1 text-[11px] text-gray-400">{fmtTime(message.at)}</span>
      )}
    </div>
  )
}

export default function DemoConversationDialog({
  open,
  onOpenChange,
  demoId,
  phone,
  phoneLabel,
}: Props) {
  const [data, setData] = useState<DemoConversationDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    if (!phone) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(
        `/api/demos/${demoId}/conversation?phone=${encodeURIComponent(phone)}`
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al cargar conversación')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && phone) {
      void load()
    } else if (!open) {
      setData(null)
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, phone, demoId])

  const messages = data?.messages ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-base">Conversación</DialogTitle>
              <DialogDescription className="font-mono text-xs">
                {phoneLabel || phone}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-lg"
              onClick={load}
              disabled={loading}
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-[#e5ddd5] px-4 py-4">
          {loading && messages.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-sm text-gray-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Cargando mensajes…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : messages.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">Sin mensajes todavía</p>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <MessageBubble key={`${msg.at || idx}-${msg.role}`} message={msg} />
              ))}
            </div>
          )}
        </div>

        {data && (
          <div className="border-t border-gray-100 bg-gray-50 px-5 py-2 text-xs text-gray-500">
            {messages.length} mensaje(s) · Última actividad{' '}
            {data.updated_at ? fmtTime(data.updated_at) : '—'}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
