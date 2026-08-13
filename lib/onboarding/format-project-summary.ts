/**
 * Prepara un resumen legible para la ficha de onboarding.
 * Prioriza el brief del proyecto; descarta ficha web / Fireflies / dumps.
 *
 * La ficha de investigación a menudo llega APLANADA en una sola línea:
 *   ┌ Grupo · | planeta.es · | QUIÉNES SON · | … · └ Ficha web · brief…
 * (a veces con "|" ASCII en vez de "│", y a veces sin "Ficha web").
 */

export type SummaryBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }

const PROJECT_HINT =
  /\b(llamad|outbound|inbound|agente|retell|panel|campa[nñ]a|lead|integraci|whatsapp|voz|chat|automat|batch|cliente|queremos|quieren|crearemos|haremos|crearem|sistema|dashboard|crm|api|aprox|basicamente)\b/i

const RESEARCH_MARK =
  /QUI[EÉ]NES SON|QU[EÉ] OFRECEN|EN LA WEB SE VE|Ficha\s*web|[┌│└]|\|\s*QUI/i

/** ¿Parece ficha web / dump de investigación? */
export function looksLikeResearchFiche(text: string): boolean {
  const s = String(text || '').trim()
  if (!s) return false
  if (/Ficha\s*web/i.test(s) && (/[┌│└|]/.test(s) || /QUI[EÉ]NES SON/i.test(s))) {
    return true
  }
  if (/QUI[EÉ]NES SON/i.test(s) && /EN LA WEB SE VE/i.test(s)) return true
  if (/QUI[EÉ]NES SON/i.test(s) && /QU[EÉ] OFRECEN/i.test(s)) return true
  if (/^[┌\[]/.test(s) && /planeta\.es|\.es\s*·|\.com\s*·/i.test(s) && s.length > 200) {
    return true
  }
  return false
}

/** Título usable: nunca una ficha web. */
export function sanitizeProjectTitle(
  title: string | null | undefined,
  fallback?: string | null
): string | null {
  const t = (title || '').trim()
  if (!t) return (fallback || '').trim() || null
  if (looksLikeResearchFiche(t)) return (fallback || '').trim() || null
  if (t.length > 120 && RESEARCH_MARK.test(t)) return (fallback || '').trim() || null
  if (/[┌│└]/.test(t) || (t.includes('|') && /QUI[EÉ]NES/i.test(t))) {
    return (fallback || '').trim() || null
  }
  return t.slice(0, 160)
}

/**
 * Quita la ficha web. Soporta Unicode │ y ASCII |, con o sin "Ficha web".
 */
export function stripResearchFiches(raw: string): string {
  let s = String(raw || '')

  // Unifica barras
  s = s.replace(/│/g, '|')

  // Corte preferido: todo lo posterior a "Ficha web"
  if (/Ficha\s*web/i.test(s)) {
    const parts = s.split(/└?\s*Ficha\s*web/i)
    s = parts.length > 1 ? parts.slice(1).join(' ') : s
  } else if (/QUI[EÉ]NES SON/i.test(s)) {
    // Sin cierre: busca el arranque del brief del proyecto
    const briefStart = s.search(
      /\b(basicamente|les crearem|quieren crear|queremos crear|el agente|hay que hacer|vamos a crear|se crear[aá])\b/i
    )
    if (briefStart >= 0) {
      s = s.slice(briefStart)
    } else {
      // Tira desde el inicio hasta el final del bloque de investigación
      s = s.replace(
        /^[\s\S]*?\bEN LA WEB SE VE\b(?:\s*[·|]\s*[^·|]*){0,40}/i,
        ' '
      )
      s = s.replace(/^[\s\S]*?\bQU[EÉ] OFRECEN\b(?:\s*[·|]\s*[^·|]*){0,40}/i, ' ')
    }
  }

  // Limpia restos del marco
  s = s.replace(/┌[^|]*/g, ' ')
  s = s.replace(/└[^|]*/g, ' ')
  s = s.replace(/\|/g, '\n')
  s = s.replace(/[┌│└]/g, ' ')
  s = s.replace(/\bQUI[EÉ]NES SON\b/gi, '\n')
  s = s.replace(/\bQU[EÉ] OFRECEN\b/gi, '\n')
  s = s.replace(/\bEN LA WEB SE VE\b/gi, '\n')
  s = s.replace(/\bFicha\s*web\b/gi, '\n')

  s = s.replace(/(?:^|\n)#{1,3}\s*Investigación web[\s\S]*?(?=\n#{1,3}\s|\n---\s*\n|$)/gi, '\n')
  s = s.replace(/\bplaneta\.es\b[^\n]*/gi, '\n')

  // " · " → salto si parece lista de ficha; si no, espacio
  s = s.replace(/\s*[·•]\s*/g, '\n')

  s = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 1)
    .filter((l) => !RESEARCH_MARK.test(l))
    .filter((l) => !/^(Medios,|La nostra|Nuestras marcas|Actualitat|Llibres|Formació)/i.test(l))
    .join('\n\n')

  return s.replace(/\n{3,}/g, '\n\n').trim()
}

function stripNoise(raw: string): string {
  let s = stripResearchFiches(raw)
  s = s.replace(/<!--\s*fireflies:[\s\S]*?-->/gi, '')
  s = s.replace(/Enlace Fireflies:\s*\S+/gi, '')
  s = s.replace(
    /(?:^|\n)#{1,3}\s*Transcripción\s*\n[\s\S]*?(?=\n#{1,3}\s|\n---\s*\n|$)/gi,
    '\n'
  )
  s = s.replace(/(?:^|\n)---\s*\n+#\s*Fuentes CRM[\s\S]*$/i, '\n')
  s = s.replace(/(?:^|\n)#{1,3}\s*Notas del cuaderno\s*\n?/gi, '\n')
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

export function looksLikeRawDump(text: string): boolean {
  const s = text.trim()
  if (!s) return true
  if (looksLikeResearchFiche(s)) return true
  if (/<!--\s*fireflies:/i.test(s)) return true
  if (s.length > 4000) return true
  return false
}

function splitParas(text: string): string[] {
  const chunks = text
    .split(/\n{2,}|\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 20)
    .filter((p) => !looksLikeResearchFiche(p))
    .filter((p) => !RESEARCH_MARK.test(p))

  const seen = new Set<string>()
  const out: string[] = []
  for (const p of chunks) {
    const key = p.toLowerCase().slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

function scorePara(p: string): number {
  let score = 0
  if (PROJECT_HINT.test(p)) score += 5
  if (/\b(1000|panel|batch|retell|outbound|llamadas)\b/i.test(p)) score += 3
  if (RESEARCH_MARK.test(p) || looksLikeResearchFiche(p)) score -= 30
  if (p.length > 60 && p.length < 700) score += 1
  return score
}

export function extractProjectBrief(raw: string): string {
  const cleaned = stripNoise(raw)
  if (!cleaned) return ''
  if (looksLikeResearchFiche(cleaned) || RESEARCH_MARK.test(cleaned)) {
    return ''
  }

  const paras = splitParas(cleaned)
  if (!paras.length) {
    return PROJECT_HINT.test(cleaned) ? cleaned.slice(0, 1800) : ''
  }

  const scored = paras.map((p, i) => ({ p, i, score: scorePara(p) }))
  const good = scored.filter((x) => x.score >= 3).sort((a, b) => a.i - b.i)
  if (good.length) {
    return good
      .map((x) => x.p)
      .join('\n\n')
      .slice(0, 1800)
  }

  const neutral = scored
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.p)
  return neutral.slice(0, 5).join('\n\n').slice(0, 1600)
}

export function extractReadableSummary(context: string): string {
  return extractProjectBrief(context)
}

export function pickProjectSummaryText(input: {
  definition: string | null
  context: string | null
}): string {
  const def = (input.definition || '').trim()
  const ctx = (input.context || '').trim()
  const candidates = [def, ctx, [def, ctx].filter(Boolean).join('\n\n')].filter(
    Boolean
  ) as string[]

  for (const c of candidates) {
    const brief = extractProjectBrief(c)
    if (
      brief &&
      !looksLikeResearchFiche(brief) &&
      !RESEARCH_MARK.test(brief)
    ) {
      return brief
    }
  }
  return ''
}

export function parseSummaryBlocks(text: string): SummaryBlock[] {
  const src = stripNoise(text)
  if (!src || looksLikeResearchFiche(src) || RESEARCH_MARK.test(src)) return []

  return splitParas(src)
    .slice(0, 8)
    .map((p) => ({ type: 'paragraph' as const, text: p }))
}
