import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import { createPlaceholderNotePdfBuffer } from '@/lib/pdf/placeholder-note-pdf'
import { uploadInvoiceToDrive } from '@/lib/integrations/google/drive-invoices'

export const config = {
  api: { bodyParser: false },
}

function parseForm(req: NextApiRequest) {
  return new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
    const form = formidable({ multiples: false })
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

  const bankTransactionId = req.query.id
  if (typeof bankTransactionId !== 'string' || !bankTransactionId) {
    return res.status(400).json({ error: 'ID de cobro inválido' })
  }

  try {
    const { fields, files } = await parseForm(req)
    const note = fieldValue(fields, 'note')
    const uploaded = files.file || files.pdf
    const fileEntry = Array.isArray(uploaded) ? uploaded[0] : uploaded

    const tx = await query<{
      id: string
      date: string | Date
      amount: number
      description: string
    }>(
      `SELECT id, date, amount, description
         FROM bank_transactions
        WHERE id = $1 AND amount > 0
        LIMIT 1`,
      [bankTransactionId]
    )

    const row = tx.rows[0]
    if (!row) {
      return res.status(404).json({ error: 'Cobro no encontrado' })
    }

    const dateStr =
      row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)
    const yearMonth = dateStr.slice(0, 7)
    const concept = row.description || `COBRO-${bankTransactionId.slice(0, 8)}`

    let fileBuffer: Buffer
    let fileName: string
    let contentType: string

    if (fileEntry?.filepath) {
      fileBuffer = await fs.promises.readFile(fileEntry.filepath)
      fileName = fileEntry.originalFilename || `cobro_${dateStr}.pdf`
      contentType = fileEntry.mimetype || 'application/pdf'
    } else {
      fileBuffer = createPlaceholderNotePdfBuffer(note)
      fileName = `sin_factura_crm_${concept.replace(/\s+/g, '_').slice(0, 40)}.pdf`
      contentType = 'application/pdf'
    }

    const driveResult = await uploadInvoiceToDrive({
      tipo: 'emitidas',
      yearMonth,
      fileName,
      buffer: fileBuffer,
      mimeType: contentType,
    })

    await query(`UPDATE bank_transactions SET is_reconciled = true WHERE id = $1`, [
      bankTransactionId,
    ])

    return res.status(200).json({
      success: true,
      message: 'Cobro conciliado y documento subido a Google Drive',
      drive: driveResult,
    })
  } catch (error) {
    console.error('[ERROR] send external income document:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    })
  }
}
