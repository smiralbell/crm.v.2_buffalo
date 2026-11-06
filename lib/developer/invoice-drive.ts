import { Readable } from 'stream'
import { prisma } from '@/lib/prisma'
import { getAuthorizedDriveClient } from '@/lib/integrations/google/drive-auth'
import { uploadInvoiceToDrive } from '@/lib/integrations/google/drive-invoices'

/**
 * Las facturas que suben developers y gente de marketing son un gasto para Buffalo:
 * van a Drive en FACTURAS/GASTOS/<YYYY-MM>, con el mes de la fecha de la factura.
 * Drive guarda el original; el CRM guarda el id y el enlace en la propia factura.
 */

export type DevInvoiceDriveResult =
  | { ok: true; fileId: string; webViewLink: string | null; yearMonth: string }
  | { ok: false; error: string }

type InvoiceDriveRow = {
  invoice_number: string
  issue_date: Date
  pdf_drive_file_id: string | null
  developer_name: string | null
}

/** YYYY-MM de la fecha de la factura (columna DATE, se lee en UTC). */
export function invoiceYearMonth(issueDate: Date): string {
  return issueDate.toISOString().substring(0, 7)
}

export function devInvoiceDriveFileName(invoiceNumber: string, developerName: string | null): string {
  const name = (developerName || '').trim()
  return name ? `${invoiceNumber} - ${name}.pdf` : `${invoiceNumber}.pdf`
}

function isNotFound(err: unknown): boolean {
  const code = (err as { code?: number | string })?.code
  return code === 404 || code === '404'
}

async function loadInvoice(invoiceId: number): Promise<InvoiceDriveRow | null> {
  const rows = await prisma.$queryRaw<InvoiceDriveRow[]>`
    SELECT i.invoice_number, i.issue_date, i.pdf_drive_file_id, u.name AS developer_name
    FROM invoices i
    LEFT JOIN crm_users u ON u.id = i.crm_user_id
    WHERE i.id = ${invoiceId}
      AND i.deleted_at IS NULL
      AND i.invoice_source = 'developer'
    LIMIT 1
  `
  return rows[0] ?? null
}

/** Reemplaza el contenido de un archivo que ya está en Drive (mismo id y enlace). */
async function replaceDriveFile(
  fileId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ fileId: string; webViewLink: string | null } | null> {
  const drive = await getAuthorizedDriveClient()
  try {
    const updated = await drive.files.update({
      fileId,
      requestBody: { name: fileName },
      media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
      fields: 'id,webViewLink,trashed',
      supportsAllDrives: true,
    })
    if (!updated.data.id || updated.data.trashed) return null
    return { fileId: updated.data.id, webViewLink: updated.data.webViewLink ?? null }
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

/**
 * Sube (o reemplaza) el PDF de una factura de developer en Drive y lo apunta en la factura.
 * No lanza: devuelve ok:false con el motivo, para que la subida al CRM no se pierda.
 */
export async function syncDeveloperInvoiceToDrive(
  invoiceId: number,
  buffer: Buffer
): Promise<DevInvoiceDriveResult> {
  try {
    const invoice = await loadInvoice(invoiceId)
    if (!invoice) return { ok: false, error: 'Factura no encontrada' }

    const yearMonth = invoiceYearMonth(invoice.issue_date)
    const fileName = devInvoiceDriveFileName(invoice.invoice_number, invoice.developer_name)

    let result = invoice.pdf_drive_file_id
      ? await replaceDriveFile(invoice.pdf_drive_file_id, fileName, buffer)
      : null

    if (!result) {
      const uploaded = await uploadInvoiceToDrive({
        tipo: 'gastos',
        yearMonth,
        fileName,
        buffer,
        mimeType: 'application/pdf',
      })
      result = { fileId: uploaded.fileId, webViewLink: uploaded.webViewLink ?? null }
    }

    await prisma.$executeRaw`
      UPDATE invoices
      SET pdf_drive_file_id = ${result.fileId},
          pdf_drive_url = ${result.webViewLink},
          sent_to_drive = TRUE,
          updated_at = NOW()
      WHERE id = ${invoiceId}
    `
    return { ok: true, fileId: result.fileId, webViewLink: result.webViewLink, yearMonth }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error subiendo a Drive'
    console.error('[developer/invoice-drive] sync', invoiceId, message)
    return { ok: false, error: message }
  }
}

/** Descarga el PDF desde Drive (cuando no está en el disco del servidor). */
export async function downloadDriveFile(fileId: string): Promise<Buffer | null> {
  try {
    const drive = await getAuthorizedDriveClient()
    const res = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    )
    return Buffer.from(res.data as ArrayBuffer)
  } catch (err) {
    console.error('[developer/invoice-drive] download', fileId, err instanceof Error ? err.message : err)
    return null
  }
}

/** Manda el archivo a la papelera de Drive (se puede recuperar desde Drive). */
export async function trashDriveFile(fileId: string | null): Promise<void> {
  if (!fileId) return
  try {
    const drive = await getAuthorizedDriveClient()
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    })
  } catch (err) {
    if (!isNotFound(err)) {
      console.error('[developer/invoice-drive] trash', fileId, err instanceof Error ? err.message : err)
    }
  }
}
