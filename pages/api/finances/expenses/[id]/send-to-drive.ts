import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import { requireAuthAPI } from '@/lib/auth'
import { syncExpensePdfToDrive } from '@/lib/drive/invoice-storage'

export const config = {
  api: {
    bodyParser: false,
  },
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

  const expenseId = parseInt(req.query.id as string, 10)
  if (Number.isNaN(expenseId)) {
    return res.status(400).json({ error: 'ID de gasto inválido' })
  }

  const form = formidable({
    maxFileSize: 15 * 1024 * 1024,
    keepExtensions: true,
  })

  try {
    const [fields, files] = await form.parse(req)
    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return res.status(400).json({ error: 'Debes adjuntar el PDF del gasto' })
    }

    const buffer = await fs.promises.readFile(file.filepath)
    const providedName = Array.isArray(fields.file_name) ? fields.file_name[0] : fields.file_name
    const fallbackName = `gasto_${expenseId}.pdf`

    const uploaded = await syncExpensePdfToDrive({
      expenseId,
      fileName:
        typeof providedName === 'string' && providedName.trim()
          ? providedName.trim()
          : file.originalFilename || fallbackName,
      buffer,
      mimeType: file.mimetype || 'application/pdf',
    })

    return res.status(200).json({
      success: true,
      file_id: uploaded.id,
      file_url: uploaded.url,
    })
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error al subir el gasto a Google Drive',
    })
  }
}
