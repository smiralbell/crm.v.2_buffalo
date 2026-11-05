import { GetServerSideProps } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { query } from '@/lib/db'
import { ensureRecurringInvoiceColumns } from '@/lib/invoices/recurring'
import { maintenanceConcept, parseIsoDate } from '@/lib/invoices/recurring-dates'
import { roundMoney } from '@/lib/invoices/document'
import FullScreenLayout from '@/components/FullScreenLayout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft } from 'lucide-react'

interface RecurringTemplate {
  id: string
  name: string
  source_invoice_id: number | null
  source_invoice_number: string | null
  client_name: string
  client_company_name: string
  client_email: string
  client_address: string
  client_tax_id: string
  line_description: string
  base_amount: string
  tax_percent: string
  next_issue_date: string
  due_day: string
  owns_data: boolean
}

interface EditRecurringInvoiceProps {
  template: RecurringTemplate
}

export const getServerSideProps: GetServerSideProps<EditRecurringInvoiceProps> = async (context) => {
  try {
    await requireAuth(context)
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }

  const id = context.params?.id
  if (typeof id !== 'string' || !id) return { notFound: true }

  try {
    await ensureRecurringInvoiceColumns()
    const result = await query<{
      id: string
      name: string
      source_invoice_id: number | null
      source_invoice_number: string | null
      client_name: string | null
      client_company_name: string | null
      client_email: string | null
      client_address: string | null
      client_tax_id: string | null
      line_description: string | null
      base_amount: string | null
      tax_percent: string | null
      next_issue_date: string | null
      due_day: number | null
    }>(
      `SELECT
         ri.id,
         ri.name,
         ri.source_invoice_id,
         ri.due_day,
         ri.line_description,
         ri.base_amount::text AS base_amount,
         ri.tax_percent::text AS tax_percent,
         ri.next_issue_date::text AS next_issue_date,
         i.invoice_number AS source_invoice_number,
         COALESCE(ri.client_name, i.client_name) AS client_name,
         COALESCE(ri.client_company_name, i.client_company_name) AS client_company_name,
         COALESCE(ri.client_email, i.client_email) AS client_email,
         COALESCE(ri.client_address, i.client_address) AS client_address,
         COALESCE(ri.client_tax_id, i.client_tax_id) AS client_tax_id
       FROM recurring_invoices ri
       LEFT JOIN invoices i ON i.id = ri.source_invoice_id
       WHERE ri.id = $1 AND ri.deleted_at IS NULL
       LIMIT 1`,
      [id]
    )
    const row = result.rows[0]
    if (!row) return { notFound: true }

    return {
      props: {
        template: {
          id: row.id,
          name: row.name || '',
          source_invoice_id: row.source_invoice_id,
          source_invoice_number: row.source_invoice_number,
          client_name: row.client_name || '',
          client_company_name: row.client_company_name || '',
          client_email: row.client_email || '',
          client_address: row.client_address || '',
          client_tax_id: row.client_tax_id || '',
          line_description: row.line_description || '',
          base_amount: row.base_amount || '',
          tax_percent: row.tax_percent || '21',
          next_issue_date: row.next_issue_date?.slice(0, 10) || '',
          due_day: row.due_day == null ? '' : String(row.due_day),
          owns_data: !row.source_invoice_id || Boolean(row.line_description) || row.base_amount != null,
        },
      },
    }
  } catch {
    return { notFound: true }
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value)
}

