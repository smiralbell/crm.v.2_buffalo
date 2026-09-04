import { buffaloSignatureLines, clientDisplayLabel } from '@/lib/buffalo-identity'

/** Reexport: sintaxis BRM vive en proposal-prompt.ts (editable). */
export { PROPOSAL_BRM_SYNTAX } from '@/lib/onboarding/proposal-prompt'

export type ParsedProposalDraft = {
  title: string
  subtitle: string
  content: string
}

const PAGEBREAK_RE = /\n[ \t]*(?::::pagebreak\s*:::|<!--\s*bf:pagebreak\s*-->)[ \t]*\n/gi
const PAGE_MODE_RE = /<!--\s*bf:page-mode\s*:\s*(flow|sections)\s*-->/i

export type ProposalPageMode = 'sections' | 'flow'

/** Extrae título (#), subtítulo y cuerpo (##…) de un borrador BRM. */
export function parseProposalDraft(raw: string): ParsedProposalDraft {
  const src = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!src) return { title: '', subtitle: '', content: '' }

  // Preservar modo de página: el marcador puede haber caído en subtítulo
  const pageMode = getProposalPageMode(src)
  const hasModeMarker = PAGE_MODE_RE.test(src)

  const lines = src.split('\n')
  let title = ''
  let i = 0

  const h1 = /^#(?!#)\s+(.*)$/.exec(lines[0] || '')
  if (h1) {
    title = h1[1].trim()
    i = 1
    while (i < lines.length && !lines[i].trim()) i++
  }

  const bodyStart = lines.findIndex((l, idx) => idx >= i && /^##(?!#)\s+/.test(l))
  let subtitle = ''
  let content = ''

  if (bodyStart === -1) {
    const rest = stripProposalPageModeMarker(lines.slice(i).join('\n').trim())
    if (!title) {
      content = rest
    } else {
      subtitle = rest
      content = ''
    }
  } else {
    subtitle = stripProposalPageModeMarker(lines.slice(i, bodyStart).join('\n').trim())
    content = stripProposalPageModeMarker(lines.slice(bodyStart).join('\n').trim())
  }

  // Reinyectar marcador DENTRO del cuerpo (después del primer ##), nunca en subtítulo
  if (hasModeMarker && content) {
    content = injectPageModeMarker(content, pageMode)
  } else if (hasModeMarker && !content) {
    content = `<!-- bf:page-mode:${pageMode} -->`
  }

  return { title, subtitle, content }
}

