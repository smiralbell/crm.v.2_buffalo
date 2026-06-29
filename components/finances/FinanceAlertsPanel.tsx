import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { FinanceAlert, AlertPriority } from '@/lib/finance/types'
import { cn } from '@/lib/utils'

const PRIORITY_STYLE: Record<
  AlertPriority,
  { icon: typeof Info; border: string; bg: string; iconCls: string; badge: string; badgeCls: string }
> = {
  good: {
    icon: CheckCircle2,
    border: 'border-green-200',
    bg: 'bg-green-50/50',
    iconCls: 'text-green-600',
    badge: 'Buena',
    badgeCls: 'bg-green-100 text-green-800',
  },
  medium: {
    icon: AlertTriangle,
    border: 'border-orange-200',
    bg: 'bg-orange-50/50',
    iconCls: 'text-orange-600',
    badge: 'Media',
    badgeCls: 'bg-orange-100 text-orange-800',
  },
  bad: {
    icon: AlertTriangle,
    border: 'border-red-200',
    bg: 'bg-red-50/50',
    iconCls: 'text-red-600',
    badge: 'Alta',
    badgeCls: 'bg-red-100 text-red-800',
  },
}

export default function FinanceAlertsPanel({ alerts }: { alerts: FinanceAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="text-sm text-green-700 py-6 text-center flex items-center justify-center gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Sin alertas — situación estable
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
      {alerts.map((alert) => {
        const style = PRIORITY_STYLE[alert.priority]
        const Icon = style.icon
        return (
          <div
            key={alert.id}
            className={cn('flex gap-3 p-3 rounded-lg border', style.border, style.bg)}
          >
            <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', style.iconCls)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                <span
                  className={cn(
                    'text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded',
                    style.badgeCls
                  )}
                >
                  {style.badge}
                </span>
              </div>
              <p className="text-xs text-gray-600">{alert.message}</p>
              {alert.action_href && alert.action_label && (
                <Link
                  href={alert.action_href}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 mt-1 inline-block"
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
