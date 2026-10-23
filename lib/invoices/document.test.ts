import { describe, expect, it } from 'vitest'
import {
  defaultRectificationObservations,
  normalizeInvoiceDocument,
  numberMatchesDocumentType,
  pdfDocumentFields,
  resolvePaymentLines,
} from './document'

const kreeditLines = [
  { description: 'Integración flujo de documentación', quantity: 1, price: -490, tax: 21 },
  { description: 'Integración Dropbox', quantity: 1, price: -150, tax: 21 },
]

describe('facturas rectificativas', () => {
  it('calcula la anulación de Kreedit en negativo', () => {
    const result = normalizeInvoiceDocument({
      document_type: 'credit_note',
      rectifies_invoice_id: 110,
      rectification_reason: 'Anulación acordada de los servicios facturados.',
      services: kreeditLines,
      status: 'sent',
      show_payment_info: false,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.subtotal).toBe(-640)
    expect(result.value.iva).toBe(-134.4)
    expect(result.value.total).toBe(-774.4)
    expect(result.value.show_payment_info).toBe(false)
  })

  it('admite una rectificativa parcial en positivo', () => {
    const result = normalizeInvoiceDocument({
      document_type: 'credit_note',
      rectifies_invoice_id: 12,
      rectification_reason: 'Diferencia de precio acordada',
      services: [{ description: 'Ajuste', quantity: 1, price: 50, tax: 21 }],
      status: 'sent',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.total).toBe(60.5)
  })

  it('no deja guardar un total negativo como factura normal', () => {
    const result = normalizeInvoiceDocument({
      document_type: 'invoice',
      services: kreeditLines,
      status: 'draft',
    })
    expect(result.ok).toBe(false)
  })

  it('permite un descuento en una factura si el total sigue siendo positivo', () => {
    const result = normalizeInvoiceDocument({
      document_type: 'invoice',
      services: [
        { description: 'Servicio', quantity: 1, price: 100, tax: 21 },
        { description: 'Descuento', quantity: 1, price: -10, tax: 21 },
      ],
      status: 'draft',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.subtotal).toBe(90)
    expect(result.value.total).toBe(108.9)
  })

  it('exige factura original y motivo al emitir la rectificativa', () => {
    const missing = normalizeInvoiceDocument({
      document_type: 'credit_note',
      services: kreeditLines,
      status: 'sent',
    })
    expect(missing.ok).toBe(false)

    const noReason = normalizeInvoiceDocument({
      document_type: 'credit_note',
      rectifies_invoice_id: 1,
      services: kreeditLines,
      status: 'sent',
    })
    expect(noReason.ok).toBe(false)
  })

  it('separa la serie R de la serie BUF', () => {
    expect(numberMatchesDocumentType('R-2026-001', 'credit_note')).toBe(true)
    expect(numberMatchesDocumentType('BUF-2026-00110', 'credit_note')).toBe(false)
    expect(numberMatchesDocumentType('BUF-2026-00110', 'invoice')).toBe(true)
    expect(numberMatchesDocumentType('PF-2026-001', 'proforma')).toBe(true)
    expect(numberMatchesDocumentType('PRE-2026-001', 'quote')).toBe(true)
    expect(numberMatchesDocumentType('PF-2026-001', 'quote')).toBe(false)
  })

  it('mantiene el bloque de pago de Buffalo si no se personaliza y lo oculta si se pide', () => {
    expect(resolvePaymentLines({ show_payment_info: true })).toEqual([
      'Transferencia bancaria Banco CaixaBank',
      'Nombre: BUFFALO IA Global Digital Solutions',
      'Número de cuenta: ES16 2100 0795 1802 0064 1987',
    ])
    expect(resolvePaymentLines({ show_payment_info: false })).toEqual([])
  })

  it('pinta título, referencia y observaciones fuera de los datos del cliente', () => {
    const fields = pdfDocumentFields({
      document_type: 'credit_note',
      observations: defaultRectificationObservations('BUF-2026-00110', '19/02/2026'),
      rectification_reason: 'Anulación acordada de los servicios facturados.',
      rectifiesNumber: 'BUF-2026-00110',
      rectifiesDateLabel: '19/02/2026',
      show_payment_info: false,
    })
    expect(fields.documentTitle).toBe('FACTURA RECTIFICATIVA')
    expect(fields.rectifiesLabel).toBe('Rectifica la factura BUF-2026-00110 del 19/02/2026')
    expect(fields.observations).toContain('BUF-2026-00110')
    expect(fields.showPaymentInfo).toBe(false)
  })
})
