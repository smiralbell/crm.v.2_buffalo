import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Plus, RefreshCw, Trash2 } from 'lucide-react'

interface RecurringInvoiceRow {
  id: string
  name: string
  source_invoice_id: number
  source_invoice_number: string
  client_name: string
  total: string | number
  source_status: string
  issue_day: number
  due_day: number | null
  is_active: boolean
  last_generated_at: string | null
  last_generated_period: string | null
  last_generated_invoice_id: number | null
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
         ri.created_at::text,
         i.invoice_number AS source_invoice_number,
         i.client_name,
         i.total,
         i.status AS source_status
       FROM recurring_invoices ri
       INNER JOIN invoices i ON i.id = ri.source_invoice_id
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
          <div className="flex items-center gap-3">
            <Link href="/invoices">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Facturas recurrentes</h1>
              <p className="text-sm text-gray-600">
                Plantillas mensuales para generar facturas nuevas con número y fecha actualizados.
              </p>
            </div>
          </div>
          <Link href="/invoices/recurring/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nueva recurrente
            </Button>
          </Link>
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
                  Crea una plantilla a partir de una factura existente y luego genera la del mes cuando quieras.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Plantilla</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Factura base</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Cliente</th>
                      <th className="p-3 text-left text-sm font-medium text-gray-700">Día emisión</th>
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
                          <div className="text-xs text-gray-500">{formatCurrency(item.total)}</div>
                        </td>
                        <td className="p-3 text-sm text-gray-700">{item.source_invoice_number}</td>
                        <td className="p-3 text-sm text-gray-700">{item.client_name}</td>
                        <td className="p-3 text-sm text-gray-700">
                          Día {item.issue_day}
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
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGenerate(item.id)}
                              disabled={loadingId === item.id || !item.is_active}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              {loadingId === item.id ? 'Generando...' : 'Generar mes'}
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
