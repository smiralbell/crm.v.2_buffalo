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
import { roundMoney } from '@/lib/invoices/document'
import { formatSpanishDate, madridToday, nextMonthOnDay } from '@/lib/invoices/recurring-dates'

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
  suggestedDate: string
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
    where: { deleted_at: null, document_type: 'invoice' },
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
      suggestedDate: nextMonthOnDay(madridToday(), Number(madridToday().slice(8, 10))),
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
  suggestedDate,
}: NewRecurringInvoiceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'new' | 'existing'>(defaultSourceInvoiceId ? 'existing' : 'new')
  const [formData, setFormData] = useState({
    source_invoice_id: defaultSourceInvoiceId ? String(defaultSourceInvoiceId) : '',
    name: '',
    issue_day: String(new Date().getDate()),
    due_day: '',
    client_name: '',
    client_company_name: '',
    client_email: '',
    client_tax_id: '',
    client_address: '',
    line_description: 'Mantenimiento',
    base_amount: '',
    tax_percent: '21',
    next_issue_date: suggestedDate,
  })

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === Number(formData.source_invoice_id)) || null,
    [invoices, formData.source_invoice_id]
  )

  const base = Number(formData.base_amount.replace(',', '.'))
  const tax = Number(formData.tax_percent.replace(',', '.'))
  const previewTotal =
    Number.isFinite(base) && base > 0 && Number.isFinite(tax)
      ? roundMoney(base + roundMoney(base * (tax / 100)))
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const body =
        mode === 'existing'
          ? {
              source_invoice_id: Number(formData.source_invoice_id),
              name:
                formData.name.trim() ||
                `Recurrente ${selectedInvoice?.client_name || selectedInvoice?.invoice_number || ''}`.trim(),
              issue_day: Number(formData.issue_day),
              due_day: formData.due_day ? Number(formData.due_day) : null,
              is_active: true,
            }
          : {
              name: formData.name.trim() || `Mantenimiento ${formData.client_name}`.trim(),
              client_name: formData.client_name.trim(),
              client_company_name: formData.client_company_name.trim(),
              client_email: formData.client_email.trim(),
              client_tax_id: formData.client_tax_id.trim(),
              client_address: formData.client_address.trim(),
              line_description: formData.line_description.trim(),
              base_amount: base,
              tax_percent: tax,
              next_issue_date: formData.next_issue_date,
              is_active: true,
            }

      const res = await fetch('/api/invoices/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
              Guarda el cliente y el importe. La factura de verdad se crea el día que elijas, con el siguiente número.
            </p>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <Button type="button" variant={mode === 'new' ? 'default' : 'outline'} onClick={() => setMode('new')}>
            Crear con datos nuevos
          </Button>
          <Button
            type="button"
            variant={mode === 'existing' ? 'default' : 'outline'}
            onClick={() => setMode('existing')}
          >
            Usar una factura existente
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{mode === 'new' ? 'Datos de la mensualidad' : 'Configuración'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {mode === 'existing' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="source_invoice_id">Factura base *</Label>
                      <select
                        id="source_invoice_id"
                        value={formData.source_invoice_id}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, source_invoice_id: e.target.value }))
                        }
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
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="client_name">Cliente *</Label>
                      <Input
                        id="client_name"
                        value={formData.client_name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, client_name: e.target.value }))}
                        placeholder="Nombre del cliente"
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="client_company_name">Empresa</Label>
                        <Input
                          id="client_company_name"
                          value={formData.client_company_name}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, client_company_name: e.target.value }))
                          }
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="client_tax_id">CIF</Label>
                        <Input
                          id="client_tax_id"
                          value={formData.client_tax_id}
                          onChange={(e) => setFormData((prev) => ({ ...prev, client_tax_id: e.target.value }))}
                          disabled={loading}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client_email">Email</Label>
                      <Input
                        id="client_email"
                        type="email"
                        value={formData.client_email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, client_email: e.target.value }))}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="client_address">Dirección</Label>
                      <Input
                        id="client_address"
                        value={formData.client_address}
                        onChange={(e) => setFormData((prev) => ({ ...prev, client_address: e.target.value }))}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="line_description">Concepto *</Label>
                      <Input
                        id="line_description"
                        value={formData.line_description}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, line_description: e.target.value }))
                        }
                        placeholder="Mantenimiento"
                        required
                        disabled={loading}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="base_amount">Importe sin IVA *</Label>
                        <Input
                          id="base_amount"
                          inputMode="decimal"
                          value={formData.base_amount}
                          onChange={(e) => setFormData((prev) => ({ ...prev, base_amount: e.target.value }))}
                          placeholder="500"
                          required
                          disabled={loading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tax_percent">IVA %</Label>
                        <Input
                          id="tax_percent"
                          inputMode="decimal"
                          value={formData.tax_percent}
                          onChange={(e) => setFormData((prev) => ({ ...prev, tax_percent: e.target.value }))}
                          disabled={loading}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="next_issue_date">Día en que se crea la primera factura *</Label>
                      <Input
                        id="next_issue_date"
                        type="date"
                        value={formData.next_issue_date}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, next_issue_date: e.target.value }))
                        }
                        required
                        disabled={loading}
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Nombre interno</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Mensualidad del cliente"
                    disabled={loading}
                  />
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
                  <Button
                    type="submit"
                    disabled={loading || (mode === 'existing' && !formData.source_invoice_id)}
                  >
                    {loading ? 'Guardando...' : 'Guardar recurrente'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle>{mode === 'new' ? 'Qué va a pasar' : 'Factura base'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {mode === 'new' ? (
                <>
                  <p className="text-gray-700">
                    Hoy no se crea ninguna factura y no se gasta un número.
                  </p>
                  {formData.next_issue_date ? (
                    <p className="font-medium text-gray-900">
                      El {formatSpanishDate(formData.next_issue_date)} se creará la factura con el siguiente número
                      BUF que toque ese día.
                    </p>
                  ) : null}
                  <p className="text-gray-600">
                    Después se repetirá cada mes, el día {formData.next_issue_date?.slice(8, 10) || '—'}.
                    {previewTotal != null ? ` Importe con IVA: ${formatCurrency(previewTotal)}.` : ''}
                  </p>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                    Ejemplo: si la guardas en octubre y eliges el 23 de noviembre, la factura aparece el 23 de
                    noviembre, no el día en que la guardas.
                  </div>
                </>
              ) : selectedInvoice ? (
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
                    <p className="text-xs uppercase tracking-wide text-gray-500">Importe</p>
                    <p className="font-medium text-gray-900">{formatCurrency(selectedInvoice.total)}</p>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                    Esta opción copia una factura que ya existe. La nueva se crea cuando pulses Generar mes.
                    La original no se modifica.
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
