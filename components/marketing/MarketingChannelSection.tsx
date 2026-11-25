import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CHANNEL_COLORS, CHANNEL_LABELS, type ChannelBreakdownRow, type ChannelKey, type LeadsAnalytics } from '@/lib/leads/analytics.types'
import { AttributionDialog, ChannelChip } from '@/components/marketing/LeadAttribution'
import { PLAN_CHANNELS, PLAN_FORMATS, PLAN_STATUSES, labelOf, type PlanChannel, type PlanMonth } from '@/lib/marketing/plan.types'

const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/**
 * Sección de un grupo de canales (Redes sociales, Email outreach, Relaciones…):
 * cifras del mes por canal + leads que han entrado + piezas del calendario de esos canales.
 * El canal de cada lead se puede corregir pulsando su etiqueta.
 */
export default function MarketingChannelSection({
  period,
  title,
  description,
  channels,
  planChannels = [],
  emptyHint,
}: {
  period: string
  title: string
  description: string
  channels: ChannelKey[]
  planChannels?: PlanChannel[]
  emptyHint?: string
}) {
  const [rows, setRows] = useState<ChannelBreakdownRow[] | null>(null)
  const [plan, setPlan] = useState<PlanMonth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setRows(null)
    setError(null)
    fetch(`/api/leads/analytics?period=${encodeURIComponent(period)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'No se pudo cargar')
        return j as LeadsAnalytics
      })
      .then((j) => alive && setRows(j.by_channel.filter((r) => channels.includes(r.channel))))
      .catch((e) => alive && setError(e.message))
    if (planChannels.length) {
      fetch(`/api/marketing/plan?period=${encodeURIComponent(period)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => alive && setPlan(j))
        .catch(() => undefined)
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, channels.join(','), planChannels.join(','), reload])

  const pieces = (plan?.items ?? []).filter((i) => planChannels.includes(i.canal))
  const leads = (rows ?? []).flatMap((r) => r.lead_items)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
        {channels.map((ch) => {
          const r = rows?.find((x) => x.channel === ch)
          return (
            <div key={ch} className="rounded-2xl border border-gray-200/80 bg-white px-4 py-4 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{CHANNEL_LABELS[ch]}</p>
              {rows == null ? (
                <div className="mt-2 h-7 w-16 animate-pulse rounded bg-gray-100" />
              ) : (
                <>
                  <p className="mt-1.5 text-2xl font-semibold tabular-nums text-gray-900">{r?.leads ?? 0}</p>
                  <p className="text-xs text-gray-500">
                    leads · {r?.scheduled ?? 0} en reunión · {r?.clients ?? 0} clientes
                    {r && r.spend_eur > 0 ? ` · ${eur(r.spend_eur)}` : ''}
                  </p>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-800">Leads de este mes</CardTitle>
          </CardHeader>
          <CardContent>
            {rows == null ? (
              <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
            ) : leads.length === 0 ? (
              <p className="text-sm text-gray-400">{emptyHint || 'Todavía no ha entrado ningún lead por estos canales este mes.'}</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/leads/${l.id}`} className="font-medium text-gray-900 hover:underline">
                      {l.name}
                      {l.empresa && <span className="font-normal text-gray-500"> · {l.empresa}</span>}
                    </Link>
                    <ChannelChip label={l.channel_label} color={CHANNEL_COLORS[l.channel]} onClick={() => setEditing(l.id)} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {planChannels.length > 0 && (
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800">Piezas planificadas este mes</CardTitle>
            </CardHeader>
            <CardContent>
              {pieces.length === 0 ? (
                <p className="text-sm text-gray-400">No hay piezas de estos canales en Planificación.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {pieces.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="mr-2 tabular-nums text-gray-400">
                          {p.fecha.slice(8)}/{p.fecha.slice(5, 7)}
                        </span>
                        <span className="font-medium text-gray-900">{p.titulo}</span>
                        <span className="text-gray-500">
                          {' '}
                          · {labelOf(PLAN_CHANNELS, p.canal)} · {labelOf(PLAN_FORMATS, p.formato)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium" style={{ color: PLAN_STATUSES.find((s) => s.id === p.estado)?.color }}>
                        {labelOf(PLAN_STATUSES, p.estado)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      <AttributionDialog leadId={editing} onClose={() => setEditing(null)} onSaved={() => setReload((n) => n + 1)} />
    </div>
  )
}
