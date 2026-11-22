import { crmPublicBaseUrl } from '@/lib/ops-alerts'
import { runAgent } from './agent'
import { alertChatIds, isAgentEnabled, webhookSecret } from './config'
import { deliver } from './handler'
import { claimDueReminders, updateReminder, type Reminder } from './store'
import { getWebhookInfo, setCommands, setWebhook } from './telegram-api'
import { sendChatText } from './channel'
import { allowedWhatsAppNumbers, isWhatsAppChat, phoneFromChatId, waChatId } from '@/lib/whatsapp-agent/config'
import { runTeamAgent } from '@/lib/team-agent/agent'
import { findTeamMemberByPhone } from '@/lib/team-agent/identity'
import { startNotificationScheduler } from '@/lib/notifications/notify'
import type { AgentContext } from './tools'

declare global {
  // eslint-disable-next-line no-var
  var __buffaloTelegramAgent: boolean | undefined
  // eslint-disable-next-line no-var
  var __buffaloAgentReminders: boolean | undefined
}

export function webhookUrl(): string {
  return `${crmPublicBaseUrl()}/api/webhooks/telegram`
}

/** Apunta el bot al webhook del CRM si no lo está ya. */
export async function ensureWebhook(force = false): Promise<{ url: string; changed: boolean }> {
  const url = webhookUrl()
  const info = await getWebhookInfo()
  if (!force && info.url === url) return { url, changed: false }
  await setWebhook(url, webhookSecret())
  await setCommands()
  return { url, changed: true }
}

/** Siguiente ejecución de un aviso, o null si no se repite. Mantiene la hora de Madrid aunque cambie el horario de verano. */
export function nextRunFor(r: Pick<Reminder, 'repetir' | 'next_run_at'> & { intervalo_dias?: number | null }, now = new Date()): Date | null {
  if (r.repetir === 'nunca') return null
  let next = new Date(r.next_run_at)
  const day = 24 * 60 * 60 * 1000
  const every = r.intervalo_dias ?? 0
  const step = (d: Date): Date => {
    const out = new Date(d)
    if (r.repetir === 'diario' || r.repetir === 'laborables') out.setTime(out.getTime() + day)
    else if (r.repetir === 'semanal') out.setTime(out.getTime() + 7 * day)
    else if (r.repetir === 'cada_n_dias') out.setTime(out.getTime() + every * day)
    else out.setUTCMonth(out.getUTCMonth() + 1)
    out.setTime(out.getTime() + (madridOffsetMin(d) - madridOffsetMin(out)) * 60_000)
    return out
  }
  if (!['diario', 'laborables', 'semanal', 'mensual', 'cada_n_dias'].includes(r.repetir)) return null
  // «Cada N días» sin un N válido no se repite: mejor apagarlo que mandarlo cada día
  if (r.repetir === 'cada_n_dias' && (!Number.isInteger(every) || every < 2)) return null
  while (next.getTime() <= now.getTime() || (r.repetir === 'laborables' && [0, 6].includes(madridWeekday(next)))) {
    next = step(next)
  }
  return next
}

/** Minutos que Madrid va por delante de UTC en esa fecha (60 o 120). */
function madridOffsetMin(d: Date): number {
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
  return Math.round((local.getTime() - utc.getTime()) / 60_000)
}

function madridWeekday(d: Date): number {
  const name = d.toLocaleDateString('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' })
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/** A quién va un aviso: su chat, o todos los socios por el mismo canal en que se pidió. */
function reminderTargets(r: Reminder): string[] {
  if (r.destino !== 'socios') return [String(r.chat_id)]
  if (isWhatsAppChat(r.chat_id)) {
    return Array.from(allowedWhatsAppNumbers()).map((n) => String(waChatId(n)))
  }
  return alertChatIds()
}

/**
 * Aviso de alguien del equipo (su chat de WhatsApp, que no es de un socio): lo
 * hace SU agente, con sus permisos. Si ya no tiene acceso, el aviso se apaga.
 */
async function runTeamReminder(r: Reminder): Promise<void> {
  const phone = phoneFromChatId(r.chat_id)
  const member = await findTeamMemberByPhone(phone)
  if (!member) {
    await updateReminder(r.id, r.chat_id, { activo: false })
    return
  }
  if (r.tipo === 'texto') {
    await sendChatText(String(r.chat_id), `Recordatorio: ${r.texto}`)
    return
  }
  const ctx: AgentContext = {
    chatId: r.chat_id,
    userId: Number(phone),
    userName: member.name,
    pending: [],
    documents: [],
    actions: [],
    scheduled: true,
  }
  let reply: string
  try {
    reply = await runTeamAgent(ctx, member, [], `Aviso programado #${r.id}. Hazlo y responde con el resultado: ${r.texto}`)
  } catch (e) {
    console.warn('[team-agent] aviso', r.id, e instanceof Error ? e.message : e)
    reply = `No he podido preparar tu aviso #${r.id}. Lo intentaré la próxima vez.`
  }
  await deliver(ctx, reply)
}

async function runReminder(r: Reminder): Promise<void> {
  if (isWhatsAppChat(r.chat_id) && !allowedWhatsAppNumbers().has(phoneFromChatId(r.chat_id))) {
    return runTeamReminder(r)
  }
  const targets = reminderTargets(r)
  if (r.tipo === 'texto') {
    for (const chat of targets) await sendChatText(chat, `Recordatorio: ${r.texto}`)
    return
  }
  // Tarea: el agente la ejecuta y manda el resultado a cada destino.
  for (const chat of targets) {
    const ctx: AgentContext = {
      chatId: Number(chat),
      userId: null,
      userName: 'Aviso programado',
      pending: [],
      documents: [],
      actions: [],
      scheduled: true,
    }
    let reply: string
    try {
      reply = await runAgent(ctx, [], `Aviso programado #${r.id}. Haz esta tarea y responde con el resultado para los socios: ${r.texto}`)
    } catch (e) {
      reply = `No he podido completar el aviso #${r.id}: ${e instanceof Error ? e.message : String(e)}`
    }
    await deliver(ctx, reply)
  }
}

async function tick(): Promise<void> {
  const due = await claimDueReminders((r) => nextRunFor(r))
  for (const r of due) {
    await runReminder(r).catch((e) => console.warn('[telegram-agent] aviso', r.id, e instanceof Error ? e.message : e))
  }
}

/** Revisa los avisos programados cada minuto. Una vez por proceso, lo arranque Telegram o WhatsApp. */
export function startAgentReminders(): void {
  if (globalThis.__buffaloAgentReminders) return
  globalThis.__buffaloAgentReminders = true
  startNotificationScheduler()
  const run = () => void tick().catch((e) => console.warn('[telegram-agent] avisos', e instanceof Error ? e.message : e))
  setTimeout(run, 20_000)
  setInterval(run, 60_000)
}

/** Arranca una vez por proceso: registra el webhook y revisa avisos cada minuto. */
export function startTelegramAgent(): void {
  if (globalThis.__buffaloTelegramAgent || !isAgentEnabled()) return
  globalThis.__buffaloTelegramAgent = true

  if (process.env.TELEGRAM_AGENT_AUTO_WEBHOOK !== '0') {
    void ensureWebhook().catch((e) => console.warn('[telegram-agent] webhook', e instanceof Error ? e.message : e))
  }
  startAgentReminders()
}