function injectPageModeMarker(content: string, mode: ProposalPageMode): string {
  const body = stripProposalPageModeMarker(content)
  const marker = `<!-- bf:page-mode:${mode} -->`
  if (!body) return marker
  const lines = body.split('\n')
  const h2 = lines.findIndex((l) => /^##(?!#)\s+/.test(l))
  if (h2 < 0) return `${marker}\n\n${body}`
  // Justo debajo del primer ## → sigue en "content" al re-parsear
  const next = [...lines]
  next.splice(h2 + 1, 0, marker)
  return next.join('\n')
}

/** Recompone el borrador a partir de piezas. */
export function composeProposalDraft(parts: {
  title?: string
  subtitle?: string
  content: string
}): string {
  const title = (parts.title || '').trim()
  const subtitle = (parts.subtitle || '').trim()
  const content = (parts.content || '').trim()
  const chunks: string[] = []
  if (title) chunks.push(`# ${title}`)
  if (subtitle) chunks.push(subtitle)
  if (content) chunks.push(content)
  return chunks.join('\n\n').trim()
}

export function formatProposalDate(d = new Date()): string {
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Índice de secciones "##" para que el chat apunte a "punto 3". */
export function listProposalSections(draft: string): Array<{ index: number; title: string }> {
  const { content } = parseProposalDraft(draft)
  const src = (content || draft || '').replace(PAGEBREAK_RE, '\n\n')
  const out: Array<{ index: number; title: string }> = []
  let i = 0
  for (const line of src.split('\n')) {
    const m = /^##(?!#)\s+(.*)$/.exec(line)
    if (!m) continue
    i += 1
    const title = m[1].trim().replace(/^\s*\d+\s*[.)]\s*/, '')
    out.push({ index: i, title })
  }
  return out
}

/** Modo de paginado: sections = 1 ## por hoja; flow = solo :::pagebreak (puntos seguidos). */
export function getProposalPageMode(content: string): ProposalPageMode {
  const m = PAGE_MODE_RE.exec(content || '')
  if (m?.[1]?.toLowerCase() === 'flow') return 'flow'
  if (m?.[1]?.toLowerCase() === 'sections') return 'sections'
  return 'sections'
}

export function stripProposalPageModeMarker(content: string): string {
  return (content || '').replace(PAGE_MODE_RE, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Inserta/actualiza `<!-- bf:page-mode:… -->` en el cuerpo (bajo el primer ##). */
export function withProposalPageMode(draft: string, mode: ProposalPageMode): string {
  const parsed = parseProposalDraft(draft)
  const subtitle = stripProposalPageModeMarker(parsed.subtitle || '')
  const content = injectPageModeMarker(parsed.content || '', mode)
  return composeProposalDraft({
    title: parsed.title,
    subtitle,
    content,
  })
}

/** Parte un chunk en una hoja por cada sección `##` (header/footer por página). */
function splitChunkBySections(chunk: string): string[] {
  const lines = (chunk || '').replace(/\r\n/g, '\n').split('\n')
  const starts: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^##(?!#)\s+/.test(lines[i] || '')) starts.push(i)
  }
  if (starts.length <= 1) {
    const t = chunk.trim()
    return t ? [t] : []
  }
  const pages: string[] = []
  for (let s = 0; s < starts.length; s++) {
    const from = s === 0 ? 0 : starts[s]
    const to = s + 1 < starts.length ? starts[s + 1] : lines.length
    const part = lines.slice(from, to).join('\n').trim()
    if (part) pages.push(part)
  }
  return pages
}

function splitByPagebreaks(src: string): string[] {
  const byBreak = src
    .split(/\n[ \t]*(?::::pagebreak\s*:::|<!--\s*bf:pagebreak\s*-->)[ \t]*\n/i)
    .map((p) =>
      p
        .replace(/^[ \t]*:::[ \t]*pagebreak[ \t]*:::[ \t]*$/gim, '')
        .replace(/\n[ \t]*:::[ \t]*pagebreak[ \t]*:::[ \t]*(?=\n|$)/gim, '\n')
        .trim()
    )
    .filter(Boolean)
  return byBreak.length > 0 ? byBreak : src.trim() ? [src.trim()] : []
}

/**
 * Parte el cuerpo de la propuesta en hojas.
 * - `sections` (default): una hoja por `##` (y respeta :::pagebreak).
 * - `flow`: puntos seguidos; solo corta en :::pagebreak (si no hay, una sola hoja de contenido).
 */
export function splitProposalPageChunks(content: string): string[] {
  const raw = (content || '').replace(/\r\n/g, '\n').trim()
  if (!raw) return []

  const mode = getProposalPageMode(raw)
  const src = stripProposalPageModeMarker(raw)
  if (!src) return []

  const chunks = splitByPagebreaks(src)

  if (mode === 'flow') {
    return chunks
  }

  // sections: una página por ##
  if (chunks.length === 1) {
    const bySection = splitChunkBySections(chunks[0])
    return bySection.length > 0 ? bySection : [src]
  }

  const pages: string[] = []
  for (const chunk of chunks) {
    const parts = splitChunkBySections(chunk)
    if (parts.length === 0) continue
    pages.push(...parts)
  }
  return pages.length > 0 ? pages : [src]
}

/** Formatea el mapa de secciones para el prompt del editor. */
export function formatSectionMapForEditor(draft: string): string {
  const sections = listProposalSections(draft)
  if (sections.length === 0) return '(sin secciones ## todavía)'
  return sections
    .map((s) => `${String(s.index).padStart(2, '0')}. ${s.title || '(sin título)'}`)
    .join('\n')
}

/** Subtítulo de portada: corto, 1–2 frases, sin muro de texto. */
export function shortenCoverSubtitle(raw: string, maxChars = 220): string {
  const src = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!src) return ''
  // Solo el primer párrafo (antes de línea en blanco)
  const firstPara = src.split(/\n\s*\n/)[0].replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim()
  if (firstPara.length <= maxChars) {
    // Si hay varias frases, quédate con 1–2
    const sentences = firstPara.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [firstPara]
    const kept = sentences
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' ')
    return kept.length <= maxChars ? kept : kept.slice(0, maxChars - 1).trimEnd() + '…'
  }
  // Cortar en límite de frase o palabra
  const cut = firstPara.slice(0, maxChars)
  const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'))
  if (lastStop > 80) return cut.slice(0, lastStop + 1).trim()
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…'
}

const ACCEPTANCE_TITLES = /aceptaci[oó]n|acceptaci[oó]|acceptance|firma|signatura/i

function buildSignaturesBlockInline(
  opts?: { clientName?: string | null; clientCompany?: string | null }
): string {
  const clientLabel =
    [opts?.clientCompany, opts?.clientName].filter(Boolean).join(' · ') || 'Cliente'
  return [
    ':::signatures',
    `client: ${clientLabel}`,
    'provider: Buffalo IA Global Digital Solutions, S.L.',
    'provider_cif: B22944599',
    'provider_address: C/ Provença 474, esc B, entr. 2ª, 08025 Barcelona',
    'provider_phone: 658 571 087',
    ':::',
  ].join('\n')
}

export function rebuildAcceptanceContent(
  content: string,
  opts?: { clientName?: string | null; clientCompany?: string | null }
): string {
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const m = /^##(?!#)\s+(.*)$/.exec(lines[i] || '')
    if (m && ACCEPTANCE_TITLES.test(m[1])) {
      start = i
      break
    }
  }

  const defaultIntro =
    'La propuesta se podrá formalizar mediante la firma, la emisión del pedido correspondiente o el procedimiento de contratación que el cliente determine.'
  const sig = buildSignaturesBlockInline(opts)

  if (start < 0) {
    return (
      content.trimEnd() +
      `\n\n:::pagebreak\n:::\n\n## Aceptación\n\n${defaultIntro}\n\n${sig}`
    )
  }

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##(?!#)\s+/.test(lines[i] || '')) {
      end = i
      break
    }
  }
  const sectionBody = lines.slice(start + 1, end).join('\n')
  const intro =
    sectionBody
      .split(/\n::{3}signatures/i)[0]
      .split(/\n\|/)[0]
      .replace(/\n#{3,}[^\n]*/g, '')
      .replace(/:::[^]*$/g, '')
      .replace(/\|\s*[-:]+\s*\|[\s\S]*/g, '')
      .trim() || defaultIntro

  const rebuilt = ['## Aceptación', '', intro, '', sig, '']
  return [...lines.slice(0, start), ...rebuilt, ...lines.slice(end)].join('\n')
}

