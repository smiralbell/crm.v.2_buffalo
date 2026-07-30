'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Calendar, Check, Loader2, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DashboardAlertItem = {
  id: string
  source: 'manual' | 'meeting'
  severity: 'info' | 'warn' | 'bad'
  title: string
  message: string
  client_name: string | null
  at: string
  href: string | null
  activity_id?: string
  calendar_href?: string | null
}

type Props = {
  initialItems?: DashboardAlertItem[]
}

export default function DashboardAlertsPanel({ initialItems = [] }: Props) {
  const [items, setItems] = useState<DashboardAlertItem[]>(initialItems)
  const [loading, setLoading] = useState(initialItems.length === 0)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/activities?dashboard=1')
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

  const resolve = async (activityId: string) => {
    setResolvingId(activityId)
    try {
      const res = await fetch('/api/crm/activities?action=resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activityId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo resolver')
      setItems((prev) => prev.filter((i) => i.activity_id !== activityId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al resolver')
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alertas y reuniones
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Follow-ups pendientes + reuniones en los próximos 2 días
          </p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {loading ? '…' : items.length}
        </span>
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
          Sin alertas abiertas ni reuniones en los próximos 2 días
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = item.source === 'meeting' ? Calendar : Bell
            return (
              <li
                key={item.id}
                className={cn(
                  'flex items-start gap-3 rounded-xl border px-3.5 py-3',
                  item.source === 'meeting'
                    ? 'border-sky-200/80 bg-sky-50/40'
                    : 'border-amber-200/80 bg-amber-50/40'
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                    item.source === 'meeting'
                      ? 'border-sky-100 bg-white text-sky-700'
                      : 'border-amber-100 bg-white text-amber-700'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground leading-snug">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                      {item.source === 'meeting' ? 'Reunión' : 'Alerta'}
                    </span>
                  </div>
                  {item.client_name && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.client_name}</p>
                  )}
                  <p className="text-xs text-foreground/80 mt-0.5 leading-snug">{item.message}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {item.href && (
                      <Link
                        href={item.href}
                        className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
                      >
                        Abrir <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                    {item.calendar_href && item.source === 'meeting' && (
                      <Link
                        href={item.calendar_href}
                        className="text-xs text-sky-700 hover:underline"
                      >
                        Calendario
                      </Link>
                    )}
                    {item.activity_id && (
                      <button
                        type="button"
                        onClick={() => void resolve(item.activity_id!)}
                        disabled={resolvingId === item.activity_id}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {resolvingId === item.activity_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Hecho
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
