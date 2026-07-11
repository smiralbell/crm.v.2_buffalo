export function normalizeWhatsAppPhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.length < 9) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (!digits.startsWith('34') && digits.length <= 9) digits = `34${digits}`
  return digits
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizeWhatsAppPhone(phone)
  if (!normalized) return null
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

function firstName(nombre: string, firstName?: string | null): string {
  if (firstName?.trim()) return firstName.trim()
  return nombre.trim().split(/\s+/)[0] || nombre.trim()
}

export type WhatsAppTemplateKind = 'interesado' | 'no_interesado'

export function defaultWhatsAppTemplate(
  kind: WhatsAppTemplateKind,
  lead: { nombre: string; first_name?: string | null; empresa?: string | null }
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

export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const url = buildWhatsAppUrl(phone, message)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
