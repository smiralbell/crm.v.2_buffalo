/**
 * Pack de contexto del cliente para el editor / generador de propuestas.
 * Prioridad al recortar: metadatos > definición > auditoría/reuniones.
 */

export type ProposalContextPack = {
  /** Texto listo para inyectar en el prompt. */
  block: string
  /** Métricas para logs/UI. */
  chars: number
  sources: string[] // ['definicion', 'auditoria', 'reuniones', 'precios', …]
}

const FOOTER =
  'Usa SIEMPRE estos datos como fuente. Si un dato no está aquí, escribe "A definir con el cliente" — no lo inventes.'

function trimText(s: string | null | undefined): string {
  return (s || '').replace(/\r\n/g, '\n').trim()
}

/** Corta por párrafos sin partir a mitad de frase; prioriza el inicio. */
export function truncateByParagraphs(text: string, maxChars: number): string {
  const src = trimText(text)
  if (!src || src.length <= maxChars) return src
  const paras = src.split(/\n{2,}/)
  const out: string[] = []
  let used = 0
  for (const p of paras) {
    const piece = p.trim()
    if (!piece) continue
    const extra = (out.length ? 2 : 0) + piece.length
    if (used + extra > maxChars) break
    out.push(piece)
    used += extra
  }
  if (out.length === 0) {
    // Un solo párrafo enorme: corta en el último espacio antes del límite
    const slice = src.slice(0, maxChars)
    const sp = slice.lastIndexOf(' ')
    return (sp > 40 ? slice.slice(0, sp) : slice).trim() + '…'
  }
  const joined = out.join('\n\n')
  return joined.length < src.length ? `${joined}\n\n…` : joined
}

function buildEconomySection(input: {
  projectName?: string | null
  clientName?: string | null
  clientCompany?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
}): { text: string; sources: string[] } {
  const lines: string[] = []
  const sources: string[] = []
  if (input.projectName?.trim()) lines.push(`- Proyecto: ${input.projectName.trim()}`)
  const client = [input.clientCompany, input.clientName].filter((x) => x?.trim()).join(' · ')
  if (client) lines.push(`- Cliente: ${client}`)
  if (input.setupFee != null && Number(input.setupFee) > 0) {
    lines.push(`- Setup (€): ${input.setupFee}`)
    sources.push('precios')
  }
  if (input.monthlyFee != null && Number(input.monthlyFee) > 0) {
    lines.push(`- Mensualidad (€): ${input.monthlyFee}`)
    if (!sources.includes('precios')) sources.push('precios')
  }
  if (!lines.length) return { text: '', sources: [] }
  return {
    text: `## Cliente y economía\n${lines.join('\n')}`,
    sources,
  }
}

/**
 * Detecta si el bloque de contexto CRM parece incluir reuniones (Fireflies / meeting).
 * Heurística ligera sobre cabeceras habituales de buildCrmContextSources.
 */
function splitContextSources(context: string): {
  auditPart: string
  meetingsPart: string
  sources: string[]
} {
  const src = trimText(context)
  if (!src) return { auditPart: '', meetingsPart: '', sources: [] }

  const meetingMarkers =
    /(?:^|\n)#{1,3}\s*(?:reuniones?|transcripci[oó]n|fireflies|meeting|notas de reuni)/i
  const m = meetingMarkers.exec(src)
  if (m && m.index != null && m.index > 0) {
    return {
      auditPart: src.slice(0, m.index).trim(),
      meetingsPart: src.slice(m.index).trim(),
      sources: ['auditoria', 'reuniones'],
    }
  }
  if (meetingMarkers.test(src) && src.length < 800) {
    return { auditPart: '', meetingsPart: src, sources: ['reuniones'] }
  }
  // Sin marcador claro: todo como contexto CRM (auditoría + lo que venga)
  const sources = /reun|fireflies|meeting/i.test(src)
    ? ['auditoria', 'reuniones']
    : ['auditoria']
  return { auditPart: src, meetingsPart: '', sources }
}

export function buildProposalContextPack(input: {
  definition?: string | null
  context?: string | null
  projectName?: string | null
  clientName?: string | null
  clientCompany?: string | null
  setupFee?: number | null
  monthlyFee?: number | null
  /** Presupuesto de caracteres; recorta por prioridad si se pasa. */
  maxChars?: number
}): ProposalContextPack {
  const maxChars = input.maxChars ?? 24_000
  const sources: string[] = []

  const economy = buildEconomySection(input)
  for (const s of economy.sources) {
    if (!sources.includes(s)) sources.push(s)
  }

  const definition = trimText(input.definition)
  const defBlock = definition
    ? `## Definición del proyecto\n${definition}`
    : ''
  if (definition && !sources.includes('definicion')) sources.push('definicion')

  const { auditPart, meetingsPart, sources: ctxSources } = splitContextSources(
    trimText(input.context)
  )
  for (const s of ctxSources) {
    if (!sources.includes(s)) sources.push(s)
  }

  const crmChunks: string[] = []
  if (auditPart) crmChunks.push(auditPart)
  if (meetingsPart) crmChunks.push(meetingsPart)
  const crmRaw = crmChunks.join('\n\n').trim()
  const crmBlock = crmRaw
    ? `## Contexto CRM (auditoría y reuniones)\n${crmRaw}`
    : ''

  // Ensamblar respetando presupuesto: metadatos primero, luego definición, luego CRM
  const parts: string[] = []
  let used = FOOTER.length + 2

  const tryAdd = (block: string) => {
    if (!block) return
    const room = maxChars - used - (parts.length ? 2 : 0)
    if (room <= 80) return
    const clipped = truncateByParagraphs(block, room)
    if (!clipped) return
    parts.push(clipped)
    used += clipped.length + (parts.length > 1 ? 2 : 0)
  }

  tryAdd(economy.text)
  tryAdd(defBlock)
  tryAdd(crmBlock)

  const body = parts.join('\n\n').trim()
  let block = body ? `${body}\n\n${FOOTER}` : FOOTER
  if (block.length > maxChars) {
    // Recorte de emergencia: prioriza cabecera económica + footer
    const soft = truncateByParagraphs(body, Math.max(120, maxChars - FOOTER.length - 4))
    block = soft ? `${soft}\n\n${FOOTER}` : FOOTER
    if (block.length > maxChars) {
      block = block.slice(0, maxChars)
    }
  }

  return {
    block,
    chars: block.length,
    sources,
  }
}
