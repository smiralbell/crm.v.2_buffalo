import { useState } from 'react'
import { ChevronDown, Loader2, MessagesSquare, RefreshCw } from 'lucide-react'

type Mensaje = { id: number; role: 'user' | 'assistant'; content: string; created_at: string }

/** Conversaciones de WhatsApp de un trabajador con el agente del equipo. Solo admin. */
export default function UserWhatsAppConversations({ userId, userName }: { userId: number; userName: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [phone, setPhone] = useState<string | null>(null)
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/users/${userId}/whatsapp-conversaciones`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((data as { error?: string }).error || 'No se pudieron cargar las conversaciones')
      setPhone((data as { phone: string | null }).phone)
      setMensajes((data as { mensajes: Mensaje[] }).mensajes)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las conversaciones')
    } finally {
      setLoading(false)
    }
  }

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && mensajes === null) void load()
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between gap-2 text-left">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <MessagesSquare className="h-4 w-4 text-gray-500" />
          Conversaciones de WhatsApp
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              Últimos mensajes de {userName} con el agente. Solo los ves tú como admin.
            </p>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Actualizar
            </button>
          </div>

          {error && <p className="text-xs text-red-700">{error}</p>}

          {mensajes && phone === null && (
            <p className="text-xs text-gray-400">Este usuario no tiene móvil de WhatsApp configurado.</p>
          )}

          {mensajes && phone !== null && mensajes.length === 0 && (
            <p className="text-xs text-gray-400">Todavía no hay conversaciones con {phone}.</p>
          )}

          {mensajes && mensajes.length > 0 && (
            <ul className="space-y-2 max-h-[28rem] overflow-y-auto rounded-xl bg-gray-50 p-3">
              {mensajes.map((m) => (
                <li key={m.id} className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      m.role === 'assistant'
                        ? 'bg-white border border-gray-200 text-gray-900'
                        : 'bg-gray-900 text-white'
                    }`}
                  >
                    <p>{m.content}</p>
                    <p className={`mt-1 text-[10px] ${m.role === 'assistant' ? 'text-gray-400' : 'text-gray-300'}`}>
                      {new Date(m.created_at).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
