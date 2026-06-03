import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { BUFFALO_STAGE_COLORS } from '@/components/PipelineCardDrawer'

// ── Auth: Instantly sends a custom header we verify ──────────────────────────
// In Instantly: Integrations → Webhooks → Custom Headers → Authorization: Bearer <secret>
// Here we read that secret from env var INSTANTLY_WEBHOOK_SECRET
const WEBHOOK_SECRET = process.env.INSTANTLY_WEBHOOK_SECRET || ''

// ── Disable body parsing size limit for large payloads ───────────────────────
export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }

// ── Instantly event types we care about ──────────────────────────────────────
type InstantlyEvent =
  | 'email_sent'
  | 'reply_received'
  | 'lead_interested'
  | 'lead_not_interested'
  | 'lead_meeting_booked'
  | 'lead_meeting_completed'
  | 'email_bounced'
  | 'lead_unsubscribed'
  | 'lead_out_of_office'
  | 'lead_closed'

interface InstantlyPayload {
  event_type:    InstantlyEvent
  timestamp:     string
  workspace?:    string
  campaign_id?:  string
  campaign_name?: string
  lead_email?:   string
  first_name?:   string
  last_name?:    string
  company_name?: string
  job_title?:    string
  phone?:        string
  reply_text?:   string
  reply_snippet?: string
  email_subject?: string
  unibox_url?:   string
  step?:         number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Upsert a MarketingMetric row and increment one or more counters atomically
async function incrementMetric(
  channel: string,
  period: string,
  increments: Partial<{
    emails_sent: number
    contacts_sent: number
    replies: number
    interested: number
    not_interested: number
    bounced: number
    unsubscribed: number
    meetings_booked: number
  }>
) {
  const cols   = Object.keys(increments)
  const vals   = Object.values(increments)
  // Use table-qualified names in the UPDATE to avoid ambiguity
  const setClauses = cols
    .map((k, i) => `"${k}" = marketing_metrics."${k}" + ${vals[i]}`)
    .join(', ')

  await prisma.$executeRawUnsafe(`
    INSERT INTO marketing_metrics (channel, period, ${cols.join(', ')}, updated_at)
    VALUES ($1, $2, ${vals.join(', ')}, NOW())
    ON CONFLICT (channel, period)
    DO UPDATE SET ${setClauses}, updated_at = NOW()
  `, channel, period)
}

// Register a unique outreach contact for this period; returns true if it's new
async function registerOutreachContact(email: string, period: string): Promise<boolean> {
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO marketing_outreach_contacts (email, period)
      VALUES ($1, $2)
      ON CONFLICT (email, period) DO NOTHING
    `, email, period)
    // Check if row was inserted (i.e. it's a new contact this period)
    const existing = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM marketing_outreach_contacts WHERE email = $1 AND period = $2`,
      email, period
    )
    return Number(existing[0]?.count) === 1
  } catch {
    return false
  }
}

// Find the first active pipeline for contacts
async function getDefaultPipeline() {
  return prisma.pipelineKanban.findFirst({
    where: { entity_type: 'contact' },
    orderBy: { created_at: 'asc' },
  })
}

// Find existing pipeline card for a contact
async function findPipelineCard(pipelineId: string, entityId: string) {
  return prisma.pipelineCard.findFirst({
    where: { pipeline_id: pipelineId, entity_id: entityId, deleted_at: null },
  })
}

// Move or create pipeline card
async function upsertPipelineCard(
  pipelineId: string,
  entityId: string,
  stage: string,
) {
  const existing = await findPipelineCard(pipelineId, entityId)
  const stageColor = BUFFALO_STAGE_COLORS[stage] || '#6B7280'

  if (existing) {
    // Only move forward — don't downgrade stage
    const stageOrder = ['LEAD','CONTACTO','REUNIÓN','PROPUESTA ENVIADA','NEGOCIANDO','CONTRATO FIRMADO','ACTIVO']
    const currentIdx = stageOrder.indexOf(existing.stage)
    const newIdx     = stageOrder.indexOf(stage)
    if (newIdx > currentIdx) {
      await prisma.pipelineCard.update({
        where: { id: existing.id },
        data: { stage, stage_color: stageColor, updated_at: new Date() },
      })
    }
  } else {
    // Count existing cards in stage for positioning
    const count = await prisma.pipelineCard.count({
      where: { pipeline_id: pipelineId, stage, deleted_at: null },
    })
    await prisma.pipelineCard.create({
      data: {
        pipeline_id:  pipelineId,
        entity_id:    entityId,
        entity_type:  'contact',
        stage,
        stage_color:  stageColor,
        position:     count,
        tags:         ['email_outreach'],
        capture_date: new Date(),
      },
    })
  }
}