/**
 * Polish agresivo (generación inicial): subtítulo corto + aceptación con :::signatures.
 */
export function polishProposalDraft(
  draft: string,
  opts?: { clientName?: string | null; clientCompany?: string | null }
): string {
  const parsed = parseProposalDraft(draft)
  if (!parsed.title && !parsed.content && !parsed.subtitle) return draft

  const subtitle = shortenCoverSubtitle(parsed.subtitle)
  const content = rebuildAcceptanceContent(parsed.content || '', opts)

  return composeProposalDraft({
    title: parsed.title,
    subtitle,
    content: content.trim(),
  })
}

/**
 * Polish blando para preview: solo subtítulo absurdo (>400 chars) o firmas sin :::signatures.
 * No pisa ediciones intencionadas del comercial.
 */
export function softPolishProposalDraft(
  draft: string,
  opts?: { clientName?: string | null; clientCompany?: string | null }
): string {
  const parsed = parseProposalDraft(draft)
  if (!parsed.title && !parsed.content && !parsed.subtitle) return draft

  let subtitle = parsed.subtitle
  let content = parsed.content || ''

  if (subtitle.replace(/\s+/g, ' ').trim().length > 400) {
    subtitle = shortenCoverSubtitle(subtitle)
  }

  if (content.trim() && !/:::signatures\b/i.test(content)) {
    content = rebuildAcceptanceContent(content, opts)
  }

  return composeProposalDraft({
    title: parsed.title,
    subtitle,
    content: content.trim(),
  })
}
