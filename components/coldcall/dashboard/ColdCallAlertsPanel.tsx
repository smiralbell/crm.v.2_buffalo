import Link from 'next/link'
import { AlertTriangle, Bell, Calendar, CheckCircle2, Clock, Phone } from 'lucide-react'
import type { ColdCallAlert, ColdCallAlertPriority } from '@/lib/coldcall/dashboard-analytics'
import { cn } from '@/lib/utils'

const PRIORITY_STYLE: Record<
  ColdCallAlertPriority,
  { icon: typeof Bell; border: string; bg: string; iconCls: string }
> = {
  high: {
    icon: AlertTriangle,
    border: 'border-red-200',
    bg: 'bg-red-50/60',
    iconCls: 'text-red-600',
  },
  medium: {
    icon: Clock,
    border: 'border-amber-200',
    bg: 'bg-amber-50/50',
    iconCls: 'text-amber-600',
  },
  low: {
    icon: Calendar,
    border: 'border-gray-200',
    bg: 'bg-gray-50/80',
    iconCls: 'text-gray-500',
  },
}

export default function ColdCallAlertsPanel({ alerts }: { alerts: ColdCallAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <CheckCircle2 className="h-5 w-5 text-gray-400" />
        <p className="text-sm text-gray-500">Sin alertas pendientes</p>
        <p className="text-xs text-gray-400">Reuniones, callbacks y llamadas al día</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
      {alerts.map((alert) => {
        const style = PRIORITY_STYLE[alert.priority]
        const Icon = alert.type === 'llamar_hoy' || alert.type === 'llamar_atrasado' ? Phone : style.icon
        return (
          <div
            key={alert.id}
            className={cn('flex gap-3 p-3 rounded-lg border', style.border, style.bg)}
          >
            <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', style.iconCls)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{alert.title}</p>
              <p className="text-xs text-gray-600 mt-0.5">{alert.message}</p>
              {alert.action_href && alert.action_label && (
                <Link
                  href={alert.action_href}
                  className="text-xs font-medium text-gray-800 hover:text-gray-950 mt-1.5 inline-flex items-center gap-1"
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
