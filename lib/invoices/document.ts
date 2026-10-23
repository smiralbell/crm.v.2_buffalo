export const DOCUMENT_TYPES = ['invoice', 'credit_note', 'proforma', 'quote'] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DEFAULT_TITLES: Record<DocumentType, string> = {
  invoice: 'FACTURA',
  credit_note: 'FACTURA RECTIFICATIVA',
  proforma: 'FACTURA PROFORMA',
  quote: 'PRESUPUESTO',
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice: 'Factura',
  credit_note: 'Factura rectificativa',
  proforma: 'Factura proforma',
  quote: 'Presupuesto',
}

/** Serie propia. BUF no se toca: las facturas ya emitidas siguen en BUF-YYYY-NNNNN. */
export function seriesForDocumentType(type: DocumentType): { prefix: string; pad: number } {
  switch (type) {
    case 'credit_note':
      return { prefix: 'R', pad: 3 }
    case 'proforma':
      return { prefix: 'PF', pad: 3 }
    case 'quote':
      return { prefix: 'PRE', pad: 3 }
    default:
      return { prefix: 'BUF', pad: 5 }
  }
}

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value)
}

export function asDocumentType(value: unknown): DocumentType {
  return isDocumentType(value) ? value : 'invoice'
}

/** Proforma y presupuesto no son factura fiscal: no entran en los totales de ingresos. */
export function countsInFiscalTotals(type: DocumentType): boolean {
  return type === 'invoice' || type === 'credit_note'
}

export const BUFFALO_PAYMENT = {
  payment_method: 'Transferencia bancaria',
  bank_name: 'CaixaBank',
  bank_account_holder: 'BUFFALO IA Global Digital Solutions',
  iban: 'ES16 2100 0795 1802 0064 1987',
}

export function asAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function resolveDocumentTitle(type: DocumentType, custom?: string | null): string {
  const trimmed = custom?.trim()
  if (trimmed) return trimmed.slice(0, 80)
  return DEFAULT_TITLES[type]
}

