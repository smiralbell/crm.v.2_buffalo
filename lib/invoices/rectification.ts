import { prisma } from '@/lib/prisma'
import { asDocumentType } from '@/lib/invoices/document'

/** Comprueba la factura original. Solo lee: no modifica esa fila. */
export async function rectificationTargetError(
  rectifiesId: number,
  selfId?: number
): Promise<string | null> {
  if (selfId != null && rectifiesId === selfId) {
    return 'Una factura no puede rectificarse a sí misma'
  }

  const original = await prisma.invoice.findUnique({
    where: { id: rectifiesId },
    select: {
      id: true,
      deleted_at: true,
      status: true,
      document_type: true,
      invoice_source: true,
    },
  })

  if (!original || original.deleted_at) {
    return 'La factura original no existe'
  }
  if (original.invoice_source === 'developer') {
    return 'No se rectifica una factura de developer desde aquí'
  }
  if (asDocumentType(original.document_type) !== 'invoice') {
    return 'Solo se puede rectificar una factura normal ya emitida'
  }
  if (original.status !== 'sent') {
    return 'Solo se puede rectificar una factura ya emitida. El borrador se edita directamente.'
  }
  return null
}
