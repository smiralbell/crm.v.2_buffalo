/**
 * Parches deterministas para el editor de propuestas BRM
 * (mismo enfoque que contract-patches.ts).
 */

import {
  composeProposalDraft,
  parseProposalDraft,
  shortenCoverSubtitle,
  withProposalPageMode,
  type ProposalPageMode,
} from '@/lib/onboarding/proposal-brm'

export type ProposalTheme = 'green' | 'light' | 'dark'

export type ProposalPatch =
  | { op: 'set_title'; value: string }
  | { op: 'set_subtitle'; value: string }
  | { op: 'replace_text'; match: string; with: string }
  | {
      op: 'replace_section'
      /** Índice 1-based o fragmento del título */
      section: number | string
      title?: string
      body: string
    }
  | { op: 'append_to_section'; section: number | string; body: string }
  | {
      op: 'insert_section'
      /** Tras este índice/título; omitir = al final */
      after?: number | string
      title: string
      body: string
    }
  | { op: 'delete_section'; section: number | string }
  | { op: 'ensure_signatures' }
  | { op: 'shorten_cover'; maxChars?: number }
  | { op: 'set_theme'; theme: ProposalTheme }
  | { op: 'add_pagebreak'; before_section?: number | string }
  | { op: 'remove_pagebreaks' }
  /** Inserta :::pagebreak antes de cada ## salvo el primero + modo sections */
  | { op: 'ensure_section_pagebreaks' }
  /** flow = puntos seguidos sin salto; sections = un ## por hoja */
  | { op: 'set_page_mode'; mode: ProposalPageMode }
  /** Compacta líneas en blanco superfluas (no pagebreaks) */
  | { op: 'compact_blank_lines' }
  | { op: 'replace_doc'; content: string }

export type ProposalPatchOpts = {
  clientName?: string | null
  clientCompany?: string | null
}

type SectionRange = {
  index: number
  title: string
  /** Línea del ## (inclusive) */
  start: number
  /** Primera línea de la siguiente ## o length */
  end: number
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clientLabel(opts?: ProposalPatchOpts): string {
  return [opts?.clientCompany, opts?.clientName].filter(Boolean).join(' · ') || 'Cliente'
}

export function buildSignaturesBlock(opts?: ProposalPatchOpts): string {
  return [
    ':::signatures',
    `client: ${clientLabel(opts)}`,
    'provider: Buffalo IA Global Digital Solutions, S.L.',
    'provider_cif: B22944599',
    'provider_address: C/ Provença 474, esc B, entr. 2ª, 08025 Barcelona',
    'provider_phone: 658 571 087',
    ':::',
  ].join('\n')
}

function listSectionRanges(content: string): SectionRange[] {
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n')
  const starts: Array<{ line: number; title: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^##(?!#)\s+(.*)$/.exec(lines[i] || '')
    if (!m) continue
    starts.push({
      line: i,
      title: m[1].trim().replace(/^\s*\d+\s*[.)]\s*/, ''),
    })
  }
  return starts.map((s, i) => ({
    index: i + 1,
    title: s.title,
    start: s.line,
    end: i + 1 < starts.length ? starts[i + 1].line : lines.length,
  }))
}

function resolveSection(
  content: string,
  section: number | string
): SectionRange | null {
  const ranges = listSectionRanges(content)
  if (ranges.length === 0) return null
  if (typeof section === 'number' && Number.isFinite(section)) {
    return ranges.find((r) => r.index === section) || null
  }
  const needle = normalizeText(String(section))
  if (!needle) return null
  const byIndex = /^(\d+)$/.exec(needle)
  if (byIndex) {
    return ranges.find((r) => r.index === Number(byIndex[1])) || null
  }
  return (
    ranges.find((r) => normalizeText(r.title) === needle) ||
    ranges.find((r) => normalizeText(r.title).includes(needle)) ||
    ranges.find((r) => needle.includes(normalizeText(r.title))) ||
    null
  )
}