// Find or create contact + lead from Instantly payload
async function upsertContactAndLead(payload: InstantlyPayload) {
  if (!payload.lead_email) return null

  const email   = payload.lead_email.toLowerCase().trim()
  const nombre  = [payload.first_name, payload.last_name].filter(Boolean).join(' ') || null
  const empresa = payload.company_name || null
  const cargo   = payload.job_title   || null

  // Upsert contact
  let contact = await prisma.contact.findUnique({ where: { email } })
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        email,
        nombre:  nombre || email,
        empresa,
        telefono: payload.phone || null,
      },
    })
  } else if (nombre && !contact.nombre) {
    // Fill in missing data
    contact = await prisma.contact.update({
      where: { id: contact.id },
      data: { nombre, empresa: empresa || contact.empresa },
    })
  }

  // Upsert lead
  let lead = await prisma.lead.findUnique({ where: { contact_id: contact.id } })
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        contact_id:       contact.id,
        estado:           'caliente',
        origen_principal: 'email_outreach',
        prioridad:        'media',
        notas:            cargo ? `Cargo: ${cargo}` : null,
      },
    })
  }

  return { contact, lead }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify secret (skip if not set — useful for initial testing)
  if (WEBHOOK_SECRET) {
    const authHeader = req.headers['authorization'] || ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (token !== WEBHOOK_SECRET) {
      console.warn('[instantly-webhook] Unauthorized attempt')
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  const payload = req.body as InstantlyPayload

  if (!payload?.event_type) {
    return res.status(400).json({ error: 'Missing event_type' })
  }

  const period = currentPeriod()
  const CHANNEL = 'email_outreach'

  console.log(`[instantly-webhook] ${payload.event_type} — ${payload.lead_email || '—'} — ${period}`)

  try {
    switch (payload.event_type) {

      // ── Cada email enviado ──────────────────────────────────────────────────
      case 'email_sent': {
        const isNew = payload.lead_email
          ? await registerOutreachContact(payload.lead_email.toLowerCase(), period)
          : false

        await incrementMetric(CHANNEL, period, {
          emails_sent:   1,
          contacts_sent: isNew ? 1 : 0,  // solo cuenta como nuevo contacto la primera vez
        })
        break
      }

      // ── Alguien responde → entra al CRM ────────────────────────────────────
      case 'reply_received': {
        await incrementMetric(CHANNEL, period, { replies: 1 })

        const result = await upsertContactAndLead(payload)
        if (result) {
          const pipeline = await getDefaultPipeline()
          if (pipeline) {
            await upsertPipelineCard(pipeline.id, String(result.contact.id), 'CONTACTO')
          }
          // Store the reply snippet in lead notes if we have it
          if (payload.reply_snippet || payload.reply_text) {
            const snippet = (payload.reply_snippet || payload.reply_text || '').substring(0, 500)
            const existing = result.lead.notas || ''
            const newNote = `[Respuesta ${new Date().toLocaleDateString('es-ES')}]: "${snippet}"`
            if (!existing.includes(snippet.substring(0, 30))) {
              await prisma.lead.update({
                where: { id: result.lead.id },
                data:  { notas: existing ? `${existing}\n\n${newNote}` : newNote },
              })
            }
          }
        }
        break
      }

      // ── Marcado como interesado en Instantly ───────────────────────────────
      case 'lead_interested': {
        await incrementMetric(CHANNEL, period, { interested: 1 })

        const result = await upsertContactAndLead(payload)
        if (result) {
          // Bump lead priority
          await prisma.lead.update({
            where: { id: result.lead.id },
            data:  { estado: 'caliente', prioridad: 'alta' },
          })
          const pipeline = await getDefaultPipeline()
          if (pipeline) {
            await upsertPipelineCard(pipeline.id, String(result.contact.id), 'CONTACTO')
          }
        }
        break
      }

      // ── No interesado ──────────────────────────────────────────────────────
      case 'lead_not_interested': {
        await incrementMetric(CHANNEL, period, { not_interested: 1 })

        if (payload.lead_email) {
          const contact = await prisma.contact.findUnique({
            where: { email: payload.lead_email.toLowerCase() },
          })
          if (contact) {
            const lead = await prisma.lead.findUnique({ where: { contact_id: contact.id } })
            if (lead) {
              await prisma.lead.update({
                where: { id: lead.id },
                data:  { estado: 'frio' },
              })
            }
          }
        }
        break
      }

      // ── Reunión agendada ───────────────────────────────────────────────────
      case 'lead_meeting_booked': {
        await incrementMetric(CHANNEL, period, { meetings_booked: 1 })

        const result = await upsertContactAndLead(payload)
        if (result) {
          await prisma.lead.update({
            where: { id: result.lead.id },
            data:  { estado: 'reunion', prioridad: 'alta' },
          })
          const pipeline = await getDefaultPipeline()
          if (pipeline) {
            await upsertPipelineCard(pipeline.id, String(result.contact.id), 'REUNIÓN')
          }
          // Create a task for the sales team
          await prisma.task.create({
            data: {
              contact_id: result.contact.id,
              lead_id:    result.lead.id,
              tarea:      `📅 Reunión agendada — ${result.contact.nombre || result.contact.email} (Instantly)`,
              pendiente:  true,
            },
          })
        }
        break
      }

      // ── Bounce ─────────────────────────────────────────────────────────────
      case 'email_bounced': {
        await incrementMetric(CHANNEL, period, { bounced: 1 })
        break
      }

      // ── Baja / Unsubscribe ─────────────────────────────────────────────────
      case 'lead_unsubscribed': {
        await incrementMetric(CHANNEL, period, { unsubscribed: 1 })

        if (payload.lead_email) {
          const contact = await prisma.contact.findUnique({
            where: { email: payload.lead_email.toLowerCase() },
          })
          if (contact) {
            const lead = await prisma.lead.findUnique({ where: { contact_id: contact.id } })
            if (lead) {
              await prisma.lead.update({
                where: { id: lead.id },
                data:  { estado: 'frio' },
              })
            }
          }
        }
        break
      }

      default:
        // Log unknown events but return 200 so Instantly doesn't retry
        console.log(`[instantly-webhook] Unhandled event: ${payload.event_type}`)
    }

    return res.status(200).json({ ok: true, event: payload.event_type })

  } catch (error) {
    console.error('[instantly-webhook] Error processing event:', error)
    return res.status(500).json({ error: 'Internal error processing webhook' })
  }
}
