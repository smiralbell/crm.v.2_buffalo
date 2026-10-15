import { useState } from 'react'
import Link from 'next/link'
import { fmtEur } from '@/lib/finance/chart-theme'
import type { AnnualGoalDetail } from '@/lib/finance/types'
import FinanceInfoTip from './FinanceInfoTip'
import { ANNUAL_GOAL_HELP } from '@/lib/finance/kpi-help'
import { cn } from '@/lib/utils'
import { Pencil, Check, X, Loader2, ArrowRight } from 'lucide-react'

export default function AnnualGoalCard({
  goal,
  href,
  editable,
  onTargetSaved,
}: {
  goal: AnnualGoalDetail
  href?: string
  editable?: boolean
  onTargetSaved?: () => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(Math.round(goal.target)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const paceBadge =
    goal.pace_status === 'ahead'
      ? 'Adelantado'
      : goal.pace_status === 'behind'
        ? 'Retrasado'
        : 'En ritmo'

  const saveTarget = async () => {
    const n = Number(String(draft).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 1000) {
      setError('Introduce un objetivo válido (mínimo 1.000 €)')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/finances/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annual_revenue_target: Math.round(n) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setEditing(false)
      await onTargetSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div id="objetivo-anual" className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-900">Objetivo anual de facturación</p>
              <FinanceInfoTip text={ANNUAL_GOAL_HELP} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-2">
              {editing ? (
                <span className="inline-flex items-center gap-1.5">
                  Meta
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="w-28 rounded border border-gray-300 px-2 py-0.5 text-xs tabular-nums"
                    disabled={saving}
                  />
                  €
                  <button
                    type="button"
                    onClick={() => void saveTarget()}
                    disabled={saving}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
                    aria-label="Guardar objetivo"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false)
                      setDraft(String(Math.round(goal.target)))
                      setError('')
                    }}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50"
                    aria-label="Cancelar"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <>
                  <span>
                    Meta {fmtEur(goal.target)} · {goal.months_remaining} meses restantes
                  </span>
                  {editable && (
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(String(Math.round(goal.target)))
                        setEditing(true)
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-900"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                  )}
                </>
              )}
            </p>
            {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
          </div>
          <div className="flex items-center gap-2 self-start">
            {href && (
              <Link
                href={href}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
              >
                Ver en Finanzas <ArrowRight className="h-3 w-3" />
              </Link>
            )}
            <span
              className={cn(
                'inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border',
                goal.pace_status === 'ahead' && 'border-gray-900 text-gray-900 bg-gray-50',
                goal.pace_status === 'behind' && 'border-gray-400 text-gray-700 bg-gray-50',
                goal.pace_status === 'on_track' && 'border-gray-200 text-gray-600'
              )}
            >
              {paceBadge}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 mb-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Llevamos</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
              {fmtEur(goal.invoiced_ytd)}
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {goal.achieved_pct}% · cobrado en banco
            </p>
          </div>
          <div className="rounded-lg bg-gray-50/70 px-3 py-2.5 ring-1 ring-inset ring-gray-200/80">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Si cobramos lo pendiente</p>
            <p className="text-lg font-bold text-gray-900/80 tabular-nums mt-0.5">
              {fmtEur(goal.if_collected_total)}
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {goal.if_collected_pct}% · +{fmtEur(goal.pending_invoices_total)} en{' '}
              {goal.pending_invoices_count} factura{goal.pending_invoices_count === 1 ? '' : 's'} sin cobrar
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Quedan</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
              {fmtEur(goal.remaining_amount)}
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">{goal.remaining_pct}% por alcanzar (cobrado)</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Proyección fin de año</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
              {fmtEur(goal.projected_year_end)}
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">
              {goal.projected_year_end >= goal.target ? 'Superaría meta' : 'Por debajo de meta'}
            </p>
          </div>
        </div>

        <div className="mb-2">
          <div className="flex justify-between text-[11px] text-gray-500 mb-1.5">
            <span>0 €</span>
            <span className="font-medium text-gray-900">{goal.achieved_pct}% cobrado</span>
            <span>{fmtEur(goal.target)}</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden relative">
            <div
              className="absolute inset-y-0 left-0 bg-gray-900/25 rounded-full"
              style={{ width: `${Math.min(100, goal.if_collected_pct)}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-gray-900 rounded-full"
              style={{ width: `${Math.min(100, goal.achieved_pct)}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-gray-900" />
              Cobrado {fmtEur(goal.invoiced_ytd)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-3 rounded-full bg-gray-900/25" />
              Facturas sin cobrar {fmtEur(goal.pending_invoices_total)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-gray-100 border-t border-gray-100">
        {[
          {
            label: 'Media mensual necesaria',
            value: fmtEur(goal.required_monthly_avg),
            sub: `para los ${goal.months_remaining} meses que quedan`,
          },
          {
            label: 'Objetivo lineal / mes',
            value: fmtEur(goal.monthly_target_even),
            sub: `${fmtEur(goal.target)} ÷ 12 meses`,
          },
          {
            label: 'Este mes cobrado',
            value: fmtEur(goal.invoiced_this_month),
            sub: `${goal.this_month_vs_monthly_target_pct}% del objetivo mensual · banco`,
          },
          {
            label: 'Ritmo acumulado esperado',
            value: fmtEur(goal.expected_pace_ytd),
            sub: goal.pace_label,
          },
        ].map((item) => (
          <div key={item.label} className="bg-white px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{item.label}</p>
            <p className="text-sm font-semibold text-gray-900 tabular-nums mt-0.5">{item.value}</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
