import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { createAudit, getAuditByLeadId, saveAudit } from '@/lib/onboarding/audit/store'
import {
  buildAuditSnapshot,
  normalizeConversation,
  peekNextQuestion,
  startMeetingTurn,
  startOrResumeQuestion,
} from '@/lib/onboarding/audit/agent'
import { computeAreaProgress } from '@/lib/onboarding/audit/progress'
import { persistAuditProjectForLead } from '@/lib/onboarding/audit/persist-project'
import type { AuditProjectType } from '@/lib/onboarding/audit/types'

const postSchema = z.object({
  lead_id: z.number().int().positive(),
  project_types: z
    .array(
      z.enum([
        'voice_agent',
        'text_agent',
        'automation',
        'rag',
        'scraping',
        'dashboard',
        'integration',
        'custom',
        'unclear',
      ])
    )
    .optional(),
  start_meeting: z.boolean().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  try {
    if (req.method === 'GET') {
      const leadId = Number(req.query.lead_id)
      if (!leadId) return res.status(400).json({ error: 'lead_id requerido' })
      let audit = await getAuditByLeadId(leadId)
      if (!audit) audit = await createAudit({ lead_id: leadId })

      const cleaned = normalizeConversation(audit.conversation || [])
      if (cleaned.length !== (audit.conversation || []).length) {
        audit = await saveAudit({ ...audit, conversation: cleaned })
      }

      const started = startOrResumeQuestion(audit)
      audit = started.audit
      const current = started.next || peekNextQuestion(audit)

      const hasStarted =
        Boolean(audit.started_at) ||
        (audit.questions || []).length > 0 ||
        (audit.conversation || []).some((t) => t.message_type === 'question')
      if (hasStarted) {
        try {
          await persistAuditProjectForLead(leadId)
        } catch (e) {
          console.error('[audit] persist project (get)', e)
        }
      }

      return res.status(200).json({
        audit,
        current_question: current,
        areas: computeAreaProgress(audit.structured),
        snapshot: buildAuditSnapshot(audit),
        pending_count: (audit.questions || []).filter((q) =>
          ['pending', 'skipped', 'unknown', 'buffalo_later'].includes(q.status)
        ).length,
        project_saved: hasStarted,
      })
    }

    if (req.method === 'POST') {
      const body = postSchema.parse(req.body)
      let audit = await getAuditByLeadId(body.lead_id)
      if (!audit) {
        audit = await createAudit({
          lead_id: body.lead_id,
          project_types: body.project_types as AuditProjectType[] | undefined,
        })
      } else if (body.project_types?.length) {
        audit = await saveAudit({
          ...audit,
          project_types: body.project_types as AuditProjectType[],
        })
      }

      const shouldStart = body.start_meeting !== false
      const isFreshStart =
        shouldStart &&
        !(audit.conversation || []).some((t) => t.role === 'user') &&
        !(audit.questions || []).length

      if (isFreshStart) {
        const meeting = await startMeetingTurn(audit)
        audit = await saveAudit(meeting.audit)

        try {
          await persistAuditProjectForLead(body.lead_id)
        } catch (e) {
          console.error('[audit] persist project', e)
        }

        return res.status(200).json({
          audit,
          current_question: meeting.current,
          areas: computeAreaProgress(audit.structured),
          snapshot: buildAuditSnapshot(audit),
          pending_count: 0,
          project_saved: true,
        })
      }

      // Reanudar / ya iniciada: asegurar proyecto guardado
      if ((audit.questions || []).length > 0 || audit.started_at) {
        try {
          await persistAuditProjectForLead(body.lead_id)
        } catch (e) {
          console.error('[audit] persist project (resume)', e)
        }
      }

      const current = peekNextQuestion(audit)
      return res.status(200).json({
        audit,
        current_question: current,
        areas: computeAreaProgress(audit.structured),
        snapshot: buildAuditSnapshot(audit),
        pending_count: (audit.questions || []).filter((q) =>
          ['pending', 'skipped', 'unknown', 'buffalo_later'].includes(q.status)
        ).length,
        project_saved: true,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    if (msg.includes('project_audits')) {
      return res.status(500).json({
        error:
          'Falta o está desactualizada la tabla project_audits. Ejecuta CREATE_PROJECT_AUDITS.sql y ALTER_PROJECT_AUDITS_V2.sql',
      })
    }
    console.error('[audit]', e)
    return res.status(500).json({ error: msg })
  }
}
