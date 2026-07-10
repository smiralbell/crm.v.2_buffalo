import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import { readFile } from 'fs/promises'
import { requireAuthAPI } from '@/lib/auth'
import { canUseFreelancerInvoices } from '@/lib/auth-rbac'
import {
  DeveloperInvoicesConfigError,
  getDeveloperInvoice,
  getDeveloperInvoicePdfPath,
  setDeveloperInvoicePdfPath,
} from '@/lib/developer/invoices'
import { readDevInvoicePdf, saveDevInvoicePdf } from '@/lib/developer/invoice-pdf'

export const config = { api: { bodyParser: false } }

function parseForm(req: NextApiRequest) {
  return new Promise<{ files: formidable.Files }>((resolve, reject) => {
    const form = formidable({ multiples: false })
    form.parse(req, (err, _fields, files) => {
      if (err) reject(err)
      else resolve({ files })
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user
  try {
    user = await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method === 'GET') {
    if (!canUseFreelancerInvoices(user.role) && user.role !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado' })
    }
    try {
      const meta = await getDeveloperInvoicePdfPath(id)
      if (!meta) return res.status(404).json({ error: 'PDF no encontrado' })
      if (canUseFreelancerInvoices(user.role) && meta.userId !== user.id) {
        return res.status(403).json({ error: 'Acceso denegado' })
      }
      const buffer = await readDevInvoicePdf(meta.path)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(meta.invoice_number)}.pdf"`
      )
      return res.status(200).send(buffer)
    } catch (error) {
      console.error('[developer/invoices/pdf GET]', error)
      return res.status(500).json({ error: 'Error al leer PDF' })
    }
  }

  if (!canUseFreelancerInvoices(user.role)) {
    return res.status(403).json({ error: 'Acceso denegado' })
  }

  if (req.method === 'POST') {
    try {
      const invoice = await getDeveloperInvoice(user.id, id)
      if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' })

      const { files } = await parseForm(req)
      const uploaded = files.pdf ?? files.file ?? Object.values(files)[0]
      const file = Array.isArray(uploaded) ? uploaded[0] : uploaded
      const filepath = file?.filepath
      if (!filepath) {
        return res.status(400).json({ error: 'Debes adjuntar un PDF' })
      }

      const mime = file.mimetype || ''
      const name = (file.originalFilename || '').toLowerCase()
      if (mime !== 'application/pdf' && !name.endsWith('.pdf')) {
        return res.status(400).json({ error: 'Solo se permiten archivos PDF' })
      }

      const buffer = await readFile(filepath)
      const rel = await saveDevInvoicePdf(user.id, id, buffer)
      const ok = await setDeveloperInvoicePdfPath(user.id, id, rel)
      if (!ok) return res.status(500).json({ error: 'No se pudo guardar el PDF' })

      return res.status(200).json({ ok: true, has_pdf: true })
    } catch (error) {
      if (error instanceof DeveloperInvoicesConfigError) {
        return res.status(503).json({ error: 'Migración pendiente', hint: error.message })
      }
      console.error('[developer/invoices/pdf POST]', error)
      return res.status(500).json({ error: 'Error al subir PDF' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
