import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Item = {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  severity: 'info' | 'warning' | 'urgent'
  created_at: string
  read_at: string | null
}

const POLL_MS = 60_000

const severityDot: Record<Item['severity'], string> = {
  info: 'bg-sky-500',
  warning: 'bg-amber-500',
  urgent: 'bg-red-500',
}

export default function NotificationBell({
  showLabel,
  className,
  onNavigate,
}: {
  showLabel: boolean
  className?: string
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = (await res.json()) as { items: Item[]; unread: number }
      setItems(data.items || [])
      setUnread(data.unread || 0)
    } catch {
      // sin red: se reintenta en el siguiente ciclo
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  const markRead = async (ids?: string[]) => {
    setItems((prev) =>
      prev.map((i) => (!ids || ids.includes(i.id) ? { ...i, read_at: i.read_at ?? new Date().toISOString() } : i))
    )
    setUnread((n) => (ids ? Math.max(0, n - ids.length) : 0))
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids ? { ids } : {}),
    }).catch(() => undefined)
  }

  return (
    <>
      <button
        type="button"
        title="Avisos"
        aria-label={unread ? `Avisos (${unread} sin leer)` : 'Avisos'}
        onClick={() => {
          setOpen(true)
          void load()
        }}
        className={cn('relative', className)}
      >
        <Bell className="h-4 w-4 shrink-0" />
        {showLabel && <span className="flex-1 truncate text-left">Avisos</span>}
        {unread > 0 && (
          <span
            className={cn(
              'inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-[18px] text-white',
              showLabel ? '' : 'absolute -right-0.5 -top-0.5'
            )}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle>Avisos</DialogTitle>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => void markRead()}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Marcar todo como leído
                </button>
              )}
            </div>
          </DialogHeader>
          <div className="-mx-2 max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">No tienes avisos.</p>
            ) : (
              <ul className="space-y-1">
                {items.map((n) => {
                  const content = (
                    <div className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60">
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          n.read_at ? 'bg-transparent ring-1 ring-border' : severityDot[n.severity]
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', n.read_at ? 'text-muted-foreground' : 'font-medium')}>
                          {n.title}
                        </p>
                        {n.body && <p className="mt-0.5 line-clamp-3 text-xs text-muted-foreground">{n.body}</p>}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: es })}
                        </p>
                      </div>
                    </div>
                  )
                  return (
                    <li key={n.id}>
                      {n.link ? (
                        <Link
                          href={n.link}
                          onClick={() => {
                            if (!n.read_at) void markRead([n.id])
                            setOpen(false)
                            onNavigate?.()
                          }}
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => !n.read_at && void markRead([n.id])}
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
