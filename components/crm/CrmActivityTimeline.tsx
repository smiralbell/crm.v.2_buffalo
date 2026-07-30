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
  Bell,
  Check,
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
  canResolve?: boolean
  rawId?: string
  dueAt?: string | null
  resolvedAt?: string | null
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
    case 'alert':
      return Bell
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

function toIsoFromLocalInput(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
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
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [kind, setKind] = useState<'note' | 'call' | 'alert'>('note')
  const [body, setBody] = useState('')
  const [dueAtLocal, setDueAtLocal] = useState('')
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
          due_at?: string | null
          resolved_at?: string | null
        }) => ({
          id: `stored-${it.id}`,
          kind: it.kind,
          title: it.title,
          detail: it.body,
          at: it.due_at || it.created_at,
          source: 'stored' as const,
          canDelete: true,
          canResolve: it.kind === 'alert' && !it.resolved_at,
          rawId: it.id,
          dueAt: it.due_at ?? null,
          resolvedAt: it.resolved_at ?? null,
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
        kind === 'alert'
          ? text.length > 80
            ? `Alerta · ${text.slice(0, 77)}…`
            : `Alerta · ${text}`
          : kind === 'call'
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
          due_at: kind === 'alert' ? toIsoFromLocalInput(dueAtLocal) : undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setBody('')
      setDueAtLocal('')
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

  const resolve = async (item: TimelineItem) => {
    const rawId = item.rawId || item.id.replace(/^stored-/, '')
    if (!rawId || !item.canResolve) return
    setResolvingId(rawId)
    try {
      const res = await fetch('/api/crm/activities?action=resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rawId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo resolver')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al resolver')
    } finally {
      setResolvingId(null)
    }
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
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['note', 'Nota'],
                ['call', 'Llamada'],
                ['alert', 'Alerta'],
              ] as const
            ).map(([k, label]) => (
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
              kind === 'alert'
                ? 'Pendiente de llamar, follow-up, esperar respuesta…'
                : kind === 'call'
                  ? 'Hoy he tenido una llamada y me ha dicho…'
                  : 'Añade una nota al hilo de la historia…'
            }
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
          {kind === 'alert' && (
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">
                Avisar a partir de (opcional)
              </label>
              <input
                type="datetime-local"
                value={dueAtLocal}
                onChange={(e) => setDueAtLocal(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Si lo dejas vacío, la alerta aparece ya en el dashboard hasta marcarla como hecha.
              </p>
            </div>
          )}
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
              {kind === 'alert' ? 'Crear alerta' : 'Guardar en historial'}
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
          Aún no hay eventos. Añade una nota, llamada o alerta.
        </p>
      ) : (
        <ol className="relative space-y-0 border-l border-gray-200 ml-2 max-h-[480px] overflow-y-auto pr-1">
          {merged.map((item) => {
            const Icon = kindIcon(item.kind)
            const isOpenAlert = item.kind === 'alert' && item.canResolve
            const isResolvedAlert = item.kind === 'alert' && item.resolvedAt
            return (
              <li key={item.id} className="relative pl-5 pb-4 last:pb-0 group">
                <span
                  className={cn(
                    'absolute -left-1.5 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-white ring-2',
                    isOpenAlert ? 'ring-amber-400' : 'ring-gray-200'
                  )}
                >
                  <Icon
                    className={cn(
                      'h-2.5 w-2.5',
                      isOpenAlert ? 'text-amber-600' : 'text-gray-500'
                    )}
                  />
                </span>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>
                      {isOpenAlert && (
                        <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          Alerta
                        </span>
                      )}
                      {isResolvedAlert && (
                        <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          Hecha
                        </span>
                      )}
                    </div>
                    {item.detail && (
                      <p className="text-xs text-gray-600 mt-0.5 leading-snug whitespace-pre-wrap">
                        {item.detail}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-400 mt-1">{formatWhen(item.at)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.canResolve && (
                      <button
                        type="button"
                        onClick={() => void resolve(item)}
                        disabled={resolvingId === item.rawId}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                        title="Marcar como hecha"
                      >
                        {resolvingId === item.rawId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Hecho
                      </button>
                    )}
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
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
