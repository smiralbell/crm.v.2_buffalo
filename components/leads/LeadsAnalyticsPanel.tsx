'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CHANNEL_COLORS,
  type ChannelBreakdownRow,
  type ChannelRentabilityInsight,
  type ColdCallFunnel,
  type LeadListItem,
  type LeadsAnalytics,
  currentPeriod,
} from '@/lib/leads/analytics.types'
import {
  BadgeCheck,
  Calendar,
  ChevronDown,
  Phone,
  TrendingUp,
  Users,
  UserCheck,
  Video,
  ExternalLink,
  Trophy,
} from 'lucide-react'
import ChannelCostsEditor from '@/components/leads/ChannelCostsEditor'

const LeadsTimelineChart = dynamic(() => import('@/components/leads/LeadsTimelineChart'), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl bg-gray-100" />,
})

const LeadsChannelBarChart = dynamic(() => import('@/components/leads/LeadsChannelBarChart'), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl bg-gray-100" />,
})

type ApiResponse = LeadsAnalytics & {
  periods: { value: string; label: string }[]
}

type ListModal = {
  title: string
  subtitle?: string
  items: LeadListItem[]
} | null

function formatEur(n: number) {
  return `${n.toLocaleString('es-ES', {
    maximumFractionDigits: 0,
  })} €`
}

function pctLabel(n: number) {
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%`
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ElementType
  onClick?: () => void
}) {
  const clickable = Boolean(onClick)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`rounded-2xl border border-gray-200 bg-white p-5 text-left w-full transition-all ${
        clickable
          ? 'hover:border-gray-300 hover:shadow-sm cursor-pointer'
          : 'cursor-default'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        <Icon className="h-4 w-4 text-gray-400" />
      </div>
      <p className="text-3xl font-bold text-gray-900 tracking-tight">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1.5">{hint}</p>}
      {clickable && (
        <p className="text-[11px] text-gray-400 mt-2">Clic para ver listado →</p>
      )}
    </button>
  )
}

function LeadListDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  items,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  subtitle?: string
  items: LeadListItem[]
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {subtitle || `${items.length} lead${items.length === 1 ? '' : 's'}`}
          </DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No hay leads en este grupo</p>
        ) : (
          <ul className="overflow-y-auto -mx-2 px-2 space-y-1 max-h-[55vh]">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/leads/${item.id}`}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors group"
                  onClick={() => onOpenChange(false)}
                >
                  <div className="w-9 h-9 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:underline">
                      {item.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {[item.empresa, item.email, item.channel_label].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 mt-1 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function LeadsAnalyticsPanel({
  period: periodProp,
  onPeriodChange,
  hidePeriodSelect = false,
  defaultOpen = true,
}: {
  /** Si se pasa, el panel usa este mes (p. ej. toolbar de Marketing). */
  period?: string
  onPeriodChange?: (period: string) => void
  /** Oculta el selector interno cuando el padre ya elige el mes. */
  hidePeriodSelect?: boolean
  defaultOpen?: boolean
} = {}) {
  const [internalPeriod, setInternalPeriod] = useState(periodProp || currentPeriod())
  const period = periodProp ?? internalPeriod
  const setPeriod = (next: string) => {
    if (periodProp == null) setInternalPeriod(next)
    onPeriodChange?.(next)
  }

  useEffect(() => {
    if (periodProp) setInternalPeriod(periodProp)
  }, [periodProp])

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState<ListModal>(null)
  const [panelOpen, setPanelOpen] = useState(defaultOpen)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(`/api/leads/analytics?period=${encodeURIComponent(period)}`)
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error')
        if (!cancelled) setData(json)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [period, reloadToken])

  const periods = data?.periods || []
  const openList = (title: string, items: LeadListItem[], subtitle?: string) => {
    setModal({ title, items, subtitle })
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50/80 transition-colors"
        aria-expanded={panelOpen}
      >
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Analítica de leads</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Entrada, agenda, 1ª factura (ganados) y cierre
            {!panelOpen && data
              ? ` · ${data.kpis.leads_total} leads · ${data.kpis.clients_won} ganados · ${data.kpis.leads_scheduled} en reunión · ${pctLabel(data.kpis.meeting_to_client_pct)} reunión→cliente`
              : ''}
          </p>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-gray-400 shrink-0 transition-transform ${
            panelOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {panelOpen && (
        <div className="space-y-6 px-5 pb-5 sm:px-6 sm:pb-6 border-t border-gray-100 pt-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <p className="text-xs text-gray-500">
              Periodo y costes de captación (Meta / Google / Email / Cold calling)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ChannelCostsEditor
                period={period}
                periodLabel={data?.period_label}
                onSaved={() => setReloadToken((n) => n + 1)}
              />
              {!hidePeriodSelect && (
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="w-[200px] rounded-xl">
                    <SelectValue placeholder="Mes" />
                  </SelectTrigger>
                  <SelectContent>
                    {(periods.length
                      ? periods
                      : [{ value: period, label: data?.period_label || period }]
                    ).map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {loading && !data ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : data ? (
            <>
              <div>
                <div className="mb-3">
                  <p className="text-sm font-semibold text-gray-900">KPIs del mes</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Leads creados · etapa Reunión del pipeline · citas ya celebradas
                  </p>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard
                    label="Leads del mes"
                    value={String(data.kpis.leads_total)}
                    hint="Creados en este mes"
                    icon={Users}
                    onClick={() =>
                      openList('Leads del mes', data.lists.leads_total, data.period_label)
                    }
                  />
                  <KpiCard
                    label="En reuniones"
                    value={String(data.kpis.leads_scheduled)}
                    hint="Columna REUNIÓN · pipeline global"
                    icon={Video}
                    onClick={() =>
                      openList(
                        'Leads en REUNIÓN',
                        data.lists.leads_scheduled,
                        'Misma columna REUNIÓN del pipeline general'
                      )
                    }
                  />
                  <KpiCard
                    label="Reuniones hechas"
                    value={String(data.kpis.meetings_total)}
                    hint="Calendario ya celebradas"
                    icon={Calendar}
                    onClick={() =>
                      openList(
                        'Reuniones ya celebradas',
                        data.lists.meetings,
                        'Solo citas con fecha/hora pasada en este mes'
                      )
                    }
                  />
                  <KpiCard
                    label="Reunión → cliente"
                    value={pctLabel(data.kpis.meeting_to_client_pct)}
                    hint="% de leads con reunión hecha que pagaron 1ª factura"
                    icon={TrendingUp}
                    onClick={() =>
                      openList(
                        'De reunión a cliente',
                        data.lists.meeting_to_client,
                        `${data.lists.meeting_to_client.length} de ${data.lists.meetings.length} con reunión hecha`
                      )
                    }
                  />
                  <KpiCard
                    label="Clientes ganados"
                    value={String(data.kpis.clients_won)}
                    hint="1ª factura de setup cobrada este mes"
                    icon={UserCheck}
                    onClick={() =>
                      openList('Clientes ganados (1ª factura)', data.lists.clients_won)
                    }
                  />
                  <KpiCard
                    label="Ganados con reunión"
                    value={pctLabel(data.kpis.won_with_meeting_pct)}
                    hint="% de ganados del mes con reunión ya celebrada"
                    icon={Video}
                    onClick={() =>
                      openList('Clientes ganados con reunión', data.lists.meeting_to_client)
                    }
                  />
                  <KpiCard
                    label="Clientes cerrados"
                    value={String(data.kpis.clients_closed)}
                    hint="2ª factura + producción acabada (fecha fin)"
                    icon={BadgeCheck}
                    onClick={() =>
                      openList('Clientes cerrados este mes', data.lists.clients_closed)
                    }
                  />
                  <KpiCard
                    label="Conversión lead → ganado"
                    value={pctLabel(data.kpis.lead_to_client_pct)}
                    hint="Leads del mes que ya pagaron la 1ª factura"
                    icon={TrendingUp}
                    onClick={() =>
                      openList(
                        'Leads convertidos (1ª factura)',
                        data.lists.converted,
                        `${data.lists.converted.length} de ${data.kpis.leads_total} leads del mes`
                      )
                    }
                  />
                </div>
              </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="h-4 w-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Leads en el tiempo</h3>
              </div>
              <LeadsTimelineChart
                data={data.timeline}
                channels={data.by_channel.map((c) => c.channel)}
              />
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Leads por canal</h3>
              <p className="text-xs text-gray-500 mb-4">
                Hover: inversión, €/€ leads, €/€ clientes y ROI
              </p>
              <LeadsChannelBarChart
                rows={data.by_channel}
                onBarClick={(row) =>
                  openList(`Leads · ${row.label}`, row.lead_items, data.period_label)
                }
              />
            </div>
          </div>

          <BestChannelCard insight={data.best_channel} />

          <ChannelRentabilityTable rows={data.by_channel} />

          <ChannelConversionTable
            rows={data.by_channel}
            onOpen={(title, items, subtitle) => openList(title, items, subtitle)}
          />

          <ColdCallFunnelCard
            funnel={data.cold_calling}
            onOpen={(title, items, subtitle) => openList(title, items, subtitle)}
          />

          {data.suggestions.length > 0 && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50/60 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 mb-2">
                Sugerencias
              </p>
              <ul className="space-y-1.5">
                {data.suggestions.map((s, i) => (
                  <li key={i} className="text-sm text-amber-950 leading-snug">
                    · {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
            </>
          ) : null}
        </div>
      )}

      <LeadListDialog
        open={Boolean(modal)}
        onOpenChange={(v) => {
          if (!v) setModal(null)
        }}
        title={modal?.title || ''}
        subtitle={modal?.subtitle}
        items={modal?.items || []}
      />
    </div>
  )
}

function BestChannelCard({ insight }: { insight: ChannelRentabilityInsight | null }) {
  if (!insight) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-5 py-6 text-sm text-gray-500">
        Aún no hay datos suficientes para señalar un canal más rentable este mes.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-900 bg-gray-900 text-white p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className="h-4 w-4 text-amber-300" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Canal más rentable
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: CHANNEL_COLORS[insight.channel] }}
            />
            <h3 className="text-xl font-bold tracking-tight">{insight.label}</h3>
          </div>
          <p className="text-sm text-gray-300 mt-2 leading-relaxed max-w-2xl">{insight.reason}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:min-w-[420px]">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              Inversión
            </p>
            <p className="text-lg font-bold mt-0.5">
              {insight.spend_eur > 0 ? formatEur(insight.spend_eur) : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              € / € clientes
            </p>
            <p className="text-lg font-bold mt-0.5">
              {insight.eur_per_euro_clients != null
                ? `${insight.eur_per_euro_clients.toLocaleString('es-ES', {
                    maximumFractionDigits: 2,
                  })} €`
                : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              ROI
            </p>
            <p className="text-lg font-bold mt-0.5">
              {insight.return_pct != null ? pctLabel(insight.return_pct) : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              Cobrado
            </p>
            <p className="text-lg font-bold mt-0.5">{formatEur(insight.won_eur)}</p>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mt-4 leading-snug">
        ROI = (cobrado clientes − inversión) ÷ inversión. €/€ = cobrado ÷ inversión. Inversión:
        override manual → banco (MKT…) → marketing metrics → email 500 € estimado.
      </p>
    </div>
  )
}

function ChannelRentabilityTable({ rows }: { rows: ChannelBreakdownRow[] }) {
  if (!rows.length) return null

  const fmtRatio = (n: number | null) =>
    n == null ? '—' : `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Rentabilidad por canal</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Coste invertido · € ganados por cada € · ROI de leads y de clientes
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-5 py-3 font-semibold">Canal</th>
              <th className="px-5 py-3 font-semibold">Inversión</th>
              <th className="px-5 py-3 font-semibold">Pipeline leads</th>
              <th className="px-5 py-3 font-semibold">Cobrado clientes</th>
              <th className="px-5 py-3 font-semibold">€ / € leads</th>
              <th className="px-5 py-3 font-semibold">€ / € clientes</th>
              <th className="px-5 py-3 font-semibold">ROI leads</th>
              <th className="px-5 py-3 font-semibold">ROI clientes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-b border-gray-50 last:border-0">
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2 font-medium text-gray-900">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CHANNEL_COLORS[r.channel] }}
                    />
                    {r.label}
                  </span>
                  {r.spend_source === 'default_email' && (
                    <p className="text-[10px] text-gray-400 mt-0.5 pl-4">coste email estimado</p>
                  )}
                  {r.spend_source === 'manual' && (
                    <p className="text-[10px] text-gray-400 mt-0.5 pl-4">override manual</p>
                  )}
                  {r.spend_source === 'bank' && (
                    <p className="text-[10px] text-gray-400 mt-0.5 pl-4">detectado en banco</p>
                  )}
                </td>
                <td className="px-5 py-3 font-medium text-gray-900">
                  {r.spend_eur > 0 ? formatEur(r.spend_eur) : (
                    <span className="text-gray-400 font-normal">Sin coste</span>
                  )}
                </td>
                <td className="px-5 py-3 font-medium text-gray-900">{formatEur(r.pipeline_eur)}</td>
                <td className="px-5 py-3 font-medium text-gray-900">{formatEur(r.won_eur)}</td>
                <td className="px-5 py-3 font-semibold text-gray-900">
                  {fmtRatio(r.eur_per_euro_leads)}
                </td>
                <td className="px-5 py-3 font-semibold text-gray-900">
                  {fmtRatio(r.eur_per_euro_clients)}
                </td>
                <td className="px-5 py-3 font-semibold text-gray-900">
                  {r.return_pct_leads != null ? pctLabel(r.return_pct_leads) : '—'}
                </td>
                <td className="px-5 py-3 font-semibold text-gray-900">
                  {r.return_pct != null ? pctLabel(r.return_pct) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/60">
        <p className="text-[11px] text-gray-500 leading-snug">
          <strong className="font-semibold text-gray-600">€ / € leads</strong> = valor pipeline ÷
          inversión · <strong className="font-semibold text-gray-600">€ / € clientes</strong> =
          cobrado 1ª factura ÷ inversión ·{' '}
          <strong className="font-semibold text-gray-600">ROI</strong> = (valor − inversión) ÷
          inversión. Prioridad coste: manual → banco (MKT META/GOOGLE/EMAIL/COLDCALL) → metrics.
          Web orgánica = 0 €; Meta+Google suman a Web.
        </p>
      </div>
    </div>
  )
}

