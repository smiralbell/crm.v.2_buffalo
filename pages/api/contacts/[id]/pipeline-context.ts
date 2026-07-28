import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getPipelineCardContext } from '@/lib/pipelines/card-context'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const contactId = parseInt(String(req.query.id), 10)
  if (!Number.isFinite(contactId) || contactId <= 0) {
    return res.status(400).json({ error: 'contact id inválido' })
  }

  try {
    const context = await getPipelineCardContext(contactId)
    if (!context) {
      return res.status(404).json({ error: 'Contacto no encontrado' })
    }
    return res.status(200).json(context)
  } catch (err) {
    console.error('[api/contacts/[id]/pipeline-context]', err)
    return res.status(500).json({ error: 'Error cargando contexto del lead' })
  }
}
