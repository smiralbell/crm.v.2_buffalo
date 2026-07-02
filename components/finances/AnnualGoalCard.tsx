import { fmtEur } from '@/lib/finance/chart-theme'
import type { AnnualGoalDetail } from '@/lib/finance/types'
import FinanceInfoTip from './FinanceInfoTip'
import { ANNUAL_GOAL_HELP } from '@/lib/finance/kpi-help'
import { cn } from '@/lib/utils'

export default function AnnualGoalCard({ goal }: { goal: AnnualGoalDetail }) {
  const paceBadge =
    goal.pace_status === 'ahead'
      ? 'Adelantado'
      : goal.pace_status === 'behind'
        ? 'Retrasado'
        : 'En ritmo'

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-900">Objetivo anual de facturación</p>
              <FinanceInfoTip text={ANNUAL_GOAL_HELP} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Meta {fmtEur(goal.target)} · {goal.months_remaining} meses restantes
            </p>
          </div>
          <span
            className={cn(
              'inline-flex self-start text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded border',
              goal.pace_status === 'ahead' && 'border-gray-900 text-gray-900 bg-gray-50',
              goal.pace_status === 'behind' && 'border-gray-400 text-gray-700 bg-gray-50',
              goal.pace_status === 'on_track' && 'border-gray-200 text-gray-600'
            )}
          >
            {paceBadge}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Llevamos</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
              {fmtEur(goal.invoiced_ytd)}
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">{goal.achieved_pct}% del objetivo</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide">Quedan</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums mt-0.5">
              {fmtEur(goal.remaining_amount)}
            </p>
            <p className="text-[11px] text-gray-600 mt-0.5">{goal.remaining_pct}% por alcanzar</p>
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
            <span className="font-medium text-gray-900">{goal.achieved_pct}%</span>
            <span>{fmtEur(goal.target)}</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, goal.achieved_pct)}%` }}
            />
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
            sub: '250k ÷ 12 meses',
          },
          {
            label: 'Este mes facturado',
            value: fmtEur(goal.invoiced_this_month),
            sub: `${goal.this_month_vs_monthly_target_pct}% del objetivo mensual`,
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
