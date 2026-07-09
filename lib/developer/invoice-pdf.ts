import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'

export const DEV_INVOICE_UPLOAD_DIR = join(process.cwd(), 'uploads', 'developer-invoices')

export async function ensureDevInvoiceDir(userId: number): Promise<string> {
  const dir = join(DEV_INVOICE_UPLOAD_DIR, String(userId))
  await mkdir(dir, { recursive: true })
  return dir
}

export function devInvoicePdfRelativePath(userId: number, invoiceId: number): string {
  return `${userId}/${invoiceId}.pdf`
}

export async function saveDevInvoicePdf(
  userId: number,
  invoiceId: number,
  buffer: Buffer
): Promise<string> {
  await ensureDevInvoiceDir(userId)
  const rel = devInvoicePdfRelativePath(userId, invoiceId)
  const abs = join(DEV_INVOICE_UPLOAD_DIR, rel)
  await writeFile(abs, buffer)
  return rel
}

export async function readDevInvoicePdf(relativePath: string): Promise<Buffer> {
  return readFile(join(DEV_INVOICE_UPLOAD_DIR, relativePath))
}

export async function removeDevInvoicePdf(relativePath: string | null): Promise<void> {
  if (!relativePath) return
  try {
    await unlink(join(DEV_INVOICE_UPLOAD_DIR, relativePath))
  } catch {
    // archivo ya eliminado
  }
}
