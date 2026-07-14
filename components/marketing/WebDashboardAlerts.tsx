'use client'

import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WebDashboardAlert } from '@/lib/marketing/web-dashboard.types'

const styles: Record<
  WebDashboardAlert['severity'],
  { wrap: string; icon: typeof Info; iconClass: string }
> = {
  info: {
    wrap: 'border-sky-200/80 bg-sky-50/50',
    icon: Info,
    iconClass: 'text-sky-700',
  },
  warning: {
    wrap: 'border-amber-200/80 bg-amber-50/50',
    icon: AlertTriangle,
    iconClass: 'text-amber-700',
  },
  urgent: {
    wrap: 'border-red-200/80 bg-red-50/50',
    icon: AlertCircle,
    iconClass: 'text-red-700',
  },
}

export default function WebDashboardAlerts({ alerts }: { alerts: WebDashboardAlert[] }) {
  if (alerts.length === 0) return null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {alerts.map((alert) => {
        const style = styles[alert.severity]
        const Icon = style.icon
        return (
          <div
            key={alert.id}
            className={cn('rounded-xl border px-4 py-3 flex gap-3', style.wrap)}
          >
            <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', style.iconClass)} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{alert.title}</p>
              <p className="text-xs text-gray-600 mt-0.5">{alert.message}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
