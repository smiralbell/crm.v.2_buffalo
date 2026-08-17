import type { NextApiRequest, NextApiResponse } from 'next'
import { createReadStream } from 'fs'
import { readFile, stat } from 'fs/promises'
import path from 'path'
import { requireAuthAPI } from '@/lib/auth'
import { buildTicketsWebhookGuidePdf } from '@/lib/tickets/webhook-guide-pdf'

const MD_FILENAME = 'buffalo-tickets-webhook.md'
const PDF_FILENAME = 'buffalo-tickets-webhook.pdf'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const format = String(req.query.format || 'md').toLowerCase()
  const filePath = path.join(process.cwd(), 'docs', 'TICKETS_WEBHOOK.md')

  try {
    if (format === 'pdf') {
      const markdown = await readFile(filePath, 'utf8')
      const pdf = buildTicketsWebhookGuidePdf(markdown)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', pdf.length)
      res.setHeader('Content-Disposition', `attachment; filename="${PDF_FILENAME}"`)
      res.setHeader('Cache-Control', 'private, max-age=60')
      return res.status(200).send(pdf)
    }

    const st = await stat(filePath)
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
    res.setHeader('Content-Length', st.size)
    res.setHeader('Content-Disposition', `attachment; filename="${MD_FILENAME}"`)
    res.setHeader('Cache-Control', 'private, max-age=60')
    createReadStream(filePath).pipe(res)
  } catch {
    return res.status(404).json({ error: 'Guía no encontrada' })
  }
}
