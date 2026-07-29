import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { getAuditById, saveAudit } from '@/lib/onboarding/audit/store'
import {
  applyUserAnswerLocal,
  askExampleTurn,
  buildAuditSnapshot,
  changeModeTurn,
  continueAfterAnswer,
  convertGapToQuestion,
  peekNextQuestion,
  runAnalyzeGaps,
  startOrResumeQuestion,
} from '@/lib/onboarding/audit/agent'
import { computeAreaProgress } from '@/lib/onboarding/audit/progress'
import { buildProposalPayload } from '@/lib/onboarding/audit/proposal'
import type { AuditAreaId, AuditMode, AuditProjectType } from '@/lib/onboarding/audit/types'
import { auditCompleteness } from '@/lib/onboarding/audit/progress'

const answerSchema = z.object({
  action: z.literal('answer'),
  question_id: z.string().min(1).optional(),
  field_key: z.string().optional(),
  answer: z.string().optional().default(''),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]).optional(),
  answer_action: z.enum([
    'save_continue',
    'skip',
    'not_applicable',
    'unknown',
    'buffalo_later',
    'add_buffalo_note',
    'ask_example',
    'resolve',
  ]),
  late: z.boolean().optional(),
  mode: z
    .enum([
      'descubrimiento',
      'roi',
      'funcional',
      'tecnico',
      'integraciones',
      'presupuesto',
      'cerrar_huecos',
    ])
    .optional(),
})

const patchSchema = z.object({
  action: z.literal('patch'),
  active_mode: z
    .enum([
      'descubrimiento',
      'roi',
      'funcional',
      'tecnico',
      'integraciones',
      'presupuesto',
      'cerrar_huecos',
    ])
    .optional(),
  active_area: z.string().optional(),
  project_types: z.array(z.string()).optional(),
})

const analyzeSchema = z.object({ action: z.literal('analyze') })
const retrySchema = z.object({ action: z.literal('retry_generate') })
const gapSchema = z.object({
  action: z.literal('gap'),
  gap_id: z.string().min(1),
  gap_action: z.enum(['ask_now', 'assign_client', 'assign_buffalo', 'resolve']),
})
const proposalSchema = z.object({ action: z.literal('proposal_payload') })

