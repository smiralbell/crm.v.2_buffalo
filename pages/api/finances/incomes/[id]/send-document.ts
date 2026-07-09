import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import FormData from 'form-data'
import fetch from 'node-fetch'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'
import { createPlaceholderNotePdfBuffer } from '@/lib/pdf/placeholder-note-pdf'

export const config = {
  api: { bodyParser: false },
}

const EMITIDAS_WEBHOOK_URL =
  'https://n8n.agenciabuffalo.es/webhook/0a19bd04-25b5-4f9a-b4f9-9037a7e02996'

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
    const total = Number(row.amount)

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

    const formData = new FormData()
    formData.append('pdf', fileBuffer, {
      filename: fileName,
      contentType,
    })
    formData.append('bank_transaction_id', bankTransactionId)
    formData.append('concept', concept)
    formData.append('date', dateStr)
    formData.append('total_amount', total.toFixed(2))
    formData.append('no_invoice', 'true')
    formData.append('no_crm_link', 'true')
    if (note) formData.append('note', note)

    const webhookUrl =
      `${EMITIDAS_WEBHOOK_URL}?pdf_filename=${encodeURIComponent(fileName)}` +
      `&invoice_id=${encodeURIComponent(bankTransactionId)}` +
      `&invoice_number=${encodeURIComponent(concept)}` +
      `&year_month=${encodeURIComponent(yearMonth)}` +
      `&type=emitida&no_invoice=true&no_crm_link=true` +
      (note ? `&note=${encodeURIComponent(note)}` : '')

    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    })

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text().catch(() => '')
      return res.status(502).json({
        error: 'No se pudo enviar el documento a Drive vía n8n',
        details: errorText.substring(0, 200),
      })
    }

    await query(`UPDATE bank_transactions SET is_reconciled = true WHERE id = $1`, [
      bankTransactionId,
    ])

    return res.status(200).json({
      success: true,
      message: 'Cobro conciliado sin vincular factura del CRM',
    })
  } catch (error) {
    console.error('[ERROR] send external income document:', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
