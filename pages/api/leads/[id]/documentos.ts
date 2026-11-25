import type { NextApiRequest, NextApiResponse } from 'next'
import { readUploadedFiles } from '@/lib/tareas/attachments'
import { PERSONA_TIPOS, uploadPersonaDocumento, type PersonaTipo } from '@/lib/leads/archivos'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

export const config = { api: { bodyParser: false } }

/** Sube documentos o propuestas a la carpeta de Drive del cliente. ?tipo=documento|propuesta */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const tipo = String(req.query.tipo || '') as PersonaTipo
    if (!PERSONA_TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de archivo no válido' })

    let files
    try {
      files = await readUploadedFiles(req)
    } catch (e) {
      return res.status(400).json({ error: e instanceof Error ? e.message : 'No se pudo leer el archivo' })
    }
    if (files.length === 0) return res.status(400).json({ error: 'Selecciona al menos un archivo' })

    const subidos = []
    for (const f of files) {
      subidos.push(
        await uploadPersonaDocumento({ leadId: ctx.leadId, tipo, fileName: f.name, mime: f.mime, buffer: f.buffer })
      )
    }
    return res.status(201).json({ documentos: subidos })
  } catch (error) {
    if (isSessionError(error)) return
    console.error('[leads/documentos]', error)
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Error al subir el archivo' })
  }
}