function fuzzyReplaceOnce(hay: string, match: string, replacement: string): string | null {
  if (!match.trim()) return null
  if (hay.includes(match)) return hay.replace(match, replacement)

  const lowerIdx = hay.toLowerCase().indexOf(match.toLowerCase())
  if (lowerIdx >= 0) {
    return hay.slice(0, lowerIdx) + replacement + hay.slice(lowerIdx + match.length)
  }

  // Búsqueda tolerante a acentos / espacios (mapeando índices normalizados → original)
  const map: number[] = []
  let nHay = ''
  for (let i = 0; i < hay.length; i++) {
    const piece = hay[i]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    if (!piece) continue
    if (/\s/.test(piece)) {
      if (nHay.endsWith(' ')) continue
      nHay += ' '
      map.push(i)
      continue
    }
    for (let k = 0; k < piece.length; k++) {
      nHay += piece[k]
      map.push(i)
    }
  }
  nHay = nHay.trimEnd()
  const nMatch = normalizeText(match)
  if (!nMatch || nMatch.length < 8) return null
  let idx = nHay.indexOf(nMatch)
  let matchLen = nMatch.length
  if (idx < 0) {
    const head = nMatch.slice(0, Math.min(100, nMatch.length))
    idx = nHay.indexOf(head)
    matchLen = head.length
    if (idx < 0) return null
  }
  const start = map[idx]
  const endIdx = Math.min(idx + matchLen - 1, map.length - 1)
  const end = map[endIdx] + 1
  if (start == null || end == null || end <= start) return null
  return hay.slice(0, start) + replacement + hay.slice(end)
}

