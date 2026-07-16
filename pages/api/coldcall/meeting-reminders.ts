import type { NextApiRequest, NextApiResponse } from 'next'
import { requireColdCallAPI } from '@/lib/auth'
import { resolveCrmUserFkId } from '@/lib/crm-users'
import { parseReunionDatetimeInput } from '@/lib/coldcall/meeting-datetime'
import {
  canSeeDemoPrepReminders,
  listConfirmReminders,
  listDemoPrepReminders,
  updateDemoPrep,
  updateMeetingConfirm,
  type DemoPrepStatus,
  type ReunionConfirmStatus,
} from '@/lib/coldcall/meeting-reminders'
import { resolveColdCallScope, type ColdCallFilter } from '@/lib/coldcall/scope'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireColdCallAPI(req, res)
    const filter = req.query.filter as ColdCallFilter | undefined
    const scope = await resolveColdCallScope(
      user,
      filter === 'team' ? 'team' : filter ? parseInt(String(filter), 10) : undefined
    )
    const crmUserId = await resolveCrmUserFkId(user.id)

    if (req.method === 'GET') {
      const confirm = await listConfirmReminders(scope)
      const showDemo = canSeeDemoPrepReminders(user)
      const demo_prep = showDemo ? await listDemoPrepReminders(scope) : []
      return res.status(200).json({
        confirm,
        demo_prep,
        can_see_demo_prep: showDemo,
      })
    }

    if (req.method === 'POST') {
      const { action, call_id, note, new_reunion_fecha, status } = req.body || {}
      const callId = parseInt(String(call_id), 10)
      if (Number.isNaN(callId)) {
        return res.status(400).json({ error: 'call_id inválido' })
      }

      if (action === 'confirm' || action === 'cancel' || action === 'reschedule') {
        const map: Record<string, ReunionConfirmStatus> = {
          confirm: 'confirmed',
          cancel: 'cancelled',
          reschedule: 'rescheduled',
        }
        const newDate =
          action === 'reschedule' ? parseReunionDatetimeInput(new_reunion_fecha) : null
        const result = await updateMeetingConfirm({
          callId,
          userId: crmUserId,
          status: map[action],
          note: typeof note === 'string' ? note : null,
          newReunionFecha: newDate,
        })
        if (!result.ok) return res.status(400).json({ error: result.error })
        return res.status(200).json({ ok: true })
      }

      if (action === 'demo_prep') {
        if (!canSeeDemoPrepReminders(user)) {
          return res.status(403).json({ error: 'No autorizado' })
        }
        const prepStatus = (status || 'ready') as DemoPrepStatus
        if (!['pending', 'ready', 'done'].includes(prepStatus)) {
          return res.status(400).json({ error: 'status inválido' })
        }
        const result = await updateDemoPrep({
          callId,
          userId: crmUserId,
          status: prepStatus,
        })
        if (!result.ok) return res.status(400).json({ error: result.error })
        return res.status(200).json({ ok: true })
      }

      return res.status(400).json({ error: 'action inválida' })
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (error) {
    if (
      error instanceof Error &&
      ['Forbidden', 'No session', 'Invalid session'].includes(error.message)
    ) {
      return
    }
    console.error('[coldcall/meeting-reminders]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
