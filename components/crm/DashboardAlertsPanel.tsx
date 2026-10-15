'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Loader2, ArrowRight, Mail, Send } from 'lucide-react'
import type { OpsAlertMessage } from '@/lib/ops-alerts-store'

export type { OpsAlertMessage as DashboardAlertItem }

type Props = {
  initialItems?: OpsAlertMessage[]
}

function stripCrmPrefix(subject: string) {
  return subject.replace(/^\[CRM\]\s*/i, '').trim() || 'Aviso CRM'
}

function preview(text: string, n = 180) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function formatWhen(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'Ahora'
  if (min < 60) return `Hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Hace ${h} h`
  return d.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function OpsAlertRow({ item }: { item: OpsAlertMessage }) {
  const channels = item.channels.filter((c) => c !== 'none')
  return (
    <li className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/40 px-3.5 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-100 bg-white text-amber-700">
        <Bell className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground leading-snug">
            {stripCrmPrefix(item.subject)}
          </p>
          <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
            {formatWhen(item.created_at)}
          </span>
        </div>
        {item.body && (
          <p className="text-xs text-foreground/80 mt-0.5 leading-snug whitespace-pre-wrap">
            {preview(item.body)}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {channels.includes('email') && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600">
              <Mail className="h-3 w-3" /> Mail
            </span>
          )}
          {channels.includes('telegram') && (
            <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-600">
              <Send className="h-3 w-3" /> Telegram
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

export default function DashboardAlertsPanel({ initialItems = [] }: Props) {
  const [items, setItems] = useState<OpsAlertMessage[]>(initialItems)
  const [loading, setLoading] = useState(initialItems.length === 0)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ops-alerts?page=1&pageSize=5')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error cargando alertas')
      setItems(data.items || [])
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  useEffect(() => {
    if (initialItems.length === 0) void load()
  }, [initialItems.length, load])

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertas
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Últimos avisos enviados por mail y Telegram
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {loading ? '…' : items.length}
          </span>
          <Link
            href="/alertas"
            className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
          >
            Ver más <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {error && (
        <p className="mb-3 text-xs text-red-600 rounded-lg bg-red-50 px-3 py-2">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando avisos…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Aún no hay avisos en el canal. Los próximos envíos de mail y Telegram aparecerán aquí.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <OpsAlertRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  )
}
