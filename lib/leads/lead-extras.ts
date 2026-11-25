import { query } from '@/lib/db'

/**
 * Extras de la ficha de lead:
 * - Correos adicionales: a veces el cliente escribe desde otra cuenta (la de la empresa,
 *   la de un socio…). Todos cuentan para traer correos y reuniones.
 * - Avisos descartados: el equipo puede quitar un aviso que ya no aplica.
 */

let ready: Promise<void> | null = null
function ensureTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS lead_extra_emails (
          lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
          email      TEXT NOT NULL,
          created_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (lead_id, email)
        )`)
      await query(`CREATE INDEX IF NOT EXISTS idx_lead_extra_emails_email ON lead_extra_emails (email)`)
      await query(`
        CREATE TABLE IF NOT EXISTS lead_alert_dismissals (
          lead_id      INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
          alert_id     TEXT NOT NULL,
          dismissed_by TEXT,
          dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (lead_id, alert_id)
        )`)
      await query(`
        CREATE TABLE IF NOT EXISTS lead_email_imports (
          lead_id     INTEGER PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
          imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          found       INTEGER NOT NULL DEFAULT 0
        )`)
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  return ready
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function normalizeEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase()
  return EMAIL_RE.test(e) ? e : null
}

export async function listExtraEmails(leadId: number): Promise<string[]> {
  await ensureTables()
  const { rows } = await query<{ email: string }>(
    `SELECT email FROM lead_extra_emails WHERE lead_id = $1 ORDER BY created_at`,
    [leadId]
  )
  return rows.map((r) => r.email)
}

export async function addExtraEmail(leadId: number, email: string, by: string | null): Promise<void> {
  await ensureTables()
  await query(
    `INSERT INTO lead_extra_emails (lead_id, email, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [leadId, email, by]
  )
}

export async function removeExtraEmail(leadId: number, email: string): Promise<void> {
  await ensureTables()
  await query(`DELETE FROM lead_extra_emails WHERE lead_id = $1 AND email = $2`, [leadId, email])
}

/** Correo principal del contacto + los adicionales, sin repetir. */
export async function allLeadEmails(leadId: number): Promise<string[]> {
  await ensureTables()
  const { rows } = await query<{ email: string | null }>(
    `SELECT lower(c.email) AS email FROM leads l JOIN contacts c ON c.id = l.contact_id WHERE l.id = $1
     UNION
     SELECT email FROM lead_extra_emails WHERE lead_id = $1`,
    [leadId]
  )
  return Array.from(new Set(rows.map((r) => r.email).filter((e): e is string => Boolean(e))))
}

/** Leads (con su contacto) a los que pertenece alguno de estos correos como correo adicional. */
export async function leadsByExtraEmails(
  emails: string[]
): Promise<{ leadId: number; contactId: number }[]> {
  if (!emails.length) return []
  await ensureTables()
  const { rows } = await query<{ lead_id: number; contact_id: number }>(
    `SELECT DISTINCT e.lead_id, l.contact_id
       FROM lead_extra_emails e JOIN leads l ON l.id = e.lead_id
      WHERE e.email = ANY($1::text[])`,
    [emails.map((e) => e.toLowerCase())]
  )
  return rows.map((r) => ({ leadId: r.lead_id, contactId: r.contact_id }))
}

export async function lastEmailImport(leadId: number): Promise<{ imported_at: string; found: number } | null> {
  await ensureTables()
  const { rows } = await query<{ imported_at: Date; found: number }>(
    `SELECT imported_at, found FROM lead_email_imports WHERE lead_id = $1`,
    [leadId]
  )
  return rows[0] ? { imported_at: new Date(rows[0].imported_at).toISOString(), found: rows[0].found } : null
}

export async function markEmailImport(leadId: number, found: number): Promise<void> {
  await ensureTables()
  await query(
    `INSERT INTO lead_email_imports (lead_id, imported_at, found) VALUES ($1, NOW(), $2)
     ON CONFLICT (lead_id) DO UPDATE SET imported_at = NOW(), found = EXCLUDED.found`,
    [leadId, found]
  )
}

export async function dismissedAlertIds(leadId: number): Promise<Set<string>> {
  try {
    await ensureTables()
    const { rows } = await query<{ alert_id: string }>(
      `SELECT alert_id FROM lead_alert_dismissals WHERE lead_id = $1`,
      [leadId]
    )
    return new Set(rows.map((r) => r.alert_id))
  } catch {
    return new Set()
  }
}

export async function dismissAlert(leadId: number, alertId: string, by: string | null): Promise<void> {
  await ensureTables()
  await query(
    `INSERT INTO lead_alert_dismissals (lead_id, alert_id, dismissed_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [leadId, alertId.slice(0, 200), by]
  )
}
