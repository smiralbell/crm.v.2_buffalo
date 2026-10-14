import type { NextApiRequest, NextApiResponse } from 'next'
import { query } from '@/lib/db'
import {
  incidentsWebhookToken,
  incidentsBearerMatches,
  parseIncidentPayload,
  ingestIncident,
} from '@/lib/retencion/incidents'
import { alertIncident } from '@/lib/retencion/incident-alerts'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/webhooks/incidents
 * Un webhook para todos los proyectos de retención.
 * { error, client_id } — client_id = UUID del proyecto en el CRM.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      service: 'retencion-incidents',
      auth: 'Authorization: Bearer <RETENCION_INCIDENTS_TOKEN o INGEST_TOKEN>',
      example: {
        error: 'Timeout al cobrar en /pagos',
        client_id: '<uuid del proyecto en retención>',
      },
    })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const expected = incidentsWebhookToken()
  if (!expected) {
    return res.status(503).json({ error: 'Configura RETENCION_INCIDENTS_TOKEN o INGEST_TOKEN' })
  }
  if (!incidentsBearerMatches(req)) return res.status(401).json({ error: 'Unauthorized' })

  const parsed = parseIncidentPayload(req.body)
  if (!parsed.error) return res.status(400).json({ error: 'Falta el campo error' })
  if (!parsed.clientId) return res.status(400).json({ error: 'Falta client_id (id del proyecto)' })
  if (!UUID.test(parsed.clientId)) return res.status(400).json({ error: 'client_id no es un UUID válido' })

  try {
    const { rows } = await query<{ id: string; name: string }>(
      `SELECT id::text, name FROM proyectos WHERE id = $1::uuid LIMIT 1`,
      [parsed.clientId]
    )
    const proyecto = rows[0]
    if (!proyecto) {
      return res.status(404).json({ error: 'client_id no corresponde a ningún proyecto' })
    }

    const out = await ingestIncident({
      proyectoId: proyecto.id,
      error: parsed.error,
      payload: req.body,
    })

    if (out.notified) {
      await alertIncident({
        proyectoId: proyecto.id,
        proyectoName: proyecto.name,
        error: out.incident.error_text,
        incidentId: out.incident.id,
      })
    }

    return res.status(out.duplicate ? 200 : 201).json({
      ok: true,
      duplicate: out.duplicate,
      notified: out.notified,
      incident_id: out.incident.id,
      occurrences: out.incident.occurrences,
      status: out.incident.status,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    if (msg.includes('retencion_incidents') || msg.includes('does not exist')) {
      return res.status(503).json({ error: 'Falta migrar retencion_incidents' })
    }
    console.error('[webhooks/incidents]', err)
    return res.status(500).json({ error: msg })
  }
}
