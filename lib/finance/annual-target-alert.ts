import { prisma } from '@/lib/prisma'
import { opsLink, sendOpsAlert } from '@/lib/ops-alerts'
import { fmtEur } from './chart-theme'
import { ensureAnnualTargetColumn, getAnnualRevenueTarget } from './annual-target'
import { sumBankCobrosYtd } from './bank-cobros'

export function annualGoalAlertKey(year: number, target: number): string {
  return `${year}:${Math.round(target)}`
}

export function formatAnnualGoalReachedAlert(input: {
  year: number
  target: number
  invoicedYtd: number
}): { subject: string; text: string; html: string; telegramHtml: string } {
  const targetLabel = fmtEur(input.target)
  const ytdLabel = fmtEur(input.invoicedYtd)
  const over = Math.max(0, Math.round(input.invoicedYtd - input.target))
  const overLine =
    over > 0 ? `Habéis superado la meta por ${fmtEur(over)}.` : 'Habéis llegado exactamente a la meta.'
  const finances = opsLink('/finances#objetivo-anual')
  const dashboard = opsLink('/dashboard')
  const subject = `Objetivo anual ${input.year} alcanzado (${targetLabel})`
  const body = [
    `Este año ya estáis en ${ytdLabel} de cobros (entradas de banco).`,
    `Meta: ${targetLabel}.`,
    overLine,
  ].join('\n')
  const safe = (s: string) => s.replace(/</g, '')
  return {
    subject,
    text: `${body}\n\nFinanzas: ${finances}\nDashboard: ${dashboard}`,
    html: `<p>${safe(body).replace(/\n/g, '<br/>')}</p><p><a href="${finances}">Ver en Finanzas</a> · <a href="${dashboard}">Dashboard</a></p>`,
    telegramHtml: `<b>${safe(subject)}</b>\n${safe(body)}\n${finances}`,
  }
}

export async function sumInvoicedYtd(now = new Date()): Promise<number> {
  return sumBankCobrosYtd(now)
}

/** Aviso único por año + meta. No bloquea facturas si falla el canal. */
export async function maybeNotifyAnnualGoalReached(opts?: {
  ytd?: number
  target?: number
  now?: Date
}): Promise<{ sent: boolean }> {
  const now = opts?.now ?? new Date()
  const year = now.getFullYear()
  const target = opts?.target && opts.target > 0 ? opts.target : await getAnnualRevenueTarget()
  const ytd = opts?.ytd != null ? opts.ytd : await sumInvoicedYtd(now)
  if (!(ytd >= target) || target <= 0) return { sent: false }

  const key = annualGoalAlertKey(year, target)
  await ensureAnnualTargetColumn()
  const claimed = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `UPDATE financial_settings
     SET annual_goal_alert_key = $1, updated_at = NOW()
     WHERE id = 1
       AND (annual_goal_alert_key IS DISTINCT FROM $1)
     RETURNING id`,
    key
  )
  if (!claimed[0]) return { sent: false }

  try {
    await sendOpsAlert({
      ...formatAnnualGoalReachedAlert({ year, target, invoicedYtd: ytd }),
      url: '/finances#objetivo-anual',
    })
    return { sent: true }
  } catch (e) {
    console.warn('[annual-goal] aviso', e instanceof Error ? e.message : e)
    return { sent: false }
  }
}

export function scheduleAnnualGoalCheck(opts?: {
  ytd?: number
  target?: number
  now?: Date
}): void {
  void maybeNotifyAnnualGoalReached(opts).catch((e) => {
    console.warn('[annual-goal] check', e instanceof Error ? e.message : e)
  })
}
