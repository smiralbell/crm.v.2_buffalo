import { prisma } from '@/lib/prisma'

/** Dígitos del correlativo: BUF-2026-00120 */
export const INVOICE_NUMBER_PAD = 5

const BUF_NUMBER_RE = /^BUF-(\d{4})-(\d+)$/

export function formatBufInvoiceNumber(year: number, seq: number): string {
  return `BUF-${year}-${String(seq).padStart(INVOICE_NUMBER_PAD, '0')}`
}

/** Extrae el correlativo numérico de un BUF-YYYY-NNNN…; null si no encaja. */
export function parseBufInvoiceSeq(invoiceNumber: string): { year: number; seq: number } | null {
  const match = BUF_NUMBER_RE.exec(invoiceNumber.trim())
  if (!match) return null
  const year = Number(match[1])
  const seq = Number(match[2])
  if (!Number.isFinite(year) || !Number.isFinite(seq)) return null
  return { year, seq }
}

/**
 * Siguiente número BUF del año: max(correlativo existente) + 1.
 * Solo mira facturas vivas con patrón exacto BUF-YYYY-dígitos (no __deleted_).
 */
export async function getNextBufInvoiceNumber(
  year: number = new Date().getFullYear()
): Promise<string> {
  const prefix = `BUF-${year}-`
  const rows = await prisma.invoice.findMany({
    where: {
      deleted_at: null,
      invoice_number: { startsWith: prefix },
    },
    select: { invoice_number: true },
  })

  let maxSeq = 0
  for (const row of rows) {
    const parsed = parseBufInvoiceSeq(row.invoice_number)
    if (parsed && parsed.year === year && parsed.seq > maxSeq) {
      maxSeq = parsed.seq
    }
  }

  return formatBufInvoiceNumber(year, maxSeq + 1)
}

/** True si el número está libre (no hay factura activa con ese invoice_number). */
export async function ensureInvoiceNumberAvailable(
  invoiceNumber: string,
  exceptInvoiceId?: number
): Promise<{ ok: true } | { ok: false; reason: 'taken' }> {
  const existing = await prisma.invoice.findFirst({
    where: {
      invoice_number: invoiceNumber,
      deleted_at: null,
      ...(exceptInvoiceId != null ? { id: { not: exceptInvoiceId } } : {}),
    },
    select: { id: true },
  })

  if (!existing) return { ok: true }
  return { ok: false, reason: 'taken' }
}

/**
 * Elimina la factura de verdad. Limpia FKs de recurrentes antes.
 * Así el número queda libre y el correlativo se recalcula desde las que quedan.
 */
export async function hardDeleteInvoice(invoiceId: number) {
  await prisma.$executeRaw`
    UPDATE recurring_invoices
    SET last_generated_invoice_id = NULL
    WHERE last_generated_invoice_id = ${invoiceId}
  `
  await prisma.$executeRaw`
    DELETE FROM recurring_invoices
    WHERE source_invoice_id = ${invoiceId}
  `
  await prisma.invoice.delete({
    where: { id: invoiceId },
  })
}
