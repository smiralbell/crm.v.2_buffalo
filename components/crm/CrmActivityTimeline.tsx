'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  History,
  Loader2,
  Phone,
  StickyNote,
  FileText,
  FolderKanban,
  Calendar,
  Plus,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TimelineItem = {
  id: string
  kind: string
  title: string
  detail?: string | null
  at: string
  source?: 'stored' | 'derived'
  canDelete?: boolean
  rawId?: string
}

type Props = {
  contactId?: number | null
  leadId?: number | null
  /** Eventos derivados (origen, reuniones…) ya calculados en servidor */
  derived?: TimelineItem[]
  title?: string
  subtitle?: string
  className?: string
  compact?: boolean
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function kindIcon(kind: string) {
  switch (kind) {
    case 'call':
      return Phone
    case 'note':
      return StickyNote
    case 'document':
      return FileText
    case 'onboarding':
    case 'project':
      return FolderKanban
    case 'meeting':
    case 'meeting_booked':
    case 'meeting_done':
      return Calendar
    case 'origin':
    case 'channel':
      return Sparkles
    default:
      return History
  }
}

export default function CrmActivityTimeline({
  contactId,
  leadId,
  derived = [],
  title = 'Historial',
  subtitle = 'Entrada, reuniones, documentos y notas manuales',
  className,
  compact,
}: Props) {
  const [stored, setStored] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<'note' | 'call'>('note')
  const [body, setBody] = useState('')
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    if (!contactId && !leadId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (contactId) q.set('contact_id', String(contactId))
      else if (leadId) q.set('lead_id', String(leadId))
      const res = await fetch(`/api/crm/activities?${q}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error cargando historial')
      const items: TimelineItem[] = (data.items || []).map(
        (it: {
          id: string
          kind: string
          title: string
          body?: string | null
          created_at: string
        }) => ({
          id: `stored-${it.id}`,
          kind: it.kind,
          title: it.title,
          detail: it.body,
          at: it.created_at,
          source: 'stored' as const,
          canDelete: true,
          rawId: it.id,
        })
      )
      setStored(items)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [contactId, leadId])

  useEffect(() => {
    void load()
  }, [load])

  const merged = useMemo(() => {
    const map = new Map<string, TimelineItem>()
    for (const d of derived) map.set(d.id, { ...d, source: d.source || 'derived' })
    for (const s of stored) map.set(s.id, s)
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    )
  }, [derived, stored])

  const submit = async () => {
    const text = body.trim()
    if (!text || saving) return
    setSaving(true)
    setError('')
    try {
      const titleText =
        kind === 'call'
          ? text.length > 80
            ? `Llamada · ${text.slice(0, 77)}…`
            : `Llamada · ${text}`
          : text.length > 80
            ? `Nota · ${text.slice(0, 77)}…`
            : `Nota · ${text}`
      const res = await fetch('/api/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId || undefined,
          lead_id: leadId || undefined,
          kind,
          title: titleText,
          body: text,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setBody('')
      setShowForm(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: TimelineItem) => {
    const rawId = item.rawId || item.id.replace(/^stored-/, '')
    if (!rawId || !item.canDelete) return
    if (!window.confirm('¿Borrar esta entrada del historial?')) return
    const res = await fetch(`/api/crm/activities?id=${encodeURIComponent(rawId)}`, {
      method: 'DELETE',
    })
    if (res.ok) await load()
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-white shadow-sm',
        compact ? 'p-3' : 'p-4',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <History className="h-4 w-4" />
            {title}
          </h3>
          {!compact && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Añadir
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50/80 p-3 space-y-2">
          <div className="flex gap-1.5">
            {([
              ['note', 'Nota'],
              ['call', 'Llamada'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium',
                  kind === k
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={
              kind === 'call'
                ? 'Hoy he tenido una llamada y me ha dicho…'
                : 'Añade una nota al hilo de la historia…'
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full px-3 py-1.5 text-xs text-gray-500 hover:bg-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !body.trim()}
              onClick={() => void submit()}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Guardar en historial
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mb-2 text-xs text-red-600 rounded-lg bg-red-50 px-3 py-2">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando historial…
        </div>
      ) : merged.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          Aún no hay eventos. Añade una nota o una llamada.
        </p>
      ) : (
        <ol className="relative space-y-0 border-l border-gray-200 ml-2 max-h-[480px] overflow-y-auto pr-1">
          {merged.map((item) => {
            const Icon = kindIcon(item.kind)
            return (
              <li key={item.id} className="relative pl-5 pb-4 last:pb-0 group">
                <span className="absolute -left-1.5 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-white ring-2 ring-gray-200">
                  <Icon className="h-2.5 w-2.5 text-gray-500" />
                </span>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>
                    {item.detail && (
                      <p className="text-xs text-gray-600 mt-0.5 leading-snug whitespace-pre-wrap">
                        {item.detail}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1">{formatWhen(item.at)}</p>
                  </div>
                  {item.canDelete && (
                    <button
                      type="button"
                      onClick={() => void remove(item)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Borrar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