export function numberMatchesDocumentType(invoiceNumber: string, type: DocumentType): boolean {
  const { prefix } = seriesForDocumentType(type)
  const re = new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`)
  return re.test(invoiceNumber.trim())
}

export type ServiceInput = {
  description: string
  quantity: number
  price: number
  tax: number
}

export type NormalizedService = ServiceInput & { total: number }

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function paymentOrNull(value: string | null | undefined, fallback: string): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === fallback) return null
  return trimmed
}

export function isIssuedStatus(status: string | null | undefined): boolean {
  return status === 'sent' || status === 'cancelled'
}

export function normalizeInvoiceDocument(input: {
  document_type?: string | null
  document_title?: string | null
  observations?: string | null
  rectifies_invoice_id?: number | null
  rectification_reason?: string | null
  show_payment_info?: boolean | null
  payment_method?: string | null
  bank_name?: string | null
  bank_account_holder?: string | null
  iban?: string | null
  payment_instructions?: string | null
  services: ServiceInput[]
  status?: 'draft' | 'sent' | 'cancelled'
}):
  | { ok: false; error: string }
  | {
      ok: true
      value: {
        document_type: DocumentType
        document_title: string | null
        observations: string | null
        rectifies_invoice_id: number | null
        rectification_reason: string | null
        show_payment_info: boolean
        payment_method: string | null
        bank_name: string | null
        bank_account_holder: string | null
        iban: string | null
        payment_instructions: string | null
        services: NormalizedService[]
        subtotal: number
        iva: number
        total: number
        status: 'draft' | 'sent' | 'cancelled'
      }
    } {
  const documentType = asDocumentType(input.document_type)
  const status = input.status || 'draft'
  const services = input.services || []

  if (services.length < 1) {
    return { ok: false, error: 'Debe haber al menos un concepto' }
  }

  let subtotal = 0
  let iva = 0
  const normalized: NormalizedService[] = []

  for (const service of services) {
    const description = service.description?.trim() || ''
    const quantity = Number(service.quantity)
    const price = Number(service.price)
    const tax = Number(service.tax)

    if (!description) {
      return { ok: false, error: 'Todos los conceptos deben tener descripción' }
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        ok: false,
        error: 'La cantidad tiene que ser mayor que 0. Para un importe negativo, pon el precio en negativo.',
      }
    }
    if (!Number.isFinite(price)) {
      return { ok: false, error: 'El precio no es un importe válido' }
    }
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
      return { ok: false, error: 'El IVA tiene que estar entre 0 y 100' }
    }
    if (status === 'sent' && price === 0) {
      return { ok: false, error: 'Un documento emitido no puede llevar un precio a 0' }
    }

    const base = roundMoney(quantity * price)
    const taxAmount = roundMoney(base * (tax / 100))
    subtotal += base
    iva += taxAmount
    normalized.push({
      description,
      quantity,
      price,
      tax,
      total: roundMoney(base + taxAmount),
    })
  }

  subtotal = roundMoney(subtotal)
  iva = roundMoney(iva)
  const total = roundMoney(subtotal + iva)

  if (documentType === 'credit_note') {
    if (input.rectifies_invoice_id == null || !Number.isInteger(input.rectifies_invoice_id)) {
      return { ok: false, error: 'Una factura rectificativa tiene que indicar la factura original' }
    }
    if (status === 'sent') {
      const reason = input.rectification_reason?.trim() || ''
      if (reason.length < 3) {
        return { ok: false, error: 'Indica el motivo de la rectificación antes de emitirla' }
      }
      if (total === 0) {
        return { ok: false, error: 'Una rectificativa emitida no puede tener total 0' }
      }
    }
  } else if (total < 0) {
    return {
      ok: false,
      error: 'Un total negativo tiene que ser una factura rectificativa, con su propia numeración.',
    }
  } else if (status === 'sent' && total <= 0) {
    return { ok: false, error: 'El total de un documento emitido tiene que ser mayor que 0' }
  }

  const customTitle = input.document_title?.trim() || ''
  const documentTitle =
    customTitle && customTitle.toUpperCase() !== DEFAULT_TITLES[documentType] ? customTitle.slice(0, 80) : null

  return {
    ok: true,
    value: {
      document_type: documentType,
      document_title: documentTitle,
      observations: blankToNull(input.observations),
      rectifies_invoice_id: documentType === 'credit_note' ? input.rectifies_invoice_id ?? null : null,
      rectification_reason:
        documentType === 'credit_note' ? blankToNull(input.rectification_reason) : null,
      show_payment_info: input.show_payment_info !== false,
      payment_method: paymentOrNull(input.payment_method, BUFFALO_PAYMENT.payment_method),
      bank_name: paymentOrNull(input.bank_name, BUFFALO_PAYMENT.bank_name),
      bank_account_holder: paymentOrNull(
        input.bank_account_holder,
        BUFFALO_PAYMENT.bank_account_holder
      ),
      iban: paymentOrNull(input.iban, BUFFALO_PAYMENT.iban),
      payment_instructions: blankToNull(input.payment_instructions),
      services: normalized,
      subtotal,
      iva,
      total,
      status,
    },
  }
}

export function legacyPaymentLines(): string[] {
  return [
    'Transferencia bancaria Banco CaixaBank',
    `Nombre: ${BUFFALO_PAYMENT.bank_account_holder}`,
    `Número de cuenta: ${BUFFALO_PAYMENT.iban}`,
  ]
}

export function resolvePaymentLines(input: {
  show_payment_info?: boolean | null
  payment_method?: string | null
  bank_name?: string | null
  bank_account_holder?: string | null
  iban?: string | null
  payment_instructions?: string | null
}): string[] {
  if (input.show_payment_info === false) return []
  const method = input.payment_method?.trim() || ''
  const bank = input.bank_name?.trim() || ''
  const holder = input.bank_account_holder?.trim() || ''
  const iban = input.iban?.trim() || ''
  const instructions = input.payment_instructions?.trim() || ''
  if (!method && !bank && !holder && !iban && !instructions) return legacyPaymentLines()

  const lines = [
    method || BUFFALO_PAYMENT.payment_method,
    `Banco ${bank || BUFFALO_PAYMENT.bank_name}`,
    `Nombre: ${holder || BUFFALO_PAYMENT.bank_account_holder}`,
    `Número de cuenta: ${iban || BUFFALO_PAYMENT.iban}`,
  ]
  if (instructions) lines.push(instructions)
  return lines
}

export function pdfDocumentFields(input: {
  document_type?: string | null
  document_title?: string | null
  observations?: string | null
  rectification_reason?: string | null
  show_payment_info?: boolean | null
  payment_method?: string | null
  bank_name?: string | null
  bank_account_holder?: string | null
  iban?: string | null
  payment_instructions?: string | null
  rectifiesNumber?: string | null
  rectifiesDateLabel?: string | null
}): {
  documentTitle: string
  observations?: string
  rectificationReason?: string
  rectifiesLabel?: string
  showPaymentInfo: boolean
  paymentLines: string[]
} {
  const type = asDocumentType(input.document_type)
  const observations = input.observations?.trim() || ''
  const reason = input.rectification_reason?.trim() || ''
  const number = input.rectifiesNumber?.trim() || ''
  const dateLabel = input.rectifiesDateLabel?.trim() || ''
  let rectifiesLabel: string | undefined
  if (type === 'credit_note' && number) {
    rectifiesLabel = dateLabel
      ? `Rectifica la factura ${number} del ${dateLabel}`
      : `Rectifica la factura ${number}`
  }

  return {
    documentTitle: resolveDocumentTitle(type, input.document_title),
    observations: observations || undefined,
    rectificationReason: type === 'credit_note' && reason ? reason : undefined,
    rectifiesLabel,
    showPaymentInfo: input.show_payment_info !== false,
    paymentLines: resolvePaymentLines(input),
  }
}

export function defaultRectificationReason(): string {
  return 'Anulación acordada de los servicios facturados.'
}

export function defaultRectificationObservations(invoiceNumber: string, dateLabel: string): string {
  return `Factura rectificativa de la factura ${invoiceNumber}, de fecha ${dateLabel}, por anulación acordada de los servicios facturados.`
}
