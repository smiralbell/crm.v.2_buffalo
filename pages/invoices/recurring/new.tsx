import { GetServerSideProps } from 'next'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import FullScreenLayout from '@/components/FullScreenLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'

interface InvoiceOption {
  id: number
  invoice_number: string
  client_name: string
  total: number
  issue_date: string
}

interface NewRecurringInvoiceProps {
  invoices: InvoiceOption[]
  defaultSourceInvoiceId: number | null
}

export const getServerSideProps: GetServerSideProps<NewRecurringInvoiceProps> = async (context) => {
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

  const invoices = await prisma.invoice.findMany({
    where: { deleted_at: null },
    select: {
      id: true,
      invoice_number: true,
      client_name: true,
      total: true,
      issue_date: true,
    },
    orderBy: { issue_date: 'desc' },
    take: 200,
  })

  const defaultSourceInvoiceId = Number(context.query.sourceInvoiceId || 0) || null

  return {
    props: {
      invoices: invoices.map((invoice) => ({
        ...invoice,
        total: Number(invoice.total),
        issue_date: invoice.issue_date.toISOString().slice(0, 10),
      })),
      defaultSourceInvoiceId,
    },
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value)
}

export default function NewRecurringInvoice({
  invoices,
  defaultSourceInvoiceId,
}: NewRecurringInvoiceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    source_invoice_id: defaultSourceInvoiceId ? String(defaultSourceInvoiceId) : '',
    name: '',
    issue_day: String(new Date().getDate()),
    due_day: '',
  })

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === Number(formData.source_invoice_id)) || null,
    [invoices, formData.source_invoice_id]
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/invoices/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_invoice_id: Number(formData.source_invoice_id),
          name:
            formData.name.trim() ||
            `Recurrente ${selectedInvoice?.client_name || selectedInvoice?.invoice_number || ''}`.trim(),
          issue_day: Number(formData.issue_day),
          due_day: formData.due_day ? Number(formData.due_day) : null,
          is_active: true,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo crear la factura recurrente')
        setLoading(false)
        return
      }

      router.push('/invoices/recurring')
    } catch {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  return (
    <FullScreenLayout>
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/invoices/recurring">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Nueva factura recurrente</h1>
            <p className="text-sm text-gray-600">
              Elige una factura existente como base. Cada mes se generará una nueva con número y fecha nuevos.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Configuración</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="source_invoice_id">Factura base *</Label>
                  <select
                    id="source_invoice_id"
                    value={formData.source_invoice_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, source_invoice_id: e.target.value }))}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    required
                    disabled={loading}
                  >
                    <option value="">Selecciona una factura</option>
                    {invoices.map((invoice) => (
                      <option key={invoice.id} value={invoice.id}>
                        {invoice.invoice_number} · {invoice.client_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Nombre interno *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Mensualidad CBD Click Group"
                    required
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="issue_day">Día de emisión *</Label>
                    <Input
                      id="issue_day"
                      type="number"
                      min="1"
                      max="31"
                      value={formData.issue_day}
                      onChange={(e) => setFormData((prev) => ({ ...prev, issue_day: e.target.value }))}
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due_day">Día de vencimiento</Label>
                    <Input
                      id="due_day"
                      type="number"
                      min="1"
                      max="31"
                      value={formData.due_day}
                      onChange={(e) => setFormData((prev) => ({ ...prev, due_day: e.target.value }))}
                      placeholder="Opcional"
                      disabled={loading}
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Link href="/invoices/recurring">
                    <Button type="button" variant="outline" disabled={loading}>
                      Cancelar
                    </Button>
                  </Link>
                  <Button type="submit" disabled={loading || !formData.source_invoice_id}>
                    {loading ? 'Guardando...' : 'Crear plantilla'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>Factura base</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {selectedInvoice ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Número actual</p>
                    <p className="font-medium text-gray-900">{selectedInvoice.invoice_number}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Cliente</p>
                    <p className="font-medium text-gray-900">{selectedInvoice.client_name}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Fecha actual</p>
                    <p className="font-medium text-gray-900">{selectedInvoice.issue_date}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Importe</p>
                    <p className="font-medium text-gray-900">{formatCurrency(selectedInvoice.total)}</p>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                    Al generar una factura del mes se copiarán cliente, datos fiscales, líneas e importes.
                    Solo cambiarán el número de factura y las fechas.
                  </div>
                </>
              ) : (
                <p className="text-gray-500">Selecciona una factura base para ver el resumen.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </FullScreenLayout>
  )
}
