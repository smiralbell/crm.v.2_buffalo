import { GetServerSideProps } from 'next'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureRecurringInvoiceColumns } from '@/lib/invoices/recurring'
import { ensureRecurringEmailSchema } from '@/lib/invoices/recurring-email'
import { madridToday } from '@/lib/invoices/recurring-dates'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
import RecurringEmailDialog from '@/components/invoices/RecurringEmailDialog'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  CalendarClock,
  Loader2,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
  Zap,
} from 'lucide-react'

interface RecurringInvoiceRow {
  id: string
  name: string
  client_name: string | null
  total: string | number | null
  issue_day: number
  due_day: number | null
  is_active: boolean
  last_generated_period: string | null
  last_invoice_number: string | null
  next_issue_date: string | null
  created_at: string
  email_enabled: boolean
  email_send_day: number | null
  last_email_status: string | null
  last_email_at: string | null
}

interface RecurringInvoicesPageProps {
  recurringInvoices: RecurringInvoiceRow[]
  error?: string
}

export const getServerSideProps: GetServerSideProps<RecurringInvoicesPageProps> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  try {
    await ensureRecurringInvoiceColumns()
    await ensureRecurringEmailSchema()
    const result = await query<RecurringInvoiceRow>(
      `SELECT
         ri.id,
         ri.name,
         ri.issue_day,
         ri.due_day,
         ri.is_active,
         ri.last_generated_period,
         lg.invoice_number AS last_invoice_number,
         ri.next_issue_date::text AS next_issue_date,
         ri.created_at::text,
         COALESCE(ri.client_name, i.client_name) AS client_name,
         COALESCE(
           i.total,
           ROUND(ri.base_amount * (1 + COALESCE(ri.tax_percent, 21) / 100), 2)
         ) AS total,
         ri.email_enabled,
         ri.email_send_day,
         last_send.status AS last_email_status,
         COALESCE(last_send.sent_at, last_send.scheduled_at)::text AS last_email_at
       FROM recurring_invoices ri
       LEFT JOIN invoices i ON i.id = ri.source_invoice_id
       LEFT JOIN invoices lg ON lg.id = ri.last_generated_invoice_id
       LEFT JOIN LATERAL (
         SELECT s.status, s.sent_at, s.scheduled_at
           FROM invoice_email_sends s
          WHERE s.recurring_id = ri.id AND s.kind <> 'test'
          ORDER BY s.created_at DESC
          LIMIT 1
       ) last_send ON TRUE
       WHERE ri.deleted_at IS NULL
       ORDER BY ri.is_active DESC, ri.next_issue_date ASC NULLS LAST, ri.created_at DESC`
    )
    return { props: { recurringInvoices: result.rows } }
  } catch {
    return {
      props: {
        recurringInvoices: [],
        error:
          'No se pudo cargar el apartado de recurrentes. Si aún no existe la tabla, ejecuta `prisma/CREATE_RECURRING_INVOICES_TABLE.sql`.',
      },
    }
  }
}

function formatCurrency(value: number | string | null) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(
    Number(value || 0)
  )
}

/** «2026-12-05» → «5 dic 2026» */
function shortDate(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-ES', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function shortStamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' })
}

type Filter = 'active' | 'paused' | 'all'

const EMAIL_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Programado', className: 'text-blue-600' },
  sending: { label: 'Enviando', className: 'text-blue-600' },
  sent: { label: 'Enviado', className: 'text-emerald-600' },
  failed: { label: 'Error al enviar', className: 'text-red-600' },
  cancelled: { label: 'Cancelado', className: 'text-gray-400' },
}