export default function EditRecurringInvoice({ template }: EditRecurringInvoiceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    name: template.name,
    client_name: template.client_name,
    client_company_name: template.client_company_name,
    client_email: template.client_email,
    client_tax_id: template.client_tax_id,
    client_address: template.client_address,
    line_description: template.line_description,
    base_amount: template.base_amount,
    tax_percent: template.tax_percent,
    next_issue_date: template.next_issue_date,
    due_day: template.due_day,
  })

  const base = Number(formData.base_amount.replace(',', '.'))
  const tax = Number(formData.tax_percent.replace(',', '.'))
  const previewTotal =
    Number.isFinite(base) && base > 0 && Number.isFinite(tax)
      ? roundMoney(base + roundMoney(base * (tax / 100)))
      : null
  const conceptPreview =
    formData.line_description.trim() && parseIsoDate(formData.next_issue_date)
      ? maintenanceConcept(
          formData.line_description,
          formData.next_issue_date,
          Number(formData.next_issue_date.slice(8, 10))
        )
      : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const hasOwnAmount = Number.isFinite(base) && base > 0
    const hasConcept = Boolean(formData.line_description.trim())
    if (template.owns_data || hasConcept || hasOwnAmount) {
      if (!formData.client_name.trim()) {
        setError('Escribe el nombre del cliente')
        return
      }
      if (!hasConcept) {
        setError('Escribe el concepto, por ejemplo Mantenimiento')
        return
      }
      if (!hasOwnAmount) {
        setError('Escribe el importe sin IVA')
        return
      }
      if (!parseIsoDate(formData.next_issue_date)) {
        setError('Elige el día de la próxima factura')
        return
      }
    }

    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        name: formData.name.trim() || `Mantenimiento ${formData.client_name}`.trim(),
        client_name: formData.client_name.trim(),
        client_company_name: formData.client_company_name.trim(),
        client_email: formData.client_email.trim(),
        client_tax_id: formData.client_tax_id.trim(),
        client_address: formData.client_address.trim(),
        line_description: formData.line_description.trim(),
        tax_percent: Number.isFinite(tax) ? tax : 21,
        due_day: formData.due_day ? Number(formData.due_day) : null,
        next_issue_date: formData.next_issue_date || null,
      }
      if (hasOwnAmount) body.base_amount = base

      const res = await fetch(`/api/invoices/recurring/${template.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo guardar')
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
      <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-4xl flex-col px-6 py-8">
            <div className="mb-6 flex items-center gap-4">
              <Link href="/invoices/recurring">
                <Button variant="ghost" size="icon" type="button">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Editar factura recurrente</h1>
                <p className="text-sm text-gray-600">
                  Los cambios valen para las próximas facturas. Las que ya se crearon se quedan como están.
                </p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <Card className="border border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Datos de la mensualidad</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    {template.source_invoice_number && !template.owns_data ? (
                      <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                        Ahora se copia de {template.source_invoice_number}. Si escribes concepto e importe, las
                        siguientes se harán con estos datos.
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="client_name">Cliente *</Label>
                      <Input
                        id="client_name"
                        value={formData.client_name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, client_name: e.target.value }))}
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
                        onChange={(e) => setFormData((prev) => ({ ...prev, line_description: e.target.value }))}
                        placeholder="Mantenimiento"
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="next_issue_date">Próxima factura *</Label>
                        <Input
                          id="next_issue_date"
                          type="date"
                          value={formData.next_issue_date}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, next_issue_date: e.target.value }))
                          }
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
                    <div className="space-y-2">
                      <Label htmlFor="name">Nombre interno</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        disabled={loading}
                      />
                    </div>
                    {error && (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {error}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border border-gray-200 shadow-sm">
                <CardHeader>
                  <CardTitle>Próxima factura</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {conceptPreview ? (
                    <p className="font-medium text-gray-900">{conceptPreview}</p>
                  ) : (
                    <p className="text-gray-500">Escribe el concepto y el día para ver cómo quedará.</p>
                  )}
                  {previewTotal != null ? (
                    <p className="text-gray-600">Importe con IVA: {formatCurrency(previewTotal)}.</p>
                  ) : null}
                  <p className="text-gray-600">
                    Después se repite cada mes, el mismo día. El número de factura sigue siendo el siguiente BUF que toque.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        <div className="shrink-0 border-t border-gray-200 bg-white px-6 py-3">
          <div className="mx-auto flex w-full max-w-4xl justify-end gap-3">
            <Link href="/invoices/recurring">
              <Button type="button" variant="outline" disabled={loading}>
                Cancelar
              </Button>
            </Link>
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </form>
    </FullScreenLayout>
  )
}
