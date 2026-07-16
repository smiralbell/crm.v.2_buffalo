import type { ComercialPersona } from '@/lib/coldcall/comercial-persona'
import { DEFAULT_CEO_PERSONA, interpolateCallText } from '@/lib/coldcall/comercial-persona'
import { presentationMessageLines } from '@/lib/coldcall/presentation-link'

export type WhatsAppTemplateKind = 'interesado' | 'no_interesado'
export type ContactTemplateKind = WhatsAppTemplateKind | 'info'

export {
  BUFFALO_PRESENTATION_URL,
  DEFAULT_PRESENTATION_URL,
  resolvePresentationUrl,
} from '@/lib/coldcall/presentation-link'

export function firstName(nombre: string, firstNameField?: string | null): string {
  if (firstNameField?.trim()) return firstNameField.trim()
  return nombre.trim().split(/\s+/)[0] || nombre.trim()
}

function signOff(persona: ComercialPersona): string[] {
  if (persona.presentAsCeo && persona.titleLine) {
    return ['Un saludo,', persona.fullName, persona.titleLine, 'Buffalo AI']
  }
  return ['Un saludo,', `${persona.fullName}`, 'Buffalo AI']
}

export function defaultInfoTemplate(
  lead: {
    nombre: string
    first_name?: string | null
    empresa?: string | null
  },
  persona: ComercialPersona = DEFAULT_CEO_PERSONA,
  presentationUrl?: string | null
): string {
  const name = firstName(lead.nombre, lead.first_name)
  const empresa = lead.empresa?.trim()
  const raw = [
    `Hola ${name},`,
    '',
    `{{speaker_short_es}}. Gracias por tu tiempo en la llamada.`,
    empresa
      ? `Como comentamos, te envío información sobre cómo Buffalo ayuda a empresas como ${empresa} con IA y automatización.`
      : 'Como comentamos, te envío información sobre cómo Buffalo ayuda a empresas con IA y automatización.',
    ...presentationMessageLines(presentationUrl),
    '',
    'Si te encaja, podemos hablar 15 minutos esta semana: nos ponemos cara, nos conocemos y vemos si podría haber algún encaje.',
    '',
    ...signOff(persona),
  ].join('\n')
  return interpolateCallText(raw, persona)
}

export function defaultWhatsAppTemplate(
  kind: WhatsAppTemplateKind,
  lead: { nombre: string; first_name?: string | null; empresa?: string | null },
  persona: ComercialPersona = DEFAULT_CEO_PERSONA,
  presentationUrl?: string | null
): string {
  const name = firstName(lead.nombre, lead.first_name)
  const empresa = lead.empresa?.trim()

  if (kind === 'interesado') {
    return [
      `Hola ${name},`,
      '',
      'Gracias por tu tiempo en la llamada de hoy.',
      empresa
        ? `Como comentamos, en Buffalo ayudamos a empresas como ${empresa} con soluciones de IA y automatización.`
        : 'Como comentamos, en Buffalo ayudamos a empresas con soluciones de IA y automatización.',
      ...presentationMessageLines(presentationUrl),
      '',
      'Te comparto la información y, si te encaja, podemos agendar una breve reunión esta semana.',
      '',
      'Un saludo.',
    ].join('\n')
  }

  return [
    `Hola ${name},`,
    '',
    'Gracias por atendernos hoy.',
    'Quedamos a tu disposición por si en el futuro necesitáis apoyo.',
    '',
    'Un saludo.',
  ].join('\n')
}

export function contactTemplate(
  kind: ContactTemplateKind,
  lead: { nombre: string; first_name?: string | null; empresa?: string | null },
  persona: ComercialPersona = DEFAULT_CEO_PERSONA,
  presentationUrl?: string | null
): string {
  if (kind === 'info') return defaultInfoTemplate(lead, persona, presentationUrl)
  return defaultWhatsAppTemplate(kind, lead, persona, presentationUrl)
}

/** Cuenta Gmail por defecto si el comercial no tiene una configurada. */
export const FALLBACK_COLDCALL_GMAIL_SENDER =
  process.env.NEXT_PUBLIC_COLDCALL_GMAIL_SENDER || 'sergimasoliver@gmail.com'

export function buildMailtoUrl(
  email: string | null | undefined,
  subject: string,
  body: string
): string | null {
  if (!email?.trim()) return null
  return `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Abre Gmail en el navegador con el borrador preparado (no usa Mail.app). */
export function buildGmailComposeUrl(
  email: string | null | undefined,
  subject: string,
  body: string,
  senderGmail?: string | null
): string | null {
  if (!email?.trim()) return null
  const params = new URLSearchParams({
    view: 'cm',
    fs: '1',
    to: email.trim(),
    su: subject,
    body,
  })
  const sender = senderGmail?.trim()
  if (sender) params.set('authuser', sender)
  return `https://mail.google.com/mail/?${params.toString()}`
}

export function openGmailCompose(
  email: string | null | undefined,
  subject: string,
  body: string,
  senderGmail?: string | null
): boolean {
  const url = buildGmailComposeUrl(email, subject, body, senderGmail)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
