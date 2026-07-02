import type { PeriodInsight } from '@/lib/finance/types'
import FinanceInfoTip from './FinanceInfoTip'

export default function PeriodInsightCard({ insight }: { insight: PeriodInsight }) {
  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4 shadow-sm hover:shadow-md transition-shadow h-full">
      <div className="flex items-center gap-1.5">
        <p className="text-sm font-medium text-gray-500">{insight.label}</p>
        {insight.help && <FinanceInfoTip text={insight.help} />}
      </div>
      <p className="text-2xl font-semibold text-gray-900 mt-1 tabular-nums">{insight.primary}</p>
      {insight.rows.length > 0 && (
        <dl className="mt-3 space-y-1.5">
          {insight.rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-2 text-xs">
              <dt className="text-gray-500">{row.label}</dt>
              <dd className="text-gray-800 font-medium tabular-nums">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {insight.footer && (
        <p className="text-[10px] text-gray-400 mt-3 pt-2 border-t border-gray-100">{insight.footer}</p>
      )}
    </div>
  )
}
