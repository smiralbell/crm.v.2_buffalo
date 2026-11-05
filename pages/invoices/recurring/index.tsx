import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureRecurringInvoiceColumns } from '@/lib/invoices/recurring'
import { formatSpanishDate, madridToday } from '@/lib/invoices/recurring-dates'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'

interface RecurringInvoiceRow {
  id: string
  name: string
  source_invoice_id: number | null
  source_invoice_number: string | null
  client_name: string | null
  total: string | number | null
  source_status: string | null
  issue_day: number
  due_day: number | null
  is_active: boolean
  last_generated_at: string | null
  last_generated_period: string | null
  last_generated_invoice_id: number | null
  next_issue_date: string | null
  created_at: string
}

interface RecurringInvoicesPageProps {
  recurringInvoices: RecurringInvoiceRow[]
  error?: string
}

export const getServerSideProps: GetServerSideProps<RecurringInvoicesPageProps> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    }
  }

  try {
    await ensureRecurringInvoiceColumns()
    const result = await query<RecurringInvoiceRow>(
      `SELECT
         ri.id,
         ri.name,
         ri.source_invoice_id,
         ri.issue_day,
         ri.due_day,
         ri.is_active,
         ri.last_generated_at::text,
         ri.last_generated_period,
         ri.last_generated_invoice_id,
         ri.next_issue_date::text AS next_issue_date,
         ri.created_at::text,
         i.invoice_number AS source_invoice_number,
         COALESCE(ri.client_name, i.client_name) AS client_name,
         COALESCE(
           i.total,
           ROUND(ri.base_amount * (1 + COALESCE(ri.tax_percent, 21) / 100), 2)
         ) AS total,
         i.status AS source_status
       FROM recurring_invoices ri
       LEFT JOIN invoices i ON i.id = ri.source_invoice_id
       WHERE ri.deleted_at IS NULL
       ORDER BY ri.created_at DESC`
    )

    return {
      props: {
        recurringInvoices: result.rows,
      },
    }
  } catch (error: any) {
    return {
      props: {
        recurringInvoices: [],
        error:
          'No se pudo cargar el apartado de recurrentes. Si aún no existe la tabla, ejecuta `prisma/CREATE_RECURRING_INVOICES_TABLE.sql`.',
      },
    }
  }
}

function formatCurrency(value: number | string) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(Number(value || 0))
}