export default function RecurringInvoicesPage({ recurringInvoices, error }: RecurringInvoicesPageProps) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [emailFor, setEmailFor] = useState<RecurringInvoiceRow | null>(null)
  const [filter, setFilter] = useState<Filter>('active')

  const today = madridToday()
  const active = useMemo(() => recurringInvoices.filter((item) => item.is_active), [recurringInvoices])
  const paused = useMemo(() => recurringInvoices.filter((item) => !item.is_active), [recurringInvoices])
  const mrr = active.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const dueThisMonth = active.filter((item) => item.next_issue_date?.slice(0, 7) === today.slice(0, 7))
  const dueThisMonthTotal = dueThisMonth.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const average = active.length > 0 ? mrr / active.length : 0
  const autoEmail = active.filter((item) => item.email_enabled).length

  const visible = filter === 'active' ? active : filter === 'paused' ? paused : recurringInvoices

  const refresh = () => router.replace(router.asPath, undefined, { scroll: false })

  const handleGenerate = async (item: RecurringInvoiceRow) => {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/invoices/recurring/${item.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'No se pudo generar la factura')
        return
      }
      router.push(`/invoices/${data.id}/edit`)
    } catch {
      alert('Error de conexión')
    } finally {
      setBusyId(null)
    }
  }

  const handleToggle = async (item: RecurringInvoiceRow) => {
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/invoices/recurring/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !item.is_active }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'No se pudo actualizar')
        return
      }
      await refresh()
    } catch {
      alert('Error de conexión')
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (item: RecurringInvoiceRow) => {
    if (!window.confirm(`¿Eliminar la recurrente de ${item.client_name || item.name}? Las facturas ya creadas no se tocan.`)) return
    setBusyId(item.id)
    try {
      const res = await fetch(`/api/invoices/recurring/${item.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'No se pudo eliminar')
        return
      }
      await refresh()
    } catch {
      alert('Error de conexión')
    } finally {
      setBusyId(null)
    }
  }

  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'active', label: 'Activas', count: active.length },
    { id: 'paused', label: 'En pausa', count: paused.length },
    { id: 'all', label: 'Todas', count: recurringInvoices.length },
  ]

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/invoices">
            <Button variant="ghost" size="sm" className="rounded-xl text-gray-600">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Facturas
            </Button>
          </Link>
          <Link href="/invoices/recurring/new">
            <Button className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Nueva recurrente
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="MRR" value={formatCurrency(mrr)} hint="Al mes, con IVA" dark />
          <Stat label="ARR" value={formatCurrency(mrr * 12)} hint="MRR × 12" />
          <Stat
            label="Este mes"
            value={formatCurrency(dueThisMonthTotal)}
            hint={dueThisMonth.length === 1 ? '1 factura por crear' : `${dueThisMonth.length} facturas por crear`}
          />
          <Stat
            label="Activas"
            value={String(active.length)}
            hint={`Ticket medio ${formatCurrency(average)}${autoEmail ? ` · ${autoEmail} con envío auto` : ''}`}
          />
        </div>

        {error && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
        )}

        <div className="inline-flex rounded-xl bg-gray-100 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                filter === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              )}
            >
              {t.label}
              <span className={cn('ml-1.5 text-xs', filter === t.id ? 'text-gray-500' : 'text-gray-400')}>{t.count}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
              <Repeat className="h-5 w-5 text-gray-500" />
            </div>
            <p className="font-medium text-gray-800">
              {recurringInvoices.length === 0 ? 'Todavía no hay facturas recurrentes' : 'Nada por aquí'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              {recurringInvoices.length === 0
                ? 'Crea una con los datos del cliente y el día de la primera factura. Cada mes se creará sola y, si quieres, se enviará por email.'
                : 'Cambia el filtro para ver el resto.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((item) => (
              <RecurringRow
                key={item.id}
                item={item}
                today={today}
                busy={busyId === item.id}
                onEmail={() => setEmailFor(item)}
                onEdit={() => router.push(`/invoices/recurring/${item.id}/edit`)}
                onGenerate={() => void handleGenerate(item)}
                onToggle={() => void handleToggle(item)}
                onDelete={() => void handleDelete(item)}
              />
            ))}
          </div>
        )}
      </div>

      {emailFor && (
        <RecurringEmailDialog
          recurringId={emailFor.id}
          name={emailFor.client_name || emailFor.name}
          nextIssueDate={emailFor.next_issue_date ? emailFor.next_issue_date.slice(0, 10) : null}
          open={Boolean(emailFor)}
          onOpenChange={(open) => {
            if (!open) {
              setEmailFor(null)
              void refresh()
            }
          }}
        />
      )}
    </Layout>
  )
}

function Stat({ label, value, hint, dark }: { label: string; value: string; hint: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4 sm:p-5',
        dark ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-900'
      )}
    >
      <p className={cn('text-xs font-medium uppercase tracking-wide', dark ? 'text-gray-400' : 'text-gray-500')}>{label}</p>
      <p className="mt-2 break-words text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-gray-400">{hint}</p>
    </div>
  )
}

function IconButton({
  title,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:pointer-events-none disabled:opacity-40',
        danger && 'hover:bg-red-50 hover:text-red-600'
      )}
    >
      {children}
    </button>
  )
}

function RecurringRow({
  item,
  today,
  busy,
  onEmail,
  onEdit,
  onGenerate,
  onToggle,
  onDelete,
}: {
  item: RecurringInvoiceRow
  today: string
  busy: boolean
  onEmail: () => void
  onEdit: () => void
  onGenerate: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const client = item.client_name || item.name
  const next = item.next_issue_date?.slice(0, 10) || null
  const dueNow = item.is_active && (!next || next <= today)
  const lastEmail = item.last_email_status ? EMAIL_STATUS[item.last_email_status] : null

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border p-4 shadow-sm transition-colors lg:flex-row lg:items-center',
        item.is_active ? 'border-gray-200 bg-white hover:border-gray-300' : 'border-gray-100 bg-gray-50/60'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            item.is_active ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'
          )}
        >
          {client.trim().charAt(0).toUpperCase() || '·'}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn('truncate font-semibold', item.is_active ? 'text-gray-900' : 'text-gray-500')}>{client}</p>
            {!item.is_active && (
              <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                En pausa
              </span>
            )}
          </div>
          <p className="truncate text-xs text-gray-500">
            {item.name !== client ? `${item.name} · ` : ''}
            {item.last_invoice_number ? `Última ${item.last_invoice_number}` : 'Aún sin facturas'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm lg:w-[480px] lg:shrink-0">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Al mes</p>
          <p className="mt-0.5 font-semibold tabular-nums text-gray-900">{formatCurrency(item.total)}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Próxima</p>
          <p className={cn('mt-0.5 font-medium', dueNow ? 'text-amber-600' : 'text-gray-900')}>
            {next ? shortDate(next) : `Día ${item.issue_day}`}
          </p>
          {item.due_day ? <p className="text-xs text-gray-400">vence día {item.due_day}</p> : null}
        </div>
        <button type="button" onClick={onEmail} className="group text-left">
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Email</p>
          <p
            className={cn(
              'mt-0.5 inline-flex items-center gap-1 font-medium group-hover:underline',
              item.email_enabled ? 'text-emerald-700' : 'text-gray-500'
            )}
          >
            <Mail className="h-3.5 w-3.5" />
            {item.email_enabled ? `Auto · ${item.email_send_day ? `día ${item.email_send_day}` : 'al crearla'}` : 'Manual'}
          </p>
          {lastEmail && (
            <p className={cn('text-xs', lastEmail.className)}>
              {lastEmail.label}
              {item.last_email_at ? ` · ${shortStamp(item.last_email_at)}` : ''}
            </p>
          )}
        </button>
      </div>

      <div className="flex items-center justify-end gap-0.5 border-t border-gray-100 pt-3 lg:border-0 lg:pt-0">
        {dueNow && (
          <Button size="sm" className="mr-1 rounded-xl" onClick={onGenerate} disabled={busy}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
            Crear factura
          </Button>
        )}
        {!dueNow && item.is_active && next && (
          <span className="mr-1 hidden items-center gap-1 text-xs text-gray-400 xl:inline-flex" title="Se crea sola ese día a las 9:00">
            <CalendarClock className="h-3.5 w-3.5" />
            automática
          </span>
        )}
        <IconButton title="Envío por email" onClick={onEmail} disabled={busy}>
          <Mail className="h-4 w-4" />
        </IconButton>
        <IconButton title="Editar" onClick={onEdit} disabled={busy}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton title={item.is_active ? 'Pausar' : 'Reactivar'} onClick={onToggle} disabled={busy}>
          {item.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </IconButton>
        <IconButton title="Eliminar" onClick={onDelete} disabled={busy} danger>
          <Trash2 className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}
