import { Fragment, useEffect, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Info, Minus } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { MarketingOverview as Overview, OverviewTotals } from '@/lib/marketing/overview'
import { PLAN_STATUSES } from '@/lib/marketing/plan.types'

const eur = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const int = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-ES'))

/** Variación respecto al mes anterior. `lowerIsBetter` para costes. */
function Delta({ cur, prev, lowerIsBetter = false }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur == null || prev == null) return <span className="text-xs text-gray-400">sin comparación</span>
  if (prev === 0 && cur === 0) return <span className="text-xs text-gray-400">igual que el mes pasado</span>
  if (prev === 0) return <span className="text-xs text-gray-500">nuevo este mes</span>
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100)
  if (pct === 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-gray-500">
        <Minus className="h-3 w-3" /> igual
      </span>
    )
  const up = pct > 0
  const good = lowerIsBetter ? !up : up
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', good ? 'text-emerald-600' : 'text-red-600')}>
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {up ? '+' : ''}
      {pct} % vs mes anterior
    </span>
  )
}

function Kpi({
  label,
  value,
  tip,
  delta,
}: {
  label: string
  value: string
  tip: string
  delta: React.ReactNode
}) {
  return (
    <div className="relative rounded-2xl border border-gray-200/80 bg-white px-4 py-4 shadow-sm">
      <span className="group absolute right-2.5 top-2.5">
        <Info className="h-3.5 w-3.5 cursor-help text-gray-300 group-hover:text-gray-600" />
        <span className="pointer-events-none absolute right-0 top-6 z-30 hidden w-56 rounded-xl bg-gray-900 px-3 py-2 text-left text-[11px] leading-snug text-white shadow-lg group-hover:block">
          {tip}
        </span>
      </span>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
      <div className="mt-1">{delta}</div>
    </div>
  )
}

