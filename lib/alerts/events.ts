import { notify } from '@/lib/alerts'

function eur(n: number): string {
  return `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

const ORIGEN: Record<string, string> = {
  web_cal: 'Cal.com',
  cold_calling: 'Cold calling',
  web_form: 'Web',
  formulario: 'Web',
  crm: 'CRM',
}

export async function alertNewLead(input: {
  leadId: number
  name?: string | null
  company?: string | null
  email?: string | null
  origin?: string | null
}): Promise<void> {
  const who = [input.name, input.company].filter(Boolean).join(' · ') || input.email || `#${input.leadId}`
  const origin = input.origin ? ORIGEN[input.origin] || input.origin : null
  await notify({
    kind: 'lead.nuevo',
    title: `Nuevo lead: ${who}`,
    body: [origin, input.email].filter(Boolean).join(' · ') || null,
    link: `/leads/${input.leadId}`,
    severity: 'info',
    dedupeKey: `lead:${input.leadId}`,
  })
}

export async function alertCalBooking(input: {
  name?: string | null
  email?: string | null
  title?: string | null
  when?: string | null
  uid: string
}): Promise<void> {
  const when = input.when
    ? new Date(input.when).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
    : null
  await notify({
    kind: 'lead.reunion',
    title: `Reunión Cal.com: ${input.name || input.email || 'sin nombre'}`,
    body: [input.title, when, input.email].filter(Boolean).join(' · ') || null,
    link: '/leads/reuniones',
    severity: 'info',
    dedupeKey: `calcom:${input.uid}`,
  })
}

export async function alertBlogPublished(title: string, postId: string, url?: string | null): Promise<void> {
  await notify({
    kind: 'blog.publicado',
    title: `Blog publicado: ${title}`,
    body: url || null,
    link: '/marketing',
    severity: 'info',
    dedupeKey: `blog-pub:${postId}`,
  })
}

export async function alertBlogNeedsReview(title: string, postId: string, detail?: string | null): Promise<void> {
  await notify({
    kind: 'blog.revision',
    title: `Blog pendiente de revisión: ${title}`,
    body: detail || null,
    link: '/marketing',
    severity: 'info',
    dedupeKey: `blog-rev:${postId}`,
  })
}

export async function alertBlogFailed(title: string, postId: string, error: string): Promise<void> {
  await notify({
    kind: 'blog.error',
    title: `Blog: falló la subida de «${title}»`,
    body: error.slice(0, 400),
    link: '/marketing',
    severity: 'warning',
    dedupeKey: `blog-err:${postId}:${error.slice(0, 40)}`,
  })
}

export async function alertBlogBudget(limitUsd: number, month: string): Promise<void> {
  await notify({
    kind: 'blog.presupuesto',
    title: 'Blog: presupuesto del mes agotado',
    body: `Se ha llegado a ${limitUsd} $ en ${month}. No se generan artículos nuevos.`,
    link: '/marketing',
    severity: 'warning',
    dedupeKey: `blog-budget:${month}`,
  })
}

export async function alertMoneyIn(input: {
  title: string
  amount: number
  detail?: string | null
  link?: string
  dedupeKey: string
}): Promise<void> {
  await notify({
    kind: 'finanzas.cobro',
    title: input.title,
    body: [eur(input.amount), input.detail].filter(Boolean).join(' · ') || eur(input.amount),
    link: input.link || '/finances/incomes',
    severity: 'info',
    dedupeKey: input.dedupeKey,
  })
}

export async function alertMoneyOut(input: {
  title: string
  amount: number
  detail?: string | null
  link?: string
  dedupeKey: string
}): Promise<void> {
  await notify({
    kind: 'finanzas.gasto',
    title: input.title,
    body: [eur(input.amount), input.detail].filter(Boolean).join(' · ') || eur(input.amount),
    link: input.link || '/finances/expenses',
    severity: 'info',
    dedupeKey: input.dedupeKey,
  })
}

export async function alertBankDigest(input: {
  credits: number
  creditEur: number
  debits: number
  debitEur: number
}): Promise<void> {
  if (!input.credits && !input.debits) return
  const parts: string[] = []
  if (input.credits) parts.push(`${input.credits} ingreso(s) +${eur(input.creditEur)}`)
  if (input.debits) parts.push(`${input.debits} cargo(s) ${eur(input.debitEur)}`)
  await notify({
    kind: 'finanzas.banco',
    title: 'Nuevos movimientos en el banco',
    body: parts.join(' · '),
    link: '/finances',
    severity: 'info',
    dedupeKey: `banco:${new Date().toISOString().slice(0, 10)}:${input.credits}:${input.debits}`,
  })
}

export async function alertUserWorking(input: {
  userName: string
  action: 'started' | 'done' | 'review'
  title: string
  kind: 'asignacion' | 'ticket' | 'tarea'
  link: string
  id: string
}): Promise<void> {
  const verb =
    input.action === 'started'
      ? 'está trabajando en'
      : input.action === 'done'
        ? 'ha terminado'
        : 'pide revisión de'
  await notify({
    kind: `trabajo.${input.kind}`,
    title: `${input.userName} ${verb}: ${input.title}`,
    body: input.kind === 'ticket' ? 'Ticket' : input.kind === 'tarea' ? 'Tarea de proyecto' : 'Asignación',
    link: input.link,
    severity: 'info',
    dedupeKey: `trabajo:${input.kind}:${input.id}:${input.action}`,
  })
}
