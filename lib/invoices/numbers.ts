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
 * Libera el slot único si solo lo ocupan facturas soft-deleted.
 * (deleted_at IS NOT NULL pero invoice_number sigue en unique).
 */
export async function releaseSoftDeletedInvoiceNumber(invoiceNumber: string): Promise<number> {
  const blockers = await prisma.invoice.findMany({
    where: {
      invoice_number: invoiceNumber,
      deleted_at: { not: null },
    },
    select: { id: true },
  })
  if (blockers.length === 0) return 0

  let released = 0
  for (const row of blockers) {
    const tombstone = `${invoiceNumber}__deleted_${row.id}_${Date.now().toString(36)}`
    await prisma.invoice.update({
      where: { id: row.id },
      data: { invoice_number: tombstone.slice(0, 80) },
    })
    released++
  }
  return released
}

/**
 * Siguiente número BUF del año: max(correlativo) + 1.
 * Mira facturas activas Y soft-deleted con patrón limpio (no __deleted_),
 * para no proponer un número que falle por unique constraint.
 */
export async function getNextBufInvoiceNumber(
  year: number = new Date().getFullYear()
): Promise<string> {
  const prefix = `BUF-${year}-`
  const rows = await prisma.invoice.findMany({
    where: {
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

  // Avanza hasta encontrar un número libre a nivel unique (tras liberar soft-deleted)
  let seq = maxSeq + 1
  for (let i = 0; i < 200; i++) {
    const candidate = formatBufInvoiceNumber(year, seq)
    await releaseSoftDeletedInvoiceNumber(candidate)
    const taken = await prisma.invoice.findFirst({
      where: { invoice_number: candidate },
      select: { id: true },
    })
    if (!taken) return candidate
    seq++
  }

  return formatBufInvoiceNumber(year, seq)
}

/**
 * True si el número está libre para una factura activa.
 * Si solo lo bloquean soft-deleted, los renombra y deja el número libre.
 */
export async function ensureInvoiceNumberAvailable(
  invoiceNumber: string,
  exceptInvoiceId?: number
): Promise<{ ok: true } | { ok: false; reason: 'taken' }> {
  await releaseSoftDeletedInvoiceNumber(invoiceNumber)

  const existing = await prisma.invoice.findFirst({
    where: {
      invoice_number: invoiceNumber,
      ...(exceptInvoiceId != null ? { id: { not: exceptInvoiceId } } : {}),
    },
    select: { id: true, deleted_at: true },
  })

  if (!existing) return { ok: true }
  if (existing.deleted_at) {
    // Por si quedó alguno: reintentar liberar
    await releaseSoftDeletedInvoiceNumber(invoiceNumber)
    const again = await prisma.invoice.findFirst({
      where: {
        invoice_number: invoiceNumber,
        ...(exceptInvoiceId != null ? { id: { not: exceptInvoiceId } } : {}),
      },
      select: { id: true },
    })
    if (!again) return { ok: true }
  }
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

/** Renombra leftovers soft-deleted que aún tienen número BUF limpio (migración one-shot). */
export async function cleanupSoftDeletedBufNumbers(): Promise<number> {
  const rows = await prisma.invoice.findMany({
    where: {
      deleted_at: { not: null },
      invoice_number: { startsWith: 'BUF-' },
    },
    select: { id: true, invoice_number: true },
  })

  let fixed = 0
  for (const row of rows) {
    if (!BUF_NUMBER_RE.test(row.invoice_number)) continue
    const tombstone = `${row.invoice_number}__deleted_${row.id}_${Date.now().toString(36)}`
    await prisma.invoice.update({
      where: { id: row.id },
      data: { invoice_number: tombstone.slice(0, 80) },
    })
    fixed++
  }
  return fixed
}
