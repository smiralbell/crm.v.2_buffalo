import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  BUFFALO_PAYMENT,
  DEFAULT_TITLES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from '@/lib/invoices/document'

export type InvoiceOriginalOption = {
  id: number
  invoice_number: string
  client_name: string
  issue_date: string
  total: number
}

type DocumentFieldValues = {
  document_type: DocumentType
  document_title: string
  observations: string
  rectifies_invoice_id: number | null
  rectification_reason: string
  show_payment_info: boolean
  payment_method: string
  bank_name: string
  bank_account_holder: string
  iban: string
  payment_instructions: string
}

export default function InvoiceDocumentFields({
  values,
  originals,
  disabled,
  onChange,
}: {
  values: DocumentFieldValues
  originals: InvoiceOriginalOption[]
  disabled?: boolean
  onChange: (patch: Partial<DocumentFieldValues>) => void
}) {
  const titlePlaceholder = DEFAULT_TITLES[values.document_type]

  return (
    <>
      <Card className="rounded-2xl border border-zinc-200 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Documento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="document_type">Tipo</Label>
            <select
              id="document_type"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2"
              value={values.document_type}
              disabled={disabled}
              onChange={(e) => onChange({ document_type: e.target.value as DocumentType })}
            >
              {(Object.keys(DOCUMENT_TYPE_LABELS) as DocumentType[]).map((type) => (
                <option key={type} value={type}>
                  {DOCUMENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500">
              El título del PDF sale del tipo. Si escribes otro, solo cambia el texto visible.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="document_title">Título del documento</Label>
            <Input
              id="document_title"
              value={values.document_title}
              placeholder={titlePlaceholder}
              disabled={disabled}
              maxLength={80}
              onChange={(e) => onChange({ document_title: e.target.value })}
            />
          </div>

          {values.document_type === 'credit_note' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="rectifies_invoice_id">Factura que se rectifica</Label>
                <select
                  id="rectifies_invoice_id"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2"
                  value={values.rectifies_invoice_id ?? ''}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange({
                      rectifies_invoice_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">Selecciona la factura original</option>
                  {originals.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoice_number} · {invoice.client_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rectification_reason">Motivo de la rectificación</Label>
                <Textarea
                  id="rectification_reason"
                  value={values.rectification_reason}
                  disabled={disabled}
                  rows={2}
                  onChange={(e) => onChange({ rectification_reason: e.target.value })}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="observations">Observaciones</Label>
            <Textarea
              id="observations"
              value={values.observations}
              disabled={disabled}
              rows={4}
              placeholder="Texto aparte de los datos del cliente. Sale en su propia sección del PDF."
              onChange={(e) => onChange({ observations: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-zinc-200 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Información de pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={values.show_payment_info}
              disabled={disabled}
              onChange={(e) => onChange({ show_payment_info: e.target.checked })}
            />
            Mostrar información de pago en el PDF
          </label>
          {values.show_payment_info && (
            <>
              <div className="space-y-2">
                <Label htmlFor="payment_method">Método de pago</Label>
                <Input
                  id="payment_method"
                  value={values.payment_method}
                  placeholder={BUFFALO_PAYMENT.payment_method}
                  disabled={disabled}
                  onChange={(e) => onChange({ payment_method: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_name">Banco</Label>
                <Input
                  id="bank_name"
                  value={values.bank_name}
                  placeholder={BUFFALO_PAYMENT.bank_name}
                  disabled={disabled}
                  onChange={(e) => onChange({ bank_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank_account_holder">Titular</Label>
                <Input
                  id="bank_account_holder"
                  value={values.bank_account_holder}
                  placeholder={BUFFALO_PAYMENT.bank_account_holder}
                  disabled={disabled}
                  onChange={(e) => onChange({ bank_account_holder: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="iban">IBAN</Label>
                <Input
                  id="iban"
                  value={values.iban}
                  placeholder={BUFFALO_PAYMENT.iban}
                  disabled={disabled}
                  onChange={(e) => onChange({ iban: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_instructions">Instrucciones adicionales</Label>
                <Textarea
                  id="payment_instructions"
                  value={values.payment_instructions}
                  disabled={disabled}
                  rows={2}
                  onChange={(e) => onChange({ payment_instructions: e.target.value })}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
