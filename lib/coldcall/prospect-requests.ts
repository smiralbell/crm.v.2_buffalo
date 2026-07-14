import { prisma } from '@/lib/prisma'

export const PROSPECT_REQUEST_MESSAGE = 'ME FALTAN PROSPECTOS SOLICITO UNA NUEVA BBDD'

export interface ProspectRequestRow {
  id: number
  requested_by_user_id: number
  campaign_id: number | null
  message: string
  status: 'pending' | 'resolved'
  resolved_by_user_id: number | null
  resolved_at: string | null
  created_at: string
  requester_name: string | null
  requester_email: string | null
  campaign_name: string | null
}

export async function createProspectRequest(input: {
  requestedByUserId: number
  campaignId?: number | null
}): Promise<{ created: boolean; request: ProspectRequestRow | null }> {
  const campaignId = input.campaignId ?? null

  const existing = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM coldcall_prospect_requests
    WHERE requested_by_user_id = ${input.requestedByUserId}
      AND status = 'pending'
      AND (
        (${campaignId}::int IS NULL AND campaign_id IS NULL)
        OR campaign_id = ${campaignId}
      )
    LIMIT 1
  `
  if (existing[0]) {
    const row = await getProspectRequestById(existing[0].id)
    return { created: false, request: row }
  }

  const inserted = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO coldcall_prospect_requests (
      requested_by_user_id, campaign_id, message
    ) VALUES (
      ${input.requestedByUserId},
      ${campaignId},
      ${PROSPECT_REQUEST_MESSAGE}
    )
    RETURNING id
  `

  const row = await getProspectRequestById(inserted[0].id)
  return { created: true, request: row }
}

async function getProspectRequestById(id: number): Promise<ProspectRequestRow | null> {
  const rows = await prisma.$queryRaw<
    {
      id: number
      requested_by_user_id: number
      campaign_id: number | null
      message: string
      status: string
      resolved_by_user_id: number | null
      resolved_at: Date | null
      created_at: Date
      requester_name: string | null
      requester_email: string | null
      campaign_name: string | null
    }[]
  >`
    SELECT
      r.id,
      r.requested_by_user_id,
      r.campaign_id,
      r.message,
      r.status,
      r.resolved_by_user_id,
      r.resolved_at,
      r.created_at,
      u.name AS requester_name,
      u.email AS requester_email,
      c.name AS campaign_name
    FROM coldcall_prospect_requests r
    LEFT JOIN crm_users u ON u.id = r.requested_by_user_id
    LEFT JOIN coldcall_campaigns c ON c.id = r.campaign_id
    WHERE r.id = ${id}
    LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  return {
    ...row,
    status: row.status as ProspectRequestRow['status'],
    resolved_at: row.resolved_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  }
}

export async function listPendingProspectRequests(): Promise<ProspectRequestRow[]> {
  const rows = await prisma.$queryRaw<
    {
      id: number
      requested_by_user_id: number
      campaign_id: number | null
      message: string
      status: string
      resolved_by_user_id: number | null
      resolved_at: Date | null
      created_at: Date
      requester_name: string | null
      requester_email: string | null
      campaign_name: string | null
    }[]
  >`
    SELECT
      r.id,
      r.requested_by_user_id,
      r.campaign_id,
      r.message,
      r.status,
      r.resolved_by_user_id,
      r.resolved_at,
      r.created_at,
      u.name AS requester_name,
      u.email AS requester_email,
      c.name AS campaign_name
    FROM coldcall_prospect_requests r
    LEFT JOIN crm_users u ON u.id = r.requested_by_user_id
    LEFT JOIN coldcall_campaigns c ON c.id = r.campaign_id
    WHERE r.status = 'pending'
    ORDER BY r.created_at ASC
  `

  return rows.map((row) => ({
    ...row,
    status: row.status as ProspectRequestRow['status'],
    resolved_at: row.resolved_at?.toISOString() ?? null,
    created_at: row.created_at.toISOString(),
  }))
}

export async function resolveProspectRequest(
  requestId: number,
  resolvedByUserId: number
): Promise<ProspectRequestRow | null> {
  await prisma.$executeRaw`
    UPDATE coldcall_prospect_requests SET
      status = 'resolved',
      resolved_by_user_id = ${resolvedByUserId},
      resolved_at = NOW()
    WHERE id = ${requestId} AND status = 'pending'
  `
  return getProspectRequestById(requestId)
}