function GoalBar({ label, cur, goal }: { label: string; cur: number; goal: number | null }) {
  const pct = goal && goal > 0 ? Math.min(100, Math.round((cur / goal) * 100)) : null
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold tabular-nums text-gray-900">
          {cur}
          {goal != null && <span className="font-normal text-gray-400"> / {goal}</span>}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct ?? 0}%` }} />
      </div>
      {goal == null && <p className="mt-1 text-[11px] text-gray-400">Sin objetivo: fíjalo en Planificación</p>}
    </div>
  )
}

export default function MarketingOverview({
  period,
  onOpenPlan,
}: {
  period: string
  onOpenPlan?: () => void
}) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetch(`/api/marketing/overview?period=${encodeURIComponent(period)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || 'No se pudo cargar el panel')
        return j as Overview
      })
      .then((j) => alive && setData(j))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [period])

  if (loading)
    return (
      <div className="grid animate-pulse grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-gray-100" />
        ))}
      </div>
    )
  if (error || !data)
    return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error || 'Sin datos'}</p>

  const t: OverviewTotals = data.totals
  const p: OverviewTotals = data.prev_totals
  const plan = data.plan

  return (
    <div className="space-y-6">
      {/* Cifras del mes */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Inversión" value={eur(t.spend_eur)} tip="Gasto en captación del mes: anuncios, email y comisiones de cold calling." delta={<Delta cur={t.spend_eur} prev={p.spend_eur} lowerIsBetter />} />
        <Kpi label="Leads" value={int(t.leads)} tip="Leads creados este mes, de todos los canales." delta={<Delta cur={t.leads} prev={p.leads} />} />
        <Kpi label="Coste por lead" value={eur(t.cpl_eur)} tip="Inversión ÷ leads, solo de los canales donde se ha invertido." delta={<Delta cur={t.cpl_eur} prev={p.cpl_eur} lowerIsBetter />} />
        <Kpi label="Reuniones hechas" value={int(data.meetings)} tip="Reuniones ya celebradas este mes (calendario)." delta={<Delta cur={data.meetings} prev={data.prev_meetings} />} />
        <Kpi label="Clientes nuevos" value={int(t.clients)} tip="Leads del mes que ya han pagado la 1ª factura." delta={<Delta cur={t.clients} prev={p.clients} />} />
        <Kpi label="Cobrado de esos clientes" value={eur(t.won_eur)} tip="1ª factura cobrada de los clientes nuevos del mes." delta={<Delta cur={t.won_eur} prev={p.won_eur} />} />
        <Kpi label="Coste por cliente" value={eur(t.cac_eur)} tip="Inversión ÷ clientes nuevos, solo de canales con gasto." delta={<Delta cur={t.cac_eur} prev={p.cac_eur} lowerIsBetter />} />
        <Kpi label="Retorno" value={t.roi_pct == null ? '—' : `${t.roi_pct.toLocaleString('es-ES')} %`} tip="(Cobrado − invertido) ÷ invertido, en los canales con gasto. Los clientes tardan semanas en pagar: el mes en curso suele salir bajo." delta={<Delta cur={t.roi_pct} prev={p.roi_pct} />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Embudo por canal */}
        <Card className="shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-800">Embudo por canal · {data.period_label}</CardTitle>
            <p className="text-xs text-gray-400">Inversión → leads → reuniones → clientes → €</p>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {data.groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">Todavía no hay leads ni gasto este mes.</p>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="py-2 font-medium">Canal</th>
                    <th className="py-2 text-right font-medium">Inversión</th>
                    <th className="py-2 text-right font-medium">Leads</th>
                    <th className="py-2 text-right font-medium">Reunión</th>
                    <th className="py-2 text-right font-medium">Clientes</th>
                    <th className="py-2 text-right font-medium">Cobrado</th>
                    <th className="py-2 text-right font-medium">€ / lead</th>
                    <th className="py-2 text-right font-medium">€ / cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {data.groups.map((g) => (
                    <Fragment key={g.group}>
                      <tr className="border-t border-gray-100 bg-gray-50/60">
                        <td className="py-2 pl-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{g.label}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{eur(g.totals.spend_eur)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{int(g.totals.leads)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{int(g.totals.scheduled)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{int(g.totals.clients)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{eur(g.totals.won_eur)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{eur(g.totals.cpl_eur)}</td>
                        <td className="py-2 pr-2 text-right font-semibold tabular-nums">{eur(g.totals.cac_eur)}</td>
                      </tr>
                      {g.channels.map((c) => (
                        <tr key={`${g.group}-${c.channel}`} className="border-t border-gray-50">
                          <td className="py-2 pl-5 text-gray-700">{c.label}</td>
                          <td className="py-2 text-right tabular-nums text-gray-600">{c.spend_eur > 0 ? eur(c.spend_eur) : '—'}</td>
                          <td className="py-2 text-right tabular-nums">{int(c.leads)}</td>
                          <td className="py-2 text-right tabular-nums">{int(c.scheduled)}</td>
                          <td className="py-2 text-right tabular-nums">{int(c.clients)}</td>
                          <td className="py-2 text-right tabular-nums">{c.won_eur > 0 ? eur(c.won_eur) : '—'}</td>
                          <td className="py-2 text-right tabular-nums">{eur(c.cpl_eur)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{eur(c.cac_eur)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Objetivos y plan del mes */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800">Objetivos y plan del mes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!plan || !plan.ready ? (
                <p className="text-sm text-gray-500">
                  Todavía no hay planificación.{' '}
                  {onOpenPlan && (
                    <button type="button" onClick={onOpenPlan} className="font-medium text-gray-900 underline">
                      Abrir Planificación
                    </button>
                  )}
                </p>
              ) : (
                <>
                  <GoalBar label="Piezas publicadas" cur={plan.publicados} goal={plan.goals.piezas_objetivo} />
                  <GoalBar label="Reuniones hechas" cur={data.meetings} goal={plan.goals.reuniones_objetivo} />
                  <GoalBar label="Clientes nuevos" cur={t.clients} goal={plan.goals.clientes_objetivo} />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {PLAN_STATUSES.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                        {s.label} <b className="tabular-nums text-gray-900">{plan.por_estado[s.id] || 0}</b>
                      </span>
                    ))}
                  </div>
                  {onOpenPlan && (
                    <button type="button" onClick={onOpenPlan} className="text-xs font-medium text-gray-500 hover:text-gray-900">
                      Ver calendario →
                    </button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Alertas */}
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800">Alertas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.alerts.length === 0 ? (
                <p className="text-sm text-gray-400">Nada que destacar este mes.</p>
              ) : (
                data.alerts.map((a, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex gap-2 rounded-xl px-3 py-2 text-sm',
                      a.level === 'warn' && 'bg-amber-50 text-amber-900',
                      a.level === 'good' && 'bg-emerald-50 text-emerald-900',
                      a.level === 'info' && 'bg-gray-50 text-gray-700'
                    )}
                  >
                    {a.level === 'good' ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>{a.text}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