function pendingCount(audit: { questions?: { status: string }[] }) {
  return (audit.questions || []).filter((q) =>
    ['pending', 'skipped', 'unknown', 'buffalo_later'].includes(q.status)
  ).length
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'id requerido' })

  try {
    if (req.method === 'GET') {
      const audit = await getAuditById(id)
      if (!audit) return res.status(404).json({ error: 'Auditoría no encontrada' })
      const started = startOrResumeQuestion(audit)
      return res.status(200).json({
        audit: started.audit,
        current_question: started.next || peekNextQuestion(started.audit),
        areas: computeAreaProgress(started.audit.structured),
        snapshot: buildAuditSnapshot(started.audit),
        pending_count: pendingCount(started.audit),
        completeness: auditCompleteness(started.audit),
      })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    let audit = await getAuditById(id)
    if (!audit) return res.status(404).json({ error: 'Auditoría no encontrada' })

    const action = req.body?.action

    if (action === 'answer') {
      const body = answerSchema.parse(req.body)
      let questionId = body.question_id || audit.active_question_id
      if (!questionId && body.field_key) {
        questionId =
          [...(audit.questions || [])].reverse().find((q) => q.field_key === body.field_key)?.id ||
          null
      }
      if (!questionId) return res.status(400).json({ error: 'question_id requerido' })

      if (body.answer_action === 'ask_example') {
        const withExample = await askExampleTurn(audit, questionId)
        const saved = await saveAudit(withExample)
        return res.status(200).json({
          audit: saved,
          current_question: peekNextQuestion(saved),
          areas: computeAreaProgress(saved.structured),
          snapshot: buildAuditSnapshot(saved),
          pending_count: pendingCount(saved),
        })
      }

      // 1) Guardar respuesta siempre
      const local = applyUserAnswerLocal(audit, {
        question_id: questionId,
        answer: body.answer || '',
        action: body.answer_action,
        value: body.value,
        late: body.late,
      })
      audit = await saveAudit(local.audit)

      // skip / n/a / unknown / buffalo_later / resolve → generar siguiente (salvo late resolve alone)
      const shouldContinue =
        !body.late &&
        ['save_continue', 'skip', 'not_applicable', 'unknown', 'buffalo_later'].includes(
          body.answer_action
        )

      let aiError: string | undefined
      let current = peekNextQuestion(audit)

      if (shouldContinue) {
        try {
          const skippedField =
            body.answer_action === 'skip'
              ? local.question?.field_key ||
                audit.questions.find((q) => q.id === questionId)?.field_key
              : undefined
          const cont = await continueAfterAnswer(audit, body.answer || '', {
            action: body.answer_action,
            skippedFieldKey: skippedField,
          })
          audit = await saveAudit(cont.audit)
          current = cont.current
          aiError = cont.aiError
        } catch (e: unknown) {
          aiError = e instanceof Error ? e.message : 'Error generando siguiente pregunta'
        }
      }

      return res.status(200).json({
        audit,
        current_question: current,
        areas: computeAreaProgress(audit.structured),
        snapshot: buildAuditSnapshot(audit),
        pending_count: pendingCount(audit),
        ai_error: aiError || null,
        can_retry_generate: Boolean(aiError),
      })
    }

    if (action === 'retry_generate') {
      retrySchema.parse(req.body)
      const cont = await continueAfterAnswer(audit, '')
      audit = await saveAudit(cont.audit)
      return res.status(200).json({
        audit,
        current_question: cont.current,
        areas: computeAreaProgress(audit.structured),
        snapshot: buildAuditSnapshot(audit),
        pending_count: pendingCount(audit),
        ai_error: cont.aiError || null,
      })
    }

    if (action === 'patch') {
      const body = patchSchema.parse(req.body)
      if (body.active_mode && body.active_mode !== audit.active_mode) {
        const changed = await changeModeTurn(audit, body.active_mode as AuditMode)
        audit = await saveAudit(changed.audit)
        return res.status(200).json({
          audit,
          current_question: changed.current,
          areas: computeAreaProgress(audit.structured),
          snapshot: buildAuditSnapshot(audit),
          pending_count: pendingCount(audit),
        })
      }

      audit = await saveAudit({
        ...audit,
        active_area: (body.active_area as AuditAreaId) || audit.active_area,
        project_types: (body.project_types as AuditProjectType[]) || audit.project_types,
      })
      return res.status(200).json({
        audit,
        current_question: peekNextQuestion(audit),
        areas: computeAreaProgress(audit.structured),
        snapshot: buildAuditSnapshot(audit),
        pending_count: pendingCount(audit),
      })
    }

    if (action === 'analyze') {
      analyzeSchema.parse(req.body)
      const result = await runAnalyzeGaps(audit)
      audit = await saveAudit(result.audit)
      return res.status(200).json({
        audit,
        analysis: result.analysis,
        current_question: peekNextQuestion(audit),
        areas: computeAreaProgress(audit.structured),
        snapshot: buildAuditSnapshot(audit),
        pending_count: pendingCount(audit),
        completeness: auditCompleteness(audit),
      })
    }

    if (action === 'gap') {
      const body = gapSchema.parse(req.body)
      const gap = (audit.gaps || []).find((g) => g.id === body.gap_id)
      if (!gap) return res.status(404).json({ error: 'Hueco no encontrado' })

      if (body.gap_action === 'ask_now') {
        const conv = await convertGapToQuestion(audit, body.gap_id)
        audit = await saveAudit(conv.audit)
        return res.status(200).json({
          audit,
          current_question: conv.current,
          areas: computeAreaProgress(audit.structured),
          snapshot: buildAuditSnapshot(audit),
          pending_count: pendingCount(audit),
        })
      }

      const gaps = audit.gaps.map((g) => {
        if (g.id !== body.gap_id) return g
        if (body.gap_action === 'resolve') return { ...g, status: 'resolved' as const }
        if (body.gap_action === 'assign_client') return { ...g, owner: 'client' as const }
        if (body.gap_action === 'assign_buffalo') return { ...g, owner: 'buffalo' as const }
        return g
      })
      audit = await saveAudit({ ...audit, gaps })
      return res.status(200).json({
        audit,
        current_question: peekNextQuestion(audit),
        areas: computeAreaProgress(audit.structured),
        snapshot: buildAuditSnapshot(audit),
        pending_count: pendingCount(audit),
      })
    }

    if (action === 'proposal_payload') {
      proposalSchema.parse(req.body)
      const payload = buildProposalPayload(audit)
      return res.status(200).json({
        audit,
        proposal: payload,
        completeness: payload.completeness,
        warn_critical: payload.completeness.criticalMissing.length > 0,
      })
    }

    return res.status(400).json({ error: 'action inválida' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error'
    console.error('[audit/:id]', e)
    return res.status(500).json({ error: msg })
  }
}
