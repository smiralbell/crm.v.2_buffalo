import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { createChecklistItem, listChecklistItems } from '@/lib/checklist/store'
import { isChecklistColumnId } from '@/lib/checklist/types'
import { resolveCrmUserFkId } from '@/lib/crm-users'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Solo admin' })
    }

    if (req.method === 'GET') {
      try {
        const items = await listChecklistItems()
        return res.status(200).json({ items })
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('crm_checklist_items') || msg.includes('does not exist')) {
          return res.status(200).json({
            items: [],
            warning: 'Ejecuta prisma/CREATE_CRM_CHECKLIST.sql en la base de datos.',
          })
        }
        throw err
      }
    }

    if (req.method === 'POST') {
      const title = typeof req.body?.title === 'string' ? req.body.title : ''
      const column_key = req.body?.column_key
      const createdBy = await resolveCrmUserFkId(user.id)
      const item = await createChecklistItem({
        title,
        column_key: isChecklistColumnId(column_key) ? column_key : 'inbox',
        createdByUserId: createdBy,
      })
      return res.status(201).json({ item })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    const msg = error instanceof Error ? error.message : 'Error interno'
    if (msg.includes('título')) return res.status(400).json({ error: msg })
    console.error('[checklist]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