function rebuildAcceptance(
  content: string,
  opts?: ProposalPatchOpts
): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const ACCEPTANCE = /aceptaci[oó]n|acceptaci[oó]|acceptance|firma|signatura/i
  let start = -1
  for (let i = 0; i < lines.length; i++) {
    const m = /^##(?!#)\s+(.*)$/.exec(lines[i] || '')
    if (m && ACCEPTANCE.test(m[1])) {
      start = i
      break
    }
  }

  const defaultIntro =
    'La propuesta se podrá formalizar mediante la firma, la emisión del pedido correspondiente o el procedimiento de contratación que el cliente determine.'
  const sig = buildSignaturesBlock(opts)

  if (start < 0) {
    const block = `\n\n:::pagebreak\n:::\n\n## Aceptación\n\n${defaultIntro}\n\n${sig}`
    return content.trimEnd() + block
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

function stripPagebreaks(content: string): string {
  return content
    .replace(/\n[ \t]*:::pagebreak\s*\n:::[ \t]*\n/gi, '\n\n')
    .replace(/\n[ \t]*<!--\s*bf:pagebreak\s*-->[ \t]*\n/gi, '\n\n')
    .replace(/^[ \t]*:::pagebreak\s*\n:::[ \t]*\n?/gim, '')
    .replace(/\n{3,}/g, '\n\n')
}

export function applyProposalPatches(
  draft: string,
  patches: ProposalPatch[],
  opts?: ProposalPatchOpts
): { draft: string; applied: number; errors: string[]; theme?: ProposalTheme } {
  let current = (draft || '').replace(/\r\n/g, '\n')
  let applied = 0
  const errors: string[] = []
  let theme: ProposalTheme | undefined

  for (const patch of patches) {
    if (!patch || typeof patch !== 'object' || !('op' in patch)) {
      errors.push('Parche inválido')
      continue
    }

    if (patch.op === 'set_theme') {
      const t = String(patch.theme || '').toLowerCase()
      if (t !== 'green' && t !== 'light' && t !== 'dark') {
        errors.push('Tema inválido')
        continue
      }
      theme = t
      applied += 1
      continue
    }

    if (patch.op === 'replace_doc') {
      const next = String(patch.content || '').trim()
      if (!next) {
        errors.push('replace_doc vacío')
        continue
      }
      current = next
      applied += 1
      continue
    }

    if (patch.op === 'set_title') {
      const parsed = parseProposalDraft(current)
      const value = String(patch.value || '').trim()
      if (!value) {
        errors.push('Título vacío')
        continue
      }
      current = composeProposalDraft({
        title: value,
        subtitle: parsed.subtitle,
        content: parsed.content,
      })
      applied += 1
      continue
    }

    if (patch.op === 'set_subtitle') {
      const parsed = parseProposalDraft(current)
      current = composeProposalDraft({
        title: parsed.title,
        subtitle: String(patch.value || '').trim(),
        content: parsed.content,
      })
      applied += 1
      continue
    }

    if (patch.op === 'shorten_cover') {
      const parsed = parseProposalDraft(current)
      const next = shortenCoverSubtitle(parsed.subtitle, patch.maxChars ?? 220)
      if (next === parsed.subtitle) {
        errors.push('La portada ya es corta')
        continue
      }
      current = composeProposalDraft({
        title: parsed.title,
        subtitle: next,
        content: parsed.content,
      })
      applied += 1
      continue
    }

    if (patch.op === 'ensure_signatures') {
      const parsed = parseProposalDraft(current)
      const nextContent = rebuildAcceptance(parsed.content || current, opts)
      const next = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content: nextContent,
      })
      if (next === current) {
        errors.push('Firmas ya correctas')
        continue
      }
      current = next
      applied += 1
      continue
    }

    if (patch.op === 'set_page_mode') {
      const mode = patch.mode === 'flow' ? 'flow' : 'sections'
      const next = withProposalPageMode(current, mode)
      if (next.trim() === current.trim()) {
        errors.push('El modo de página ya estaba así')
        continue
      }
      current = next
      applied += 1
      continue
    }

    if (patch.op === 'remove_pagebreaks') {
      const parsed = parseProposalDraft(current)
      const nextContent = stripPagebreaks(parsed.content)
      const next = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content: nextContent,
      })
      if (next === current) {
        // Aun sin :::pagebreak, en modo sections hay “saltos” visuales → pasar a flow
        const flowed = withProposalPageMode(current, 'flow')
        if (flowed.trim() !== current.trim()) {
          current = flowed
          applied += 1
          continue
        }
        errors.push('No había saltos de página')
        continue
      }
      current = withProposalPageMode(next, 'flow')
      applied += 1
      continue
    }

    if (patch.op === 'ensure_section_pagebreaks') {
      const parsed = parseProposalDraft(current)
      let content = stripPagebreaks(parsed.content || '')
      const lines = content.split('\n')
      const out: string[] = []
      let seenH2 = false
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] || ''
        if (/^##(?!#)\s+/.test(line)) {
          if (seenH2) {
            // Evitar pagebreak duplicado
            const prev = out.slice(-3).join('\n')
            if (!/:::pagebreak/i.test(prev)) {
              if (out.length && out[out.length - 1].trim()) out.push('')
              out.push(':::pagebreak', ':::', '')
            }
          }
          seenH2 = true
        }
        // No copiar marcadores de modo sueltos aquí; withProposalPageMode los gestiona
        out.push(line)
      }
      content = out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
      let next = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content,
      })
      next = withProposalPageMode(next, 'sections')
      if (next.trim() === current.trim()) {
        errors.push('Los saltos entre puntos ya estaban puestos')
        continue
      }
      current = next
      applied += 1
      continue
    }

    if (patch.op === 'compact_blank_lines') {
      const parsed = parseProposalDraft(current)
      const nextContent = (parsed.content || '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/(\n- [^\n]+)\n\n+(?=- )/g, '$1\n')
        .replace(/(\n\d+\. [^\n]+)\n\n+(?=\d+\. )/g, '$1\n')
        .trim()
      const next = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content: nextContent,
      })
      if (next === current) {
        errors.push('No había líneas en blanco que compactar')
        continue
      }
      current = next
      applied += 1
      continue
    }

    if (patch.op === 'replace_text') {
      const match = String(patch.match || '')
      const withText = patch.with ?? ''
      const next = fuzzyReplaceOnce(current, match, withText)
      if (next == null || next === current) {
        errors.push('No encontré el texto a sustituir')
        continue
      }
      current = next
      applied += 1
      continue
    }

    if (patch.op === 'replace_section') {
      const parsed = parseProposalDraft(current)
      const content = parsed.content || ''
      const range = resolveSection(content, patch.section)
      if (!range) {
        errors.push(`No encontré la sección ${patch.section}`)
        continue
      }
      const lines = content.split('\n')
      const title = (patch.title || range.title).trim()
      const body = String(patch.body || '').replace(/^\n+|\n+$/g, '')
      const block = [`## ${title}`, body ? '' : null, body || null].filter((x) => x != null) as string[]
      const nextLines = [...lines.slice(0, range.start), ...block, ...lines.slice(range.end)]
      current = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content: nextLines.join('\n').trim(),
      })
      applied += 1
      continue
    }

    if (patch.op === 'append_to_section') {
      const parsed = parseProposalDraft(current)
      const content = parsed.content || ''
      const range = resolveSection(content, patch.section)
      if (!range) {
        errors.push(`No encontré la sección ${patch.section}`)
        continue
      }
      const lines = content.split('\n')
      const extra = String(patch.body || '').trim()
      if (!extra) {
        errors.push('Nada que añadir')
        continue
      }
      const insertAt = range.end
      const nextLines = [
        ...lines.slice(0, insertAt),
        '',
        extra,
        ...lines.slice(insertAt),
      ]
      current = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content: nextLines.join('\n').trim(),
      })
      applied += 1
      continue
    }

    if (patch.op === 'delete_section') {
      const parsed = parseProposalDraft(current)
      const content = parsed.content || ''
      const range = resolveSection(content, patch.section)
      if (!range) {
        errors.push(`No encontré la sección ${patch.section}`)
        continue
      }
      const lines = content.split('\n')
      const nextLines = [...lines.slice(0, range.start), ...lines.slice(range.end)]
      current = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content: nextLines.join('\n').trim(),
      })
      applied += 1
      continue
    }

    if (patch.op === 'insert_section') {
      const parsed = parseProposalDraft(current)
      const content = parsed.content || ''
      const lines = content.split('\n')
      const title = String(patch.title || '').trim()
      const body = String(patch.body || '').trim()
      if (!title) {
        errors.push('Título de sección vacío')
        continue
      }
      const block = [`## ${title}`, '', body, '']
      let insertAt = lines.length
      if (patch.after != null && patch.after !== '') {
        const range = resolveSection(content, patch.after)
        if (!range) {
          errors.push(`No encontré la sección after=${patch.after}`)
          continue
        }
        insertAt = range.end
      }
      const nextLines = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)]
      current = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content: nextLines.join('\n').trim(),
      })
      applied += 1
      continue
    }

    if (patch.op === 'add_pagebreak') {
      const parsed = parseProposalDraft(current)
      const content = parsed.content || ''
      const lines = content.split('\n')
      const pb = [':::pagebreak', ':::']
      let insertAt = 0
      if (patch.before_section != null && patch.before_section !== '') {
        const range = resolveSection(content, patch.before_section)
        if (!range) {
          errors.push(`No encontré la sección ${patch.before_section}`)
          continue
        }
        insertAt = range.start
      }
      // Evitar duplicar si ya hay pagebreak justo antes
      const prev = lines.slice(Math.max(0, insertAt - 3), insertAt).join('\n')
      if (/:::pagebreak/i.test(prev)) {
        errors.push('Ya hay salto de página ahí')
        continue
      }
      const nextLines = [...lines.slice(0, insertAt), ...pb, '', ...lines.slice(insertAt)]
      current = composeProposalDraft({
        title: parsed.title,
        subtitle: parsed.subtitle,
        content: nextLines.join('\n').trim(),
      })
      applied += 1
      continue
    }

    errors.push(`Op desconocida: ${(patch as { op: string }).op}`)
  }

  return { draft: current.trim(), applied, errors, theme }
}

