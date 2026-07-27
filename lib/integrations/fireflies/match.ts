import { prisma } from '@/lib/prisma'
import type { FirefliesParticipant } from '@/lib/integrations/fireflies/client'

export type LeadMatchResult = {
  leadId: number
  contactId: number
  email: string
  reason: string
} | null

function normEmail(e: string | null | undefined): string | null {
  if (!e) return null
  const v = e.trim().toLowerCase()
  return v.includes('@') ? v : null
}

function internalDomains(): string[] {
  const fromEnv = process.env.FIREFLIES_INTERNAL_EMAIL_DOMAINS?.trim()
  if (fromEnv) {
    return fromEnv
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean)
  }
  return ['agenciabuffalo.es']
}

function extraInternalEmails(): Set<string> {
  const set = new Set<string>()
  const admin = process.env.CRM_ADMIN_EMAIL?.trim().toLowerCase()
  if (admin) set.add(admin)
  const googleAdmins = process.env.GOOGLE_ADMIN_EMAILS?.split(',') || []
  for (const e of googleAdmins) {
    const n = normEmail(e)
    if (n) set.add(n)
  }
  return set
}

export function isInternalParticipantEmail(email: string | null | undefined): boolean {
  const e = normEmail(email)
  if (!e) return false
  if (extraInternalEmails().has(e)) return true
  const domain = e.split('@')[1]
  return internalDomains().includes(domain)
}

/** Emails de clientes (excluye Buffalo / internos). */
export function clientEmailsFromParticipants(participants: FirefliesParticipant[]): string[] {
  const set = new Set<string>()
  for (const p of participants) {
    const e = normEmail(p.email)
    if (!e || isInternalParticipantEmail(e)) continue
    set.add(e)
  }
  return Array.from(set)
}

/**
 * Empareja reunión → lead por email de participantes externos.
 * Si hay varios leads distintos, no asigna (queda pending_match).
 */
export async function matchLeadFromParticipants(
  participants: FirefliesParticipant[]
): Promise<LeadMatchResult> {
  const emails = clientEmailsFromParticipants(participants)
  if (emails.length === 0) return null

  const contacts = await prisma.contact.findMany({
    where: {
      OR: emails.map((email) => ({
        email: { equals: email, mode: 'insensitive' as const },
      })),
    },
    include: {
      leads: { take: 1, orderBy: { updated_at: 'desc' } },
    },
  })

  const hits: { leadId: number; contactId: number; email: string }[] = []
  for (const ct of contacts) {
    const email = normEmail(ct.email)
    const lead = ct.leads[0]
    if (!email || !lead) continue
    hits.push({ leadId: lead.id, contactId: ct.id, email })
  }

  if (hits.length === 0) return null

  const uniqueLeadIds = Array.from(new Set(hits.map((h) => h.leadId)))
  if (uniqueLeadIds.length > 1) {
    return null
  }

  const hit = hits[0]
  return {
    leadId: hit.leadId,
    contactId: hit.contactId,
    email: hit.email,
    reason: `email:${hit.email}`,
  }
}
