'use client'

import Link from 'next/link'
import { AlertCircle, AlertTriangle, Bell, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WebDashboardAlert } from '@/lib/marketing/web-dashboard.types'

const styles: Record<
  WebDashboardAlert['severity'],
  { wrap: string; icon: typeof Info; iconClass: string }
> = {
  info: {
    wrap: 'border-gray-200 bg-gray-50/80',
    icon: Info,
    iconClass: 'text-gray-500',
  },
  warning: {
    wrap: 'border-amber-200/80 bg-amber-50/60',
    icon: AlertTriangle,
    iconClass: 'text-amber-700',
  },
  urgent: {
    wrap: 'border-red-200/80 bg-red-50/60',
    icon: AlertCircle,
    iconClass: 'text-red-700',
  },
}

export default function WebDashboardAlerts({ alerts }: { alerts: WebDashboardAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Bell className="h-5 w-5 text-gray-300 mb-2" />
        <p className="text-sm text-gray-500">Sin alertas pendientes</p>
        <p className="text-xs text-gray-400 mt-1">Todo al día en web</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
      {alerts.map((alert) => {
        const style = styles[alert.severity]
        const Icon = style.icon
        const body = (
          <div
            className={cn(
              'rounded-xl border px-3 py-2.5 flex gap-2.5 transition-colors',
              style.wrap,
              alert.href && 'hover:border-gray-300 cursor-pointer'
            )}
          >
            <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', style.iconClass)} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 leading-snug">{alert.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{alert.message}</p>
            </div>
          </div>
        )

        if (alert.href) {
          return (
            <Link key={alert.id} href={alert.href} className="block">
              {body}
            </Link>
          )
        }
        return <div key={alert.id}>{body}</div>
      })}
    </div>
  )
}