export default function RecurringInvoicesPage({
  recurringInvoices,
  error,
}: RecurringInvoicesPageProps) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const active = recurringInvoices.filter((item) => item.is_active)
  const paused = recurringInvoices.length - active.length
  const mrr = active.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const thisMonthKey = madridToday().slice(0, 7)
  const dueThisMonth = active.filter(
    (item) => item.next_issue_date && item.next_issue_date.slice(0, 7) === thisMonthKey
  )
  const dueThisMonthTotal = dueThisMonth.reduce((sum, item) => sum + Number(item.total || 0), 0)
  const average = active.length > 0 ? mrr / active.length : 0

  const handleGenerate = async (id: string) => {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/invoices/recurring/${id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'No se pudo generar la factura')
        setLoadingId(null)
        return
      }
      router.push(`/invoices/${data.id}/edit`)
    } catch {
      alert('Error de conexión')
    } finally {
      setLoadingId(null)
    }
  }

  const handleToggle = async (id: string, nextActive: boolean) => {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/invoices/recurring/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'No se pudo actualizar la plantilla')
        setLoadingId(null)
        return
      }
      router.reload()
    } catch {
      alert('Error de conexión')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que quieres eliminar esta plantilla recurrente?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/invoices/recurring/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'No se pudo eliminar la plantilla')
        setDeletingId(null)
        return
      }
      router.reload()
    } catch {
      alert('Error de conexión')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/invoices">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-gray-900">Facturas recurrentes</h1>
              <p className="text-sm text-gray-500">Mantenimientos que se facturan cada mes</p>
            </div>
          </div>
          <Link href="/invoices/recurring/new">
            <Button className="rounded-xl">
              <Plus className="mr-2 h-4 w-4" />
              Nueva recurrente
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
              <p className="mb-2 text-xs font-medium text-gray-500 sm:text-sm">MRR</p>
              <div className="mb-1 break-words text-lg font-semibold text-gray-900 sm:text-2xl">
                {formatCurrency(mrr)}
              </div>
              <p className="text-xs text-gray-400">Al mes, con IVA. Solo las activas.</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
              <p className="mb-2 text-xs font-medium text-gray-500 sm:text-sm">ARR</p>
              <div className="mb-1 break-words text-lg font-semibold text-gray-900 sm:text-2xl">
                {formatCurrency(mrr * 12)}
              </div>
              <p className="text-xs text-gray-400">Lo mismo, multiplicado por 12 meses.</p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
              <p className="mb-2 text-xs font-medium text-gray-500 sm:text-sm">Este mes</p>
              <div className="mb-1 break-words text-lg font-semibold text-gray-900 sm:text-2xl">
                {formatCurrency(dueThisMonthTotal)}
              </div>
              <p className="text-xs text-gray-400">
                {dueThisMonth.length === 1
                  ? '1 factura se crea este mes'
                  : `${dueThisMonth.length} facturas se crean este mes`}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-gray-200 shadow-sm">
            <CardContent className="px-3 pt-4 sm:px-6 sm:pt-6">
              <p className="mb-2 text-xs font-medium text-gray-500 sm:text-sm">Activos</p>
              <div className="mb-1 text-xl font-semibold text-gray-900 sm:text-2xl">{active.length}</div>
              <p className="text-xs text-gray-400">
                Ticket medio {formatCurrency(average)}
                {paused > 0 ? ` · ${paused} en pausa` : ''}
              </p>
            </CardContent>
          </Card>
        </div>

        {error && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="pt-6 text-sm text-yellow-900">{error}</CardContent>
          </Card>
        )}

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle>Plantillas activas y archivadas</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recurringInvoices.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-base font-medium text-gray-700">Todavía no hay facturas recurrentes</p>
                <p className="mt-1 text-sm text-gray-500">
                  Crea una con los datos del cliente y el día de la primera factura. Ese día se creará sola, con el siguiente número.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Plantilla</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Origen</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Cliente</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Próxima factura</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Última generación</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Estado</th>
                      <th className="p-3 text-right text-sm font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringInvoices.map((item) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50">
                        <td className="p-3">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500">{formatCurrency(item.total || 0)}</div>
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.source_invoice_number || 'Datos propios'}
                        </td>
                        <td className="p-3 text-sm text-gray-700">{item.client_name || '—'}</td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.next_issue_date
                            ? formatSpanishDate(item.next_issue_date.slice(0, 10))
                            : `Día ${item.issue_day}, al pulsar Generar`}
                          {item.due_day ? ` · vence día ${item.due_day}` : ''}
                        </td>
                        <td className="p-3 text-sm text-gray-700">
                          {item.last_generated_period
                            ? `${item.last_generated_period}${item.last_generated_invoice_id ? ` · #${item.last_generated_invoice_id}` : ''}`
                            : 'Nunca'}
                        </td>
                        <td className="p-3">
                          <Badge variant={item.is_active ? 'default' : 'secondary'}>
                            {item.is_active ? 'Activa' : 'Pausada'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Link href={`/invoices/recurring/${item.id}/edit`}>
                              <Button size="sm" variant="outline">
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGenerate(item.id)}
                              disabled={
                                loadingId === item.id ||
                                !item.is_active ||
                                Boolean(item.next_issue_date && item.next_issue_date.slice(0, 10) > madridToday())
                              }
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              {loadingId === item.id
                                ? 'Generando...'
                                : item.next_issue_date && item.next_issue_date.slice(0, 10) > madridToday()
                                  ? 'Espera al día'
                                  : 'Generar mes'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleToggle(item.id, !item.is_active)}
                              disabled={loadingId === item.id}
                            >
                              {item.is_active ? 'Pausar' : 'Activar'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleDelete(item.id)}
                              disabled={deletingId === item.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  )
}
