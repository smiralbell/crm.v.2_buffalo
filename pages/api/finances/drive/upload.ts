/**
 * POST /api/finances/drive/upload
 * Sube un PDF a Drive (gastos | emitidas) con la misma lógica que el webhook n8n.
 * multipart: pdf|file + fields tipo, year_month, invoice_number (opcional filename)
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import { requireAuthAPI } from '@/lib/auth'
import {
  uploadInvoiceToDrive,
  type DriveInvoiceTipo,
} from '@/lib/integrations/google/drive-invoices'

export const config = {
  api: { bodyParser: false },
}

function parseForm(req: NextApiRequest) {
  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    const form = formidable({ multiples: false, maxFileSize: 25 * 1024 * 1024 })
    form.parse(req, (err, fields, files) => {
      if (err) reject(err)
      else resolve({ fields, files })
    })
  })
}

function fieldValue(fields: formidable.Fields, key: string): string {
  const raw = fields[key]
  if (Array.isArray(raw)) return String(raw[0] ?? '').trim()
  return String(raw ?? '').trim()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return res.status(401).json({ error: 'No autorizado' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const { fields, files } = await parseForm(req)
    const tipoRaw = fieldValue(fields, 'tipo') || fieldValue(fields, 'type')
    const tipo: DriveInvoiceTipo =
      tipoRaw === 'emitida' || tipoRaw === 'emitidas' ? 'emitidas' : 'gastos'

    const yearMonth =
      fieldValue(fields, 'year_month') ||
      fieldValue(fields, 'yearMonth') ||
      new Date().toISOString().substring(0, 7)

    const invoiceNumber =
      fieldValue(fields, 'invoice_number') ||
      fieldValue(fields, 'concept') ||
      `doc_${Date.now()}`

    const uploaded = files.pdf || files.file
    const fileEntry = Array.isArray(uploaded) ? uploaded[0] : uploaded
    if (!fileEntry?.filepath) {
      return res.status(400).json({ error: 'Falta el archivo pdf' })
    }

    const buffer = await fs.promises.readFile(fileEntry.filepath)
    const mimeType = fileEntry.mimetype || 'application/pdf'
    const fileName =
      fieldValue(fields, 'pdf_filename') ||
      fileEntry.originalFilename ||
      `${invoiceNumber}.pdf`

    const result = await uploadInvoiceToDrive({
      tipo,
      yearMonth,
      fileName: fileName.includes('.') ? fileName : `${invoiceNumber}.pdf`,
      buffer,
      mimeType,
    })

    return res.status(200).json({
      ok: true,
      success: true,
      ...result,
      message: 'Documento subido a Google Drive',
    })
  } catch (error) {
    console.error('[finances/drive/upload]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error subiendo a Drive',
    })
  }
}