function ChannelConversionTable({
  rows,
  onOpen,
}: {
  rows: ChannelBreakdownRow[]
  onOpen: (title: string, items: LeadListItem[], subtitle?: string) => void
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
        No hay leads en este mes
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Conversión por canal</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Clic en un número para ver los nombres
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="px-5 py-3 font-semibold">Canal</th>
              <th className="px-5 py-3 font-semibold">Leads</th>
              <th className="px-5 py-3 font-semibold">En reunión</th>
              <th className="px-5 py-3 font-semibold">Ganados</th>
              <th className="px-5 py-3 font-semibold">Cerrados</th>
              <th className="px-5 py-3 font-semibold">% ganado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.channel} className="border-b border-gray-50 last:border-0">
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-2 font-medium text-gray-900">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: CHANNEL_COLORS[r.channel] }}
                    />
                    {r.label}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    className="font-medium text-gray-900 hover:underline"
                    onClick={() => onOpen(`Leads · ${r.label}`, r.lead_items)}
                  >
                    {r.leads}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    className="font-medium text-gray-900 hover:underline"
                    onClick={() => onOpen(`En reunión · ${r.label}`, r.scheduled_items)}
                  >
                    {r.scheduled}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    className="font-medium text-gray-900 hover:underline"
                    onClick={() => onOpen(`Ganados · ${r.label}`, r.client_items)}
                  >
                    {r.clients}
                  </button>
                </td>
                <td className="px-5 py-3">
                  <button
                    type="button"
                    className="font-medium text-gray-900 hover:underline"
                    onClick={() => onOpen(`Cerrados · ${r.label}`, r.closed_items)}
                  >
                    {r.closed}
                  </button>
                </td>
                <td className="px-5 py-3 font-semibold text-gray-900">
                  {pctLabel(r.lead_to_client_pct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ColdCallFunnelCard({
  funnel,
  onOpen,
}: {
  funnel: ColdCallFunnel
  onOpen: (title: string, items: LeadListItem[], subtitle?: string) => void
}) {
  if (!funnel.available && funnel.calls === 0 && funnel.leads === 0) {
    return null
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <Phone className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Embudo Cold calling</h3>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Llamadas del mes → leads CRM → ganados (1ª factura) → cerrados
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniStat label="Llamadas" value={String(funnel.calls)} />
        <MiniStat label="Reuniones" value={String(funnel.meetings)} />
        <MiniStat
          label="Leads CRM"
          value={String(funnel.leads)}
          hint={`${pctLabel(funnel.call_to_lead_pct)} de llamadas`}
          onClick={() => onOpen('Cold calling · Leads CRM', funnel.lead_items)}
        />
        <MiniStat
          label="Ganados"
          value={String(funnel.clients)}
          hint={`${pctLabel(funnel.lead_to_client_pct)} de leads · ${pctLabel(funnel.call_to_client_pct)} de llamadas`}
          onClick={() => onOpen('Cold calling · Ganados', funnel.client_items)}
        />
        <MiniStat
          label="Cerrados"
          value={String(funnel.closed)}
          onClick={() => onOpen('Cold calling · Cerrados', funnel.closed_items)}
        />
      </div>
    </div>
  )
}

function MiniStat({
  label,
  value,
  hint,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-3 text-left w-full ${
        onClick ? 'hover:border-gray-300 hover:bg-white cursor-pointer transition-colors' : ''
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-[11px] text-gray-500 mt-1 leading-snug">{hint}</p>}
    </Comp>
  )
}
