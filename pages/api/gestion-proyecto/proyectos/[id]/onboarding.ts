import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { prisma } from '@/lib/prisma'
import { sanitizeOnboardingForDeveloper } from '@/lib/gestion-proyecto/sanitize-onboarding'

const onboardingSchema = z.object({
  summary: z.string().optional(),
  scope_text: z.string().optional(),
  stack_text: z.string().optional(),
  deliverables: z.string().optional(),
  contacts: z.string().optional(),
  internal_notes: z.string().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const projectId = req.query.id as string
  if (!projectId) return res.status(400).json({ error: 'ID requerido' })

  try {
    await requireProjectAccessAPI(req, res, projectId)

    if (req.method === 'PATCH') {
      const data = onboardingSchema.parse(req.body)

      const exists = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM proyectos WHERE id = ${projectId}::uuid LIMIT 1
      `
      if (!exists[0]) return res.status(404).json({ error: 'Proyecto no encontrado' })

      const rows = await prisma.$queryRaw<
        {
          project_id: string
          summary: string | null
          client_context: string | null
          scope_text: string | null
          stack_text: string | null
          deliverables: string | null
          contacts: string | null
          internal_notes: string | null
          updated_at: Date
        }[]
      >`
        INSERT INTO project_dev_onboarding (
          project_id, summary, client_context, scope_text, stack_text,
          deliverables, contacts, internal_notes
        ) VALUES (
          ${projectId}::uuid,
          ${data.summary ?? ''},
          '',
          ${data.scope_text ?? ''},
          ${data.stack_text ?? ''},
          ${data.deliverables ?? ''},
          ${data.contacts ?? ''},
          ${data.internal_notes ?? ''}
        )
        ON CONFLICT (project_id) DO UPDATE SET
          summary = COALESCE(${data.summary ?? null}, project_dev_onboarding.summary),
          client_context = '',
          scope_text = COALESCE(${data.scope_text ?? null}, project_dev_onboarding.scope_text),
          stack_text = COALESCE(${data.stack_text ?? null}, project_dev_onboarding.stack_text),
          deliverables = COALESCE(${data.deliverables ?? null}, project_dev_onboarding.deliverables),
          contacts = COALESCE(${data.contacts ?? null}, project_dev_onboarding.contacts),
          internal_notes = COALESCE(${data.internal_notes ?? null}, project_dev_onboarding.internal_notes),
          updated_at = NOW()
        RETURNING *
      `

      const row = rows[0]
      return res.status(200).json(
        sanitizeOnboardingForDeveloper({
          project_id: row.project_id,
          summary: row.summary || '',
          client_context: '',
          scope_text: row.scope_text || '',
          stack_text: row.stack_text || '',
          deliverables: row.deliverables || '',
          contacts: row.contacts || '',
          internal_notes: row.internal_notes || '',
          updated_at: row.updated_at.toISOString(),
        })
      )
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    console.error('[gestion-proyecto/onboarding]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
