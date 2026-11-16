import { query } from '@/lib/db'
import { prisma } from '@/lib/prisma'
import { sendMail, isSmtpConfigured, getSmtpPublicStatus } from '@/lib/mail/smtp'
import { opsLink, sendOpsAlert } from '@/lib/ops-alerts'
import { renderInvoicePdf } from '@/lib/invoices/pdf'
import {
  DEFAULT_EMAIL_BODY,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_SEND_TIME,
  emailHtml,
  emailSendDate,
  fillTemplate,
  invoiceEmailVars,
  normalizeSendTime,
  parseEmailList,
} from '@/lib/invoices/recurring-email-template'

/**
 * Envío por email de las facturas recurrentes.
 *
 * Cada plantilla recurrente guarda su configuración (activado, para, cc, asunto,
 * mensaje, día y hora). Cuando se crea la factura del mes se pone en cola
 * (invoice_email_sends) para el día y la hora elegidos; el planificador de
 * recurrentes la manda con el PDF adjunto. El asunto, el mensaje y los
 * destinatarios se leen al enviar, así que los cambios valen también para lo que
 * ya está en cola.
 */

const MAX_ATTEMPTS = 3

let schemaReady = false

export async function ensureRecurringEmailSchema(): Promise<void> {
  if (schemaReady) return
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT FALSE`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS email_to TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS email_cc TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS email_reply_to TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS email_subject TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS email_body TEXT`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS email_send_day INTEGER`)
  await query(`ALTER TABLE recurring_invoices ADD COLUMN IF NOT EXISTS email_send_time TEXT`)
  await query(`
    CREATE TABLE IF NOT EXISTS invoice_email_sends (
      id SERIAL PRIMARY KEY,
      invoice_id INTEGER NOT NULL,
      recurring_id UUID,
      kind TEXT NOT NULL DEFAULT 'auto',
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ,
      sent_to TEXT,
      subject TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS invoice_email_sends_auto_once ON invoice_email_sends (invoice_id) WHERE kind = 'auto'`
  )
  await query(
    `CREATE INDEX IF NOT EXISTS invoice_email_sends_due ON invoice_email_sends (status, scheduled_at)`
  )
  await query(`CREATE INDEX IF NOT EXISTS invoice_email_sends_recurring ON invoice_email_sends (recurring_id, created_at)`)
  schemaReady = true
}

export type RecurringEmailSettings = {
  email_enabled: boolean
  email_to: string | null
  email_cc: string | null
  email_reply_to: string | null
  email_subject: string | null
  email_body: string | null
  email_send_day: number | null
  email_send_time: string | null
}

type TemplateRow = RecurringEmailSettings & {
  id: string
  name: string
  is_active: boolean
  issue_day: number
  client_email: string | null
  last_generated_invoice_id: number | null
  deleted_at: string | null
}

async function loadTemplate(recurringId: string): Promise<TemplateRow | null> {
  await ensureRecurringEmailSchema()
  const res = await query<TemplateRow>(
    `SELECT ri.id, ri.name, ri.is_active, ri.issue_day, ri.last_generated_invoice_id, ri.deleted_at::text AS deleted_at,
            ri.email_enabled, ri.email_to, ri.email_cc, ri.email_reply_to, ri.email_subject, ri.email_body,
            ri.email_send_day, ri.email_send_time,
            COALESCE(ri.client_email, i.client_email) AS client_email
       FROM recurring_invoices ri
       LEFT JOIN invoices i ON i.id = ri.source_invoice_id
      WHERE ri.id = $1
      LIMIT 1`,
    [recurringId]
  )
  return res.rows[0] ?? null
}

function sendTimeOf(t: Pick<RecurringEmailSettings, 'email_send_time'>): string {
  return normalizeSendTime(t.email_send_time) || DEFAULT_SEND_TIME
}

/** Fecha y hora (Madrid) en que toca mandar la factura emitida ese día. */
function scheduleSql(): string {
  return `(($1::date + $2::time) AT TIME ZONE 'Europe/Madrid')`
}

/**
 * Al crear la factura del mes: si la plantilla tiene el envío activado, la deja
 * en cola para su día y hora. Nunca falla la creación de la factura.
 */
export async function queueRecurringInvoiceEmail(recurringId: string, invoiceId: number, issueIso: string): Promise<void> {
  try {
    const t = await loadTemplate(recurringId)
    if (!t || !t.email_enabled) return
    const date = emailSendDate(issueIso, t.email_send_day)
    await query(
      `INSERT INTO invoice_email_sends (invoice_id, recurring_id, kind, status, scheduled_at)
       VALUES ($3, $4, 'auto', 'pending', ${scheduleSql()})
       ON CONFLICT (invoice_id) WHERE kind = 'auto' DO NOTHING`,
      [date, sendTimeOf(t), invoiceId, recurringId]
    )
  } catch (e) {
    console.warn('[recurring-email] no se pudo poner en cola', e instanceof Error ? e.message : e)
  }
}

/** Tras cambiar el día u hora: recoloca lo que aún está pendiente de esa plantilla. */
export async function rescheduleRecurringPending(recurringId: string): Promise<void> {
  const t = await loadTemplate(recurringId)
  if (!t) return
  if (!t.email_enabled) {
    await query(
      `UPDATE invoice_email_sends SET status = 'cancelled', error = 'Envío automático desactivado', updated_at = NOW()
        WHERE recurring_id = $1 AND kind = 'auto' AND status = 'pending'`,
      [recurringId]
    )
    return
  }
  const pending = await query<{ id: number; issue_date: string }>(
    `SELECT s.id, i.issue_date::text AS issue_date
       FROM invoice_email_sends s JOIN invoices i ON i.id = s.invoice_id
      WHERE s.recurring_id = $1 AND s.kind = 'auto' AND s.status = 'pending'`,
    [recurringId]
  )
  for (const row of pending.rows) {
    await query(
      `UPDATE invoice_email_sends SET scheduled_at = ${scheduleSql()}, updated_at = NOW() WHERE id = $3`,
      [emailSendDate(row.issue_date, t.email_send_day), sendTimeOf(t), row.id]
    )
  }
}

export type DeliverResult = { ok: true; to: string[]; subject: string } | { ok: false; error: string }

/**
 * Manda una factura con la configuración de su plantilla.
 * `testTo`: prueba a otra dirección (el asunto lleva «[PRUEBA]» y no cambia nada).
 */
async function deliver(
  t: TemplateRow,
  invoiceId: number | null,
  testTo?: string
): Promise<DeliverResult> {
  if (!isSmtpConfigured()) return { ok: false, error: 'El correo del CRM (SMTP) no está configurado' }

  const invoice = invoiceId ? await prisma.invoice.findUnique({ where: { id: invoiceId } }) : null
  if (invoiceId && (!invoice || invoice.deleted_at)) return { ok: false, error: 'La factura ya no existe' }

  const vars = invoice
    ? invoiceEmailVars({
        invoice_number: invoice.invoice_number,
        client_name: invoice.client_name,
        client_company_name: invoice.client_company_name,
        total: Number(invoice.total),
        issue_date: invoice.issue_date.toISOString().slice(0, 10),
        due_date: invoice.due_date ? invoice.due_date.toISOString().slice(0, 10) : null,
        services: invoice.services,
      })
    : null

  let to: string[]
  if (testTo) {
    to = parseEmailList(testTo).emails
    if (!to.length) return { ok: false, error: 'No hay un email válido para la prueba' }
  } else {
    to = parseEmailList(t.email_to || invoice?.client_email || t.client_email).emails
    if (!to.length) return { ok: false, error: 'No hay email del cliente: escríbelo en «Para»' }
  }
  const cc = testTo ? [] : parseEmailList(t.email_cc).emails
  const replyTo = parseEmailList(t.email_reply_to).emails[0]

  const fill = (s: string) => (vars ? fillTemplate(s, vars) : s)
  let subject = fill(t.email_subject?.trim() || DEFAULT_EMAIL_SUBJECT)
  let text = fill(t.email_body?.trim() || DEFAULT_EMAIL_BODY)
  if (testTo) {
    subject = `[PRUEBA] ${subject}`
    if (!invoice) text = `${text}\n\n(Prueba: todavía no hay ninguna factura de esta recurrente, así que no va el PDF. Los datos entre llaves se rellenarán con los de cada factura.)`
  }

  const attachments = []
  if (invoice) {
    const pdf = await renderInvoicePdf(invoice)
    attachments.push({ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' })
  }

  await sendMail({ to, cc: cc.length ? cc : undefined, replyTo, subject, text, html: emailHtml(text), attachments })
  return { ok: true, to: [...to, ...cc], subject }
}

async function markInvoiceSent(invoiceId: number): Promise<void> {
  await prisma.invoice.updateMany({ where: { id: invoiceId, status: 'draft' }, data: { status: 'sent' } })
}

/** Botones de la pantalla: «Enviar prueba» y «Enviar ahora» (la última factura). */
export async function sendRecurringEmailNow(
  recurringId: string,
  mode: 'test' | 'now',
  testTo?: string
): Promise<DeliverResult & { invoice_number?: string }> {
  const t = await loadTemplate(recurringId)
  if (!t || t.deleted_at) return { ok: false, error: 'Factura recurrente no encontrada' }
  const invoiceId = t.last_generated_invoice_id
  if (mode === 'now' && !invoiceId) return { ok: false, error: 'Todavía no se ha creado ninguna factura de esta recurrente' }

  const invoice = invoiceId
    ? await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { invoice_number: true } })
    : null
  let result: DeliverResult
  try {
    result = await deliver(t, invoiceId, mode === 'test' ? testTo || '' : undefined)
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : 'No se pudo enviar' }
  }

  if (invoiceId) {
    await query(
      `INSERT INTO invoice_email_sends (invoice_id, recurring_id, kind, status, attempts, sent_at, sent_to, subject, error)
       VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8)`,
      [
        invoiceId,
        recurringId,
        mode === 'test' ? 'test' : 'manual',
        result.ok ? 'sent' : 'failed',
        result.ok ? new Date() : null,
        result.ok ? result.to.join(', ') : null,
        result.ok ? result.subject : null,
        result.ok ? null : result.error,
      ]
    )
  }
  if (result.ok && mode === 'now' && invoiceId) {
    await markInvoiceSent(invoiceId)
    // Si estaba en cola, ya no hace falta mandarla otra vez
    await query(
      `UPDATE invoice_email_sends SET status = 'cancelled', error = 'Enviada a mano', updated_at = NOW()
        WHERE invoice_id = $1 AND kind = 'auto' AND status = 'pending'`,
      [invoiceId]
    )
  }
  return { ...result, invoice_number: invoice?.invoice_number }
}

/** Planificador: manda lo que ya toca. Devuelve cuántos se han enviado. */
export async function runDueInvoiceEmails(): Promise<number> {
  await ensureRecurringEmailSchema()

  // Un envío que se quedó a medias (el servidor se reinició mientras mandaba) no se repite solo
  await query(
    `UPDATE invoice_email_sends
        SET status = 'failed', error = 'Se cortó mientras se enviaba: comprueba si le llegó antes de reenviarla', updated_at = NOW()
      WHERE status = 'sending' AND updated_at < NOW() - INTERVAL '1 hour'`
  )

  const due = await query<{ id: number; invoice_id: number; recurring_id: string | null; attempts: number }>(
    `UPDATE invoice_email_sends
        SET status = 'sending', attempts = attempts + 1, updated_at = NOW()
      WHERE id IN (
        SELECT id FROM invoice_email_sends
         WHERE status = 'pending' AND scheduled_at <= NOW()
         ORDER BY scheduled_at
         LIMIT 10
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, invoice_id, recurring_id, attempts`
  )

  let sent = 0
  for (const job of due.rows) {
    const t = job.recurring_id ? await loadTemplate(job.recurring_id) : null
    if (!t || t.deleted_at || !t.is_active || !t.email_enabled) {
      await query(
        `UPDATE invoice_email_sends SET status = 'cancelled', error = $2, updated_at = NOW() WHERE id = $1`,
        [job.id, !t || t.deleted_at ? 'La recurrente ya no existe' : !t.is_active ? 'Recurrente en pausa' : 'Envío automático desactivado']
      )
      continue
    }

    let result: DeliverResult
    try {
      result = await deliver(t, job.invoice_id)
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : 'No se pudo enviar' }
    }

    if (result.ok) {
      sent += 1
      await query(
        `UPDATE invoice_email_sends
            SET status = 'sent', sent_at = NOW(), sent_to = $2, subject = $3, error = NULL, updated_at = NOW()
          WHERE id = $1`,
        [job.id, result.to.join(', '), result.subject]
      )
      await markInvoiceSent(job.invoice_id)
      continue
    }

    const retry = job.attempts < MAX_ATTEMPTS
    await query(
      `UPDATE invoice_email_sends
          SET status = $2, error = $3, updated_at = NOW(),
              scheduled_at = CASE WHEN $2 = 'pending' THEN NOW() + INTERVAL '30 minutes' ELSE scheduled_at END
        WHERE id = $1`,
      [job.id, retry ? 'pending' : 'failed', result.error]
    )
    if (!retry) {
      const inv = await prisma.invoice.findUnique({ where: { id: job.invoice_id }, select: { invoice_number: true } })
      await sendOpsAlert({
        subject: `No se pudo enviar la factura ${inv?.invoice_number ?? job.invoice_id}`,
        text: `La factura recurrente «${t.name}» no se ha podido enviar por email después de ${MAX_ATTEMPTS} intentos.\n\nMotivo: ${result.error}\n\nRevísala en ${opsLink('/invoices/recurring')}`,
        url: '/invoices/recurring',
      }).catch(() => {})
    }
  }
  return sent
}

export type InvoiceEmailSendRow = {
  id: number
  invoice_id: number
  invoice_number: string | null
  kind: 'auto' | 'manual' | 'test'
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'
  scheduled_at: string
  sent_at: string | null
  sent_to: string | null
  subject: string | null
  error: string | null
  attempts: number
}

export type RecurringEmailState = {
  settings: RecurringEmailSettings & { email_send_time: string }
  client_email: string | null
  issue_day: number
  last_invoice: { id: number; invoice_number: string; issue_date: string; status: string } | null
  sends: InvoiceEmailSendRow[]
  smtp: { configured: boolean; from: string | null }
}

export async function getRecurringEmailState(recurringId: string): Promise<RecurringEmailState | null> {
  const t = await loadTemplate(recurringId)
  if (!t || t.deleted_at) return null
  const last = t.last_generated_invoice_id
    ? await prisma.invoice.findUnique({
        where: { id: t.last_generated_invoice_id },
        select: { id: true, invoice_number: true, issue_date: true, status: true, deleted_at: true },
      })
    : null
  const sends = await query<InvoiceEmailSendRow>(
    `SELECT s.id, s.invoice_id, i.invoice_number, s.kind, s.status, s.scheduled_at::text AS scheduled_at,
            s.sent_at::text AS sent_at, s.sent_to, s.subject, s.error, s.attempts
       FROM invoice_email_sends s
       LEFT JOIN invoices i ON i.id = s.invoice_id
      WHERE s.recurring_id = $1
      ORDER BY s.created_at DESC
      LIMIT 12`,
    [recurringId]
  )
  const smtp = getSmtpPublicStatus()
  return {
    settings: {
      email_enabled: t.email_enabled,
      email_to: t.email_to,
      email_cc: t.email_cc,
      email_reply_to: t.email_reply_to,
      email_subject: t.email_subject,
      email_body: t.email_body,
      email_send_day: t.email_send_day,
      email_send_time: sendTimeOf(t),
    },
    client_email: t.client_email,
    issue_day: t.issue_day,
    last_invoice:
      last && !last.deleted_at
        ? {
            id: last.id,
            invoice_number: last.invoice_number,
            issue_date: last.issue_date.toISOString().slice(0, 10),
            status: last.status,
          }
        : null,
    sends: sends.rows,
    smtp: { configured: smtp.configured, from: smtp.configured ? (smtp as { from: string }).from : null },
  }
}

export async function updateRecurringEmailSettings(
  recurringId: string,
  patch: Partial<RecurringEmailSettings>
): Promise<boolean> {
  await ensureRecurringEmailSchema()
  const sets: string[] = []
  const values: unknown[] = []
  const set = (col: keyof RecurringEmailSettings, v: unknown) => {
    values.push(v)
    sets.push(`${col} = $${values.length}`)
  }
  for (const key of [
    'email_enabled',
    'email_to',
    'email_cc',
    'email_reply_to',
    'email_subject',
    'email_body',
    'email_send_day',
    'email_send_time',
  ] as const) {
    if (patch[key] !== undefined) set(key, patch[key])
  }
  if (!sets.length) return true
  values.push(recurringId)
  const res = await query(
    `UPDATE recurring_invoices SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length} AND deleted_at IS NULL RETURNING id`,
    values
  )
  if (!res.rowCount) return false
  await rescheduleRecurringPending(recurringId)
  return true
}
