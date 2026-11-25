import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CHANNEL_COLORS } from '@/lib/leads/analytics.types'
import type { FunnelData, FunnelRow } from '@/lib/marketing/sales.types'
import { OutcomeChips, OutcomeDialog } from '@/components/marketing/LeadOutcome'
import { ErrorBox, call, shortDay } from '@/components/marketing/shared'

const eur = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function Cells({ r, bold }: { r: FunnelRow; bold?: boolean }) {
  const c = cn('py-2 text-right tabular-nums', bold && 'font-semibold')
  return (
    <>
      <td className={c}>{r.leads}</td>
      <td className={c}>{r.reunion}</td>
      <td className={c}>{r.no_presentado || '—'}</td>
      <td className={c}>{r.encaja || '—'}</td>
      <td className={c}>{r.propuesta}</td>
      <td className={cn(c, r.firmado > 0 && 'text-emerald-700')}>{r.firmado}</td>
      <td className={c}>
        {r.perdido || '—'}
        {r.motivo_top && <span className="block text-[11px] font-normal text-gray-400">{r.motivo_top}</span>}
      </td>
      <td className={cn(c, 'pr-2')}>{eur(r.coste_reunion_encaja)}</td>
    </>
  )
}

/** Embudo por canal hasta el cierre, leído del pipeline de ventas. */
export default function SalesFunnel({ period }: { period: string }) {
  const [months, setMonths] = useState<1 | 3 | 6>(3)
  const [data, setData] = useState<FunnelData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canal, setCanal] = useState('')
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)

  const load = useCallback(() => {
    setError(null)
    return call<FunnelData>(`/api/marketing/funnel?period=${period}&months=${months}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [period, months])
  useEffect(() => {
    setData(null)
    void load()
  }, [load])

  const leads = (data?.leads ?? []).filter((l) => !canal || l.canal === canal)
  const worked = leads.filter((l) => l.reached >= 3 || l.perdido)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          Leads que entraron en el periodo y hasta dónde han llegado en vuestro pipeline.
          {data && ` Del ${shortDay(data.from)} al ${shortDay(data.to)}.`}
        </p>
        <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5">
          {([1, 3, 6] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMonths(n)}
              className={cn('rounded-full px-3 py-1 text-xs font-medium', months === n ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800')}
            >
              {n === 1 ? 'Este mes' : `${n} meses`}
            </button>
          ))}
        </div>
      </div>
      <ErrorBox text={error} />
      {!data && !error && <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="shadow-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800">Embudo por canal</CardTitle>
              <p className="text-xs text-gray-400">Pulsa un canal para ver sus leads</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="py-2 font-medium">Canal</th>
                    <th className="py-2 text-right font-medium">Leads</th>
                    <th className="py-2 text-right font-medium">Reunión</th>
                    <th className="py-2 text-right font-medium">No vino</th>
                    <th className="py-2 text-right font-medium">Encaja</th>
                    <th className="py-2 text-right font-medium">Propuesta</th>
                    <th className="py-2 text-right font-medium">Firmado</th>
                    <th className="py-2 text-right font-medium">Perdido</th>
                    <th className="py-2 pr-2 text-right font-medium">€ / reunión que encaja</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr
                      key={r.canal}
                      onClick={() => setCanal(canal === r.canal ? '' : (r.canal as string))}
                      className={cn('cursor-pointer border-t border-gray-50 hover:bg-gray-50', canal === r.canal && 'bg-gray-50')}
                    >
                      <td className="py-2 text-gray-700">
                        <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: r.canal === 'total' ? '#111' : CHANNEL_COLORS[r.canal] }} />
                        {r.label}
                      </td>
                      <Cells r={r} />
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 bg-gray-50/60">
                    <td className="py-2 pl-2 font-semibold text-gray-900">Total</td>
                    <Cells r={data.total} bold />
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-xs text-gray-400">Con pocos leads por canal los porcentajes engañan: mejor decidir mirando 3 meses.</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800">Por qué se pierden</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.motivos.length === 0 && <p className="text-sm text-gray-400">Ningún lead perdido en el periodo.</p>}
              {data.motivos.map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{m.label}</span>
                    <b className="tabular-nums text-gray-900">{m.n}</b>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-red-400" style={{ width: `${Math.round((m.n / data.motivos[0].n) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
      {data && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-800">
              Leads con reunión, propuesta o perdidos{canal && ` · ${data.rows.find((r) => r.canal === canal)?.label}`}
            </CardTitle>
            <p className="text-xs text-gray-400">Marca si encajan, si no se presentaron o por qué se perdieron</p>
          </CardHeader>
          <CardContent>
            {worked.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">Ninguno en este periodo.</p>
            ) : (
              <ul className="max-h-[420px] divide-y divide-gray-50 overflow-y-auto">
                {worked.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/leads/${l.id}`} className="font-medium text-gray-900 hover:underline">
                        {l.name}
                        {l.empresa && <span className="font-normal text-gray-500"> · {l.empresa}</span>}
                      </Link>
                      <p className="text-xs text-gray-400">
                        {l.canal_label}
                        {l.stage && ` · ${l.stage}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <OutcomeChips o={l} />
                      <button type="button" onClick={() => setEditing({ id: l.id, name: l.name })} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-gray-400">
                        Resultado
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      <OutcomeDialog lead={editing} onClose={() => setEditing(null)} onSaved={() => void load()} />
    </div>
  )
}
