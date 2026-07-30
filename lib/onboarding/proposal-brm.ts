/** Reexport: sintaxis BRM vive en proposal-prompt.ts (editable). */
export { PROPOSAL_BRM_SYNTAX } from '@/lib/onboarding/proposal-prompt'

export type ParsedProposalDraft = {
  title: string
  subtitle: string
  content: string
}

const PAGEBREAK_RE = /\n[ \t]*(?::::pagebreak\s*:::|<!--\s*bf:pagebreak\s*-->)[ \t]*\n/gi

/** Extrae título (#), subtítulo y cuerpo (##…) de un borrador BRM. */
export function parseProposalDraft(raw: string): ParsedProposalDraft {
  const src = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!src) return { title: '', subtitle: '', content: '' }

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
    const rest = lines.slice(i).join('\n').trim()
    if (!title) {
      content = rest
    } else {
      subtitle = rest
      content = ''
    }
  } else {
    subtitle = lines.slice(i, bodyStart).join('\n').trim()
    content = lines.slice(bodyStart).join('\n').trim()
  }

  return { title, subtitle, content }
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

/**
 * Parte el cuerpo de la propuesta en hojas por `:::pagebreak`.
 * Sin pagebreaks → un solo chunk (flujo continuo).
 */
export function splitProposalPageChunks(content: string): string[] {
  const src = (content || '').replace(/\r\n/g, '\n').trim()
  if (!src) return []
  const parts = src
    .split(/\n[ \t]*(?::::pagebreak\s*:::|<!--\s*bf:pagebreak\s*-->)[ \t]*\n/i)
    .map((p) => p.replace(/^[ \t]*:::[ \t]*pagebreak[ \t]*:::[ \t]*$/gim, '').trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : [src]
}

/** Formatea el mapa de secciones para el prompt del editor. */
export function formatSectionMapForEditor(draft: string): string {
  const sections = listProposalSections(draft)
  if (sections.length === 0) return '(sin secciones ## todavía)'
  return sections
    .map((s) => `${String(s.index).padStart(2, '0')}. ${s.title || '(sin título)'}`)
    .join('\n')
}
