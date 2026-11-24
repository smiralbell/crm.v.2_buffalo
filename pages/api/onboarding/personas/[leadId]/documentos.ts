import type { NextApiRequest, NextApiResponse } from 'next'
import { requireLeadAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { readUploadedFiles } from '@/lib/tareas/attachments'
import { PERSONA_TIPOS, uploadPersonaDocumento, type PersonaTipo } from '@/lib/onboarding/persona-archivos'

export const config = { api: { bodyParser: false } }

/** Sube documentos o propuestas a la carpeta de Drive de la persona. ?tipo=documento|propuesta */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireLeadAccessAPI(req, res, req.query.leadId)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) return res.status(400).json({ error: 'leadId inválido' })
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
      subidos.push(await uploadPersonaDocumento({ leadId, tipo, fileName: f.name, mime: f.mime, buffer: f.buffer }))
    }
    return res.status(201).json({ documentos: subidos })
  } catch (error) {
    if (error instanceof Error && ['No session', 'Invalid session', 'Expired session', 'Forbidden'].includes(error.message)) {
      return
    }
    console.error('[onboarding/personas/documentos]', error)
    const msg = error instanceof Error ? error.message : 'Error al subir el archivo'
    return res.status(500).json({ error: msg })
  }
}
