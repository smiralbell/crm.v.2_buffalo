export interface ComercialPersona {
  firstName: string
  fullName: string
  presentAsCeo: boolean
  /** Firma opcional en emails, p. ej. "CEO, Buffalo AI" */
  titleLine: string | null
}

export const DEFAULT_CEO_PERSONA: ComercialPersona = {
  firstName: 'Sergi',
  fullName: 'Sergi Masoliver',
  presentAsCeo: true,
  titleLine: 'CEO, Buffalo AI',
}

export function firstTokenName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim()
}

export function buildComercialPersona(input: {
  name: string
  speakerName?: string | null
  speakerFullName?: string | null
  presentAsCeo?: boolean | null
}): ComercialPersona {
  const fullName = input.speakerFullName?.trim() || input.name.trim() || DEFAULT_CEO_PERSONA.fullName
  const firstName =
    input.speakerName?.trim() || firstTokenName(fullName) || DEFAULT_CEO_PERSONA.firstName

  let presentAsCeo = input.presentAsCeo === true
  if (input.presentAsCeo == null && firstName.toLowerCase() === 'ramon') {
    presentAsCeo = false
  }
  if (input.presentAsCeo == null && firstName.toLowerCase() === 'sergi') {
    presentAsCeo = true
  }

  return {
    firstName,
    fullName,
    presentAsCeo,
    titleLine: presentAsCeo ? 'CEO, Buffalo AI' : null,
  }
}

function catalanDePrefix(name: string): string {
  return /^[aeiouáéíóúàèò]/i.test(name) ? "d'" : "d'en "
}

/** Sustituye {{speaker_*}} y nombres legacy (Sergi) por el comercial activo. */
export function interpolateCallText(text: string, persona: ComercialPersona): string {
  const caDe = catalanDePrefix(persona.firstName)

  let out = text
    .replace(/\{\{speaker_first\}\}/g, persona.firstName)
    .replace(/\{\{speaker_full\}\}/g, persona.fullName)
    .replace(/\{\{speaker_from_es\}\}/g, `de ${persona.firstName}`)
    .replace(/\{\{speaker_from_ca\}\}/g, `${caDe}${persona.firstName}`)
    .replace(/\{\{speaker_intro_es\}\}/g, `Soy ${persona.fullName}, de Buffalo AI`)
    .replace(/\{\{speaker_intro_ca\}\}/g, `Sóc ${persona.fullName}, de Buffalo AI`)
    .replace(/\{\{speaker_short_es\}\}/g, `Soy ${persona.firstName} de Buffalo`)
    .replace(/\{\{speaker_short_ca\}\}/g, `Sóc ${persona.firstName} de Buffalo`)

  if (persona.firstName.toLowerCase() !== 'sergi') {
    out = out
      .replace(/Sergi Masoliver/g, persona.fullName)
      .replace(/Sergi/g, persona.firstName)
      .replace(/d'en Sergi/gi, `${caDe}${persona.firstName}`)
      .replace(/De part d'en Sergi/gi, `De part ${caDe}${persona.firstName}`)
      .replace(/De parte de Sergi/gi, `De parte de ${persona.firstName}`)
  }

  return out
}

export function applyPersonaToScriptBoxes<T extends { title: string; text: string }>(
  boxes: T[],
  persona: ComercialPersona
): T[] {
  return boxes.map((box) => ({
    ...box,
    title: interpolateCallText(box.title, persona),
    text: interpolateCallText(box.text, persona),
  }))
}

export function prospectFirstName(prospect: {
  nombre: string
  first_name?: string | null
}): string {
  if (prospect.first_name?.trim()) return prospect.first_name.trim()
  const parts = prospect.nombre.trim().split(/\s+/)
  return parts[0] || prospect.nombre.trim()
}

/** Sustituye placeholders del prospecto en el guión. */
export function interpolateProspectInText(
  text: string,
  prospect: { nombre: string; first_name?: string | null; empresa?: string | null }
): string {
  const name = prospectFirstName(prospect)
  const fullName = prospect.nombre.trim()
  const empresa = prospect.empresa?.trim() || ''

  return text
    .replace(/\{\{prospect_name\}\}/gi, name)
    .replace(/\{\{prospect_full\}\}/gi, fullName)
    .replace(/\{\{nombre\}\}/gi, name)
    .replace(/\{\{empresa\}\}/gi, empresa)
    .replace(/\[Nombre\]/gi, name)
    .replace(/\(Nombre\)/gi, name)
    .replace(/\[nombre\]/g, name)
    .replace(/\(nombre\)/g, name)
    .replace(/\[Empresa\]/gi, empresa)
    .replace(/\(Empresa\)/gi, empresa)
}

export function applyProspectToScriptBoxes<T extends { title: string; text: string }>(
  boxes: T[],
  prospect: { nombre: string; first_name?: string | null; empresa?: string | null }
): T[] {
  return boxes.map((box) => ({
    ...box,
    title: interpolateProspectInText(box.title, prospect),
    text: interpolateProspectInText(box.text, prospect),
  }))
}
