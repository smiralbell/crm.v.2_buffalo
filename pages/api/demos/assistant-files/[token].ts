import type { NextApiRequest, NextApiResponse } from 'next'
import { createReadStream } from 'fs'
import { readAssistantFile } from '@/lib/demos/assistant-attachments'
import { stat } from 'fs/promises'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const token = String(req.query.token || '')
  if (!/^[a-f0-9]{32,64}$/i.test(token)) {
    return res.status(400).json({ error: 'Token inválido' })
  }

  const file = await readAssistantFile(token)
  if (!file) {
    return res.status(404).json({ error: 'Archivo no encontrado o caducado' })
  }

  try {
    const st = await stat(file.filePath)
    res.setHeader('Content-Type', file.mime)
    res.setHeader('Content-Length', st.size)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`
    )
    res.setHeader('Cache-Control', 'private, max-age=60')
    createReadStream(file.filePath).pipe(res)
  } catch {
    return res.status(404).json({ error: 'Archivo no legible' })
  }
}
