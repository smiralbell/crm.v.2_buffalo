import { cn } from '@/lib/utils'
import type { RichKpiCard } from '@/lib/finance/types'

export default function FinanceKpiCard({ card }: { card: RichKpiCard }) {
  return (
    <div
      className={cn(
        'border border-gray-200 rounded-lg bg-white p-4 flex flex-col h-full shadow-sm',
        card.accent === 'critical' && 'border-gray-400',
        card.accent === 'warning' && 'border-gray-300'
      )}
    >
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{card.title}</p>
      <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{card.primary}</p>
      <dl className="mt-3 space-y-1.5 flex-1">
        {card.rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2 text-[11px]">
            <dt className="text-gray-500 truncate">{row.label}</dt>
            <dd className="text-gray-900 font-medium tabular-nums text-right flex-shrink-0">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {card.footer && (
        <p className="text-[10px] text-gray-400 mt-3 pt-2 border-t border-gray-100 leading-snug">
          {card.footer}
        </p>
      )}
    </div>
  )
}