/**
 * Atajos locales sin IA para instrucciones muy claras.
 */
export function tryLocalPatches(
  instruction: string,
  opts?: ProposalPatchOpts
): ProposalPatch[] | null {
  const raw = instruction.trim()
  if (!raw) return null
  const n = normalizeText(raw)

  // Tema
  if (/\btema\b/.test(n) || /\btheme\b/.test(n) || /\boscuro\b|\bclaro\b|\bverde\b/.test(n)) {
    if (/\boscuro\b|\bdark\b/.test(n)) return [{ op: 'set_theme', theme: 'dark' }]
    if (/\bclaro\b|\blight\b|\bblanco\b/.test(n) && !/\boscuro\b/.test(n)) {
      return [{ op: 'set_theme', theme: 'light' }]
    }
    if (/\bverde\b|\bgreen\b/.test(n)) return [{ op: 'set_theme', theme: 'green' }]
  }

  // Portada / subtítulo
  if (
    /(acorta|corta|reduce|menos texto|muy largo|feo).{0,40}(portada|subtitulo|subtitol|descripcion)/.test(
      n
    ) ||
    /(portada|subtitulo|subtitol|descripcion).{0,40}(acorta|corta|reduce|feo|largo)/.test(n) ||
    /arregla(r)? (la )?portada/.test(n)
  ) {
    return [{ op: 'shorten_cover' }]
  }

  // Firmas / aceptación
  if (
    /(arregla|reestructura|mejora|limpia|fix).{0,40}(firma|aceptacion|acceptacio|signatures)/.test(
      n
    ) ||
    /(firma|aceptacion|acceptacio|signatures).{0,40}(mal|feo|rota|arregla|reestructura)/.test(n)
  ) {
    return [{ op: 'ensure_signatures' }]
  }

  // Compactar líneas en blanco (no confundir con salto de página)
  if (
    /salto(s)? de linea|lineas en blanco|mas compacto|menos espacio|quita(r)? (las )?lineas/.test(n) &&
    !/\bsalto(s)? de pagina\b|\bpagebreak\b|\bentre punto/.test(n)
  ) {
    return [{ op: 'compact_blank_lines' }]
  }

  // ── Paginado: solo si hablan de saltos/páginas/puntos (polaridad PONER vs QUITAR) ──
  const talksPageBreaks =
    /\b(salto|saltos|pagebreak|page break)s?\b/.test(n) ||
    /entre (punto|puntos|seccion|secciones|apartado)/.test(n) ||
    /punto y punto/.test(n) ||
    /cada (punto|seccion|apartado).{0,40}(pagina|hoja)/.test(n) ||
    /un (punto|seccion) por (pagina|hoja)/.test(n) ||
    /puntos? seguidos|todo seguido/.test(n) ||
    /sin saltos? de pagina|saltos? de pagina/.test(n)

  if (talksPageBreaks) {
    const wantsRemoveBreaks =
      /\b(quita|quitar|elimina|eliminar|borra|borrar|sacame|saca)\b/.test(n) ||
      /\bsin saltos?\b/.test(n) ||
      /\bno (me )?hagas\b/.test(n) ||
      /\bno (quiero|pongo|pongas|quieras)\b/.test(n) ||
      /\b(juntos|seguidos|todo seguido)\b/.test(n) ||
      /todo (en )?(una|la misma) (sola )?pagina/.test(n)

    const wantsAddBreaks =
      /\b(pon|poner|ponme|anade|anadir|anademe|mete|meteme|inserta|insertame|haz|hazme|separa|separar|separame)\b/.test(
        n
      ) ||
      /\bcon saltos?\b/.test(n) ||
      /cada (punto|seccion|apartado).{0,40}(pagina|hoja)/.test(n) ||
      /un (punto|seccion) por (pagina|hoja)/.test(n) ||
      /salta(r)? (de pagina )?entre/.test(n)

    // AÑADIR (prioridad si hay verbo de añadir y no de quitar)
    if (wantsAddBreaks && !wantsRemoveBreaks) {
      return [{ op: 'ensure_section_pagebreaks' }]
    }
    // QUITAR
    if (wantsRemoveBreaks && !wantsAddBreaks) {
      return [{ op: 'set_page_mode', mode: 'flow' }, { op: 'remove_pagebreaks' }]
    }
    // Ambiguo con ambas señales: "no … salto" gana quitar; "pon … salto" gana añadir
    if (/\bno\b.{0,25}\bsalto|\bsin salto/.test(n)) {
      return [{ op: 'set_page_mode', mode: 'flow' }, { op: 'remove_pagebreaks' }]
    }
    if (/\b(pon|anade|mete|haz|separa)\b.{0,40}\bsalto/.test(n)) {
      return [{ op: 'ensure_section_pagebreaks' }]
    }
  }

  // "cambia X por Y" / "sustituye X por Y"
  const replaceM =
    raw.match(
      /(?:cambia|sustituye|reemplaza)\s+["«“]?([\s\S]{8,400}?)["»”]?\s+por\s+["«“]?([\s\S]{1,800}?)["»”]?\s*$/i
    ) ||
    raw.match(
      /(?:cambia|sustituye|reemplaza)\s+([\s\S]{8,200}?)\s+por\s+([\s\S]{1,400})$/i
    )
  if (replaceM) {
    const match = replaceM[1].trim().replace(/^["«“]|["»”]$/g, '')
    const withText = replaceM[2].trim().replace(/^["«“]|["»”]$/g, '')
    if (match.length >= 8 && withText.length >= 1) {
      return [{ op: 'replace_text', match, with: withText }]
    }
  }

  // Título explícito
  const titleM = raw.match(
    /(?:titulo|título)\s*(?:de la portada)?\s*(?:a|=|:)\s*["«“]?(.+?)["»”]?\s*$/i
  )
  if (titleM && /pon|cambia|nuevo|actualiza|set/i.test(raw)) {
    return [{ op: 'set_title', value: titleM[1].trim() }]
  }

  void opts
  return null
}
