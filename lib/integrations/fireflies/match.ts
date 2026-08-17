import { prisma } from '@/lib/prisma'
import type { FirefliesParticipant } from '@/lib/integrations/fireflies/client'

export type CrmMatchHit = {
  contactId: number
  leadId: number | null
  email: string
  empresa: string | null
  nombre: string | null
}

export type CrmMatchResult =
  | {
      kind: 'none'
    }
  | {
      kind: 'contact_only'
      contactId: number
      email: string
      hits: CrmMatchHit[]
    }
  | {
      kind: 'lead'
      leadId: number
      contactId: number
      email: string
      hits: CrmMatchHit[]
    }
  | {
      kind: 'ambiguous_leads'
      hits: CrmMatchHit[]
      leadIds: number[]
    }

/** @deprecated Prefer matchCrmFromParticipants */
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

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'outlook.es',
  'yahoo.com',
  'yahoo.es',
  'icloud.com',
  'live.com',
  'msn.com',
  'proton.me',
  'protonmail.com',
  'me.com',
  'aol.com',
])

export function emailDomain(email: string | null | undefined): string | null {
  const e = normEmail(email)
  if (!e) return null
  const domain = e.split('@')[1]
  return domain || null
}

export function isGenericEmailDomain(domain: string | null | undefined): boolean {
  if (!domain) return true
  return GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase())
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
 * Empareja reunión → contacto / lead por email de participantes externos.
 * - Solo contacto (sin lead) → contact_only
 * - Un lead → lead
 * - Varios leads distintos → ambiguous_leads (IA decide después)
 */
export async function matchCrmFromParticipants(
  participants: FirefliesParticipant[]
): Promise<CrmMatchResult> {
  const emails = clientEmailsFromParticipants(participants)
  if (emails.length === 0) return { kind: 'none' }

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

  const hits: CrmMatchHit[] = []
  for (const ct of contacts) {
    const email = normEmail(ct.email)
    if (!email) continue
    const lead = ct.leads[0] || null
    hits.push({
      contactId: ct.id,
      leadId: lead?.id ?? null,
      email,
      empresa: ct.empresa ?? null,
      nombre: ct.nombre ?? null,
    })
  }

  if (hits.length === 0) {
    // Fallback: dominio corporativo único (no Gmail/Hotmail) → un solo contacto
    const companyDomains = emails
      .map((e) => emailDomain(e))
      .filter((d): d is string => {
        if (!d) return false
        if (isGenericEmailDomain(d)) return false
        return !internalDomains().includes(d)
      })
    const uniqueDomains = Array.from(new Set(companyDomains))
    if (uniqueDomains.length === 1) {
      const domain = uniqueDomains[0]
      const byDomain = await prisma.contact.findMany({
        where: { email: { endsWith: `@${domain}`, mode: 'insensitive' } },
        include: { leads: { take: 1, orderBy: { updated_at: 'desc' } } },
        take: 8,
      })
      if (byDomain.length === 1) {
        const ct = byDomain[0]
        const email = normEmail(ct.email) || emails[0]
        const lead = ct.leads[0] || null
        if (lead) {
          return {
            kind: 'lead',
            leadId: lead.id,
            contactId: ct.id,
            email,
            hits: [
              {
                contactId: ct.id,
                leadId: lead.id,
                email,
                empresa: ct.empresa ?? null,
                nombre: ct.nombre ?? null,
              },
            ],
          }
        }
        return {
          kind: 'contact_only',
          contactId: ct.id,
          email,
          hits: [
            {
              contactId: ct.id,
              leadId: null,
              email,
              empresa: ct.empresa ?? null,
              nombre: ct.nombre ?? null,
            },
          ],
        }
      }
    }
    return { kind: 'none' }
  }

  const leadHits = hits.filter((h) => h.leadId != null) as Array<
    CrmMatchHit & { leadId: number }
  >
  const uniqueLeadIds = Array.from(new Set(leadHits.map((h) => h.leadId)))

  if (uniqueLeadIds.length === 0) {
    const primary = hits[0]
    return {
      kind: 'contact_only',
      contactId: primary.contactId,
      email: primary.email,
      hits,
    }
  }

  if (uniqueLeadIds.length === 1) {
    const hit = leadHits[0]
    return {
      kind: 'lead',
      leadId: hit.leadId,
      contactId: hit.contactId,
      email: hit.email,
      hits,
    }
  }

  return {
    kind: 'ambiguous_leads',
    hits,
    leadIds: uniqueLeadIds,
  }
}

/**
 * Empareja reunión → lead por email (compat).
 * Contactos sin lead y ambigüedad → null (pending_match).
 */
export async function matchLeadFromParticipants(
  participants: FirefliesParticipant[]
): Promise<LeadMatchResult> {
  const m = await matchCrmFromParticipants(participants)
  if (m.kind !== 'lead') return null
  return {
    leadId: m.leadId,
    contactId: m.contactId,
    email: m.email,
    reason: `email:${m.email}`,
  }
}
