import Link from 'next/link'
import { AlertTriangle, Info, AlertCircle } from 'lucide-react'
import type { FinanceAlert } from '@/lib/finance/types'
import { cn } from '@/lib/utils'

const SEVERITY_ICON = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

export default function FinanceAlertsPanel({ alerts }: { alerts: FinanceAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-6 text-center">
        Sin alertas activas
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
      {alerts.map((alert) => {
        const Icon = SEVERITY_ICON[alert.severity]
        return (
          <div
            key={alert.id}
            className={cn(
              'flex gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors',
              alert.severity === 'critical' && 'border-gray-300'
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4 flex-shrink-0 mt-0.5 text-gray-400',
                alert.severity === 'critical' && 'text-gray-900'
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{alert.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{alert.message}</p>
              {alert.action_href && alert.action_label && (
                <Link
                  href={alert.action_href}
                  className="text-xs font-medium text-gray-600 underline mt-1 inline-block hover:text-gray-900"
                >
                  {alert.action_label} →
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
