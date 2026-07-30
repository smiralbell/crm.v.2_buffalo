import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  CRM_ACTIVITY_KINDS,
  createActivity,
  deleteActivity,
  listActivities,
  listOpenAlerts,
  resolveActivity,
} from '@/lib/crm/activities'
import { getDashboardAlerts } from '@/lib/crm/dashboard-alerts'

const createSchema = z.object({
  contact_id: z.number().int().positive().optional(),
  lead_id: z.number().int().positive().optional(),
  kind: z.enum(CRM_ACTIVITY_KINDS).default('note'),
  title: z.string().min(1).max(300),
  body: z.string().max(20000).optional().nullable(),
  meta: z.record(z.unknown()).optional().nullable(),
  due_at: z.string().min(1).optional().nullable(),
})

const resolveSchema = z.object({
  id: z.union([z.string(), z.number()]),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)

    if (req.method === 'GET') {
      if (req.query.dashboard === '1' || req.query.dashboard === 'true') {
        const items = await getDashboardAlerts(2)
        return res.status(200).json({ items })
      }

      if (req.query.open_alerts === '1' || req.query.open_alerts === 'true') {
        let contactId = req.query.contact_id
          ? parseInt(String(req.query.contact_id), 10)
          : undefined
        const leadId = req.query.lead_id
          ? parseInt(String(req.query.lead_id), 10)
          : undefined
        if ((!contactId || !Number.isFinite(contactId)) && leadId && Number.isFinite(leadId)) {
          const lead = await prisma.lead.findUnique({
            where: { id: leadId },
            select: { contact_id: true },
          })
          contactId = lead?.contact_id
        }
        const items = await listOpenAlerts({
          contactId: Number.isFinite(contactId) ? contactId : undefined,
          leadId:
            (!contactId || !Number.isFinite(contactId)) && Number.isFinite(leadId)
              ? leadId
              : undefined,
        })
        return res.status(200).json({ items })
      }

      let contactId = req.query.contact_id
        ? parseInt(String(req.query.contact_id), 10)
        : undefined
      const leadId = req.query.lead_id
        ? parseInt(String(req.query.lead_id), 10)
        : undefined
      if (!contactId && !leadId) {
        return res.status(400).json({ error: 'contact_id o lead_id requerido' })
      }
      if ((!contactId || !Number.isFinite(contactId)) && leadId && Number.isFinite(leadId)) {
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { contact_id: true },
        })
        contactId = lead?.contact_id
      }
      const items = await listActivities({
        contactId: Number.isFinite(contactId) ? contactId : undefined,
        leadId:
          (!contactId || !Number.isFinite(contactId)) && Number.isFinite(leadId)
            ? leadId
            : undefined,
        limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 80,
      })
      return res.status(200).json({ items })
    }

    if (req.method === 'POST') {
      const action = String(req.query.action || req.body?.action || '')
      if (action === 'resolve') {
        const body = resolveSchema.parse(req.body ?? {})
        const item = await resolveActivity(body.id)
        if (!item) {
          return res.status(404).json({ error: 'Alerta no encontrada o ya resuelta' })
        }
        return res.status(200).json({ item })
      }

      const body = createSchema.parse(req.body ?? {})
      let contactId = body.contact_id
      const leadId = body.lead_id ?? null

      if ((!contactId || contactId <= 0) && leadId) {
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          select: { contact_id: true },
        })
        if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })
        contactId = lead.contact_id
      }
      if (!contactId) {
        return res.status(400).json({ error: 'contact_id o lead_id requerido' })
      }

      const item = await createActivity({
        contactId,
        leadId,
        kind: body.kind,
        title: body.title,
        body: body.body,
        meta: body.meta ?? null,
        createdBy: user.email,
        dueAt: body.due_at ?? null,
      })
      if (!item) {
        return res.status(500).json({
          error:
            'No se pudo crear la actividad. ¿Está creada la tabla crm_activities?',
        })
      }
      return res.status(201).json({ item })
    }

    if (req.method === 'PATCH') {
      const body = resolveSchema.parse(req.body ?? {})
      const item = await resolveActivity(body.id)
      if (!item) {
        return res.status(404).json({ error: 'Alerta no encontrada o ya resuelta' })
      }
      return res.status(200).json({ item })
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '')
      if (!id) return res.status(400).json({ error: 'id requerido' })
      const ok = await deleteActivity(id)
      if (!ok) return res.status(500).json({ error: 'No se pudo borrar' })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[api/crm/activities]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error en actividades',
    })
  }
}
