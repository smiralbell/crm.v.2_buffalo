import { listProposalSections, parseProposalDraft } from '@/lib/onboarding/proposal-brm'

export type ProposalDiffStats = {
  charsDelta: number
  wordsDelta: number
  sectionsBefore: number
  sectionsAfter: number
  chartsBefore: number
  chartsAfter: number
  tablesBefore: number
  tablesAfter: number
  sectionsTouched: string[]
  pagebreaksDelta: number
  /** Tipos `type=` de cada :::chart (orden de aparición). */
  chartTypesBefore: string[]
  chartTypesAfter: string[]
}

export type VerifyIntentResult = {
  satisfied: boolean
  reason?: string
}

const CHART_OPEN_RE = /:::chart\b/gi
const TABLE_DIR_RE = /:::table\b/gi
const PAGEBREAK_RE = /:::pagebreak\b|<!--\s*bf:pagebreak\s*-->/gi
const CHART_BLOCK_RE = /:::chart\b[\s\S]*?:::/gi
const CHART_TYPE_RE = /:::chart\{[^}]*\btype\s*=\s*["']?([a-z]+)["']?/gi

function countMatches(src: string, re: RegExp): number {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`
  const copy = new RegExp(re.source, flags)
  return (src.match(copy) || []).length
}

function countWords(src: string): number {
  const t = (src || '').trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

/** Extrae cuerpos de secciones ## → título normalizado + cuerpo. */
export function extractSectionBodies(draft: string): Array<{ title: string; body: string }> {
  const { content } = parseProposalDraft(draft || '')
  const src = (content || draft || '').replace(/\r\n/g, '\n')
  const lines = src.split('\n')
  const sections: Array<{ title: string; body: string }> = []
  let current: { title: string; lines: string[] } | null = null

  for (const line of lines) {
    const m = /^##(?!#)\s+(.*)$/.exec(line)
    if (m) {
      if (current) {
        sections.push({ title: current.title, body: current.lines.join('\n').trim() })
      }
      const title = m[1].trim().replace(/^\s*\d+\s*[.)]\s*/, '')
      current = { title, lines: [] }
      continue
    }
    if (current) current.lines.push(line)
  }
  if (current) {
    sections.push({ title: current.title, body: current.lines.join('\n').trim() })
  }
  return sections
}

function extractChartTypes(draft: string): string[] {
  const out: string[] = []
  const re = new RegExp(CHART_TYPE_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(draft || '')) !== null) {
    out.push(m[1].toLowerCase())
  }
  return out
}

/** Cuenta tablas GFM + :::table, excluyendo las tablas internas de :::chart. */
function countTables(draft: string): number {
  const withoutCharts = (draft || '').replace(CHART_BLOCK_RE, '\n')
  const dirCount = countMatches(withoutCharts, TABLE_DIR_RE)
  // Cabeceras GFM: línea |...| seguida de |---|
  const lines = withoutCharts.split('\n')
  let gfm = 0
  for (let i = 0; i < lines.length - 1; i++) {
    const row = lines[i].trim()
    const sep = lines[i + 1].trim()
    if (!row.startsWith('|') || !row.endsWith('|')) continue
    if (!/^\|[\s:|-]+\|$/.test(sep)) continue
    gfm += 1
  }
  return dirCount + gfm
}

function chartTypesChanged(before: string[], after: string[]): boolean {
  if (before.length !== after.length) return false
  if (before.length === 0) return false
  return before.some((t, i) => t !== after[i])
}

export function diffProposalStats(before: string, after: string): ProposalDiffStats {
  const a = (before || '').replace(/\r\n/g, '\n')
  const b = (after || '').replace(/\r\n/g, '\n')

  const sectionsA = extractSectionBodies(a)
  const sectionsB = extractSectionBodies(b)
  const byTitleB = new Map(sectionsB.map((s) => [s.title.toLowerCase(), s.body]))

  const sectionsTouched: string[] = []
  for (const s of sectionsA) {
    const next = byTitleB.get(s.title.toLowerCase())
    if (next === undefined) {
      sectionsTouched.push(s.title)
      continue
    }
    if (next.trim() !== s.body.trim()) sectionsTouched.push(s.title)
  }
  for (const s of sectionsB) {
    if (!sectionsA.some((x) => x.title.toLowerCase() === s.title.toLowerCase())) {
      sectionsTouched.push(s.title)
    }
  }

  const chartTypesBefore = extractChartTypes(a)
  const chartTypesAfter = extractChartTypes(b)

  return {
    charsDelta: b.length - a.length,
    wordsDelta: countWords(b) - countWords(a),
    sectionsBefore: listProposalSections(a).length || sectionsA.length,
    sectionsAfter: listProposalSections(b).length || sectionsB.length,
    chartsBefore: countMatches(a, CHART_OPEN_RE),
    chartsAfter: countMatches(b, CHART_OPEN_RE),
    tablesBefore: countTables(a),
    tablesAfter: countTables(b),
    sectionsTouched: Array.from(new Set(sectionsTouched)),
    pagebreaksDelta: countMatches(b, PAGEBREAK_RE) - countMatches(a, PAGEBREAK_RE),
    chartTypesBefore,
    chartTypesAfter,
  }
}

function formatDelta(n: number): string {
  if (n > 0) return `+${n.toLocaleString('es-ES')}`
  return n.toLocaleString('es-ES')
}

/** Frase en español derivada de métricas reales (no del modelo). */
export function describeChange(stats: ProposalDiffStats): string {
  const touched = stats.sectionsTouched
  const chartsDelta = stats.chartsAfter - stats.chartsBefore
  const tablesDelta = stats.tablesAfter - stats.tablesBefore

  if (chartsDelta > 0 && tablesDelta < 0 && touched.length === 1) {
    return `Sustituida la tabla por un gráfico en «${touched[0]}».`
  }
  if (chartsDelta > 0 && tablesDelta < 0) {
    return `Sustituida(s) tabla(s) por gráfico(s)${touched.length ? ` en ${touched.length} sección(es)` : ''}.`
  }
  if (
    chartsDelta === 0 &&
    chartTypesChanged(stats.chartTypesBefore, stats.chartTypesAfter)
  ) {
    const from = stats.chartTypesBefore[0] || '?'
    const to = stats.chartTypesAfter[0] || '?'
    return `Tipo de gráfico cambiado de ${from} a ${to}${
      touched.length === 1 ? ` en «${touched[0]}»` : ''
    }.`
  }
  if (chartsDelta > 0) {
    return `Añadido${chartsDelta === 1 ? '' : 's'} ${chartsDelta} gráfico${chartsDelta === 1 ? '' : 's'}${
      touched.length === 1 ? ` en «${touched[0]}»` : ''
    }.`
  }
  if (stats.pagebreaksDelta > 0) {
    return `Añadidos saltos de página entre puntos (${formatDelta(stats.pagebreaksDelta)}).`
  }
  if (stats.pagebreaksDelta < 0) {
    return `Quitados saltos de página entre puntos (${formatDelta(stats.pagebreaksDelta)}).`
  }
  if (stats.wordsDelta > 0 && touched.length === 1) {
    return `Ampliado «${touched[0]}» (${formatDelta(stats.wordsDelta)} palabras).`
  }
  if (stats.wordsDelta > 0 && touched.length > 1) {
    return `${touched.length} secciones ampliadas (${formatDelta(stats.wordsDelta)} palabras en total).`
  }
  if (stats.wordsDelta < 0 && touched.length >= 1) {
    return `Contenido acortado (${formatDelta(stats.wordsDelta)} palabras)${
      touched.length === 1 ? ` en «${touched[0]}»` : ''
    }.`
  }
  if (tablesDelta > 0) {
    return `Añadida${tablesDelta === 1 ? '' : 's'} ${tablesDelta} tabla${tablesDelta === 1 ? '' : 's'}.`
  }
  if (touched.length === 1) {
    return `Actualizado «${touched[0]}».`
  }
  if (touched.length > 1) {
    return `${touched.length} secciones actualizadas.`
  }
  if (stats.charsDelta !== 0) {
    return `Documento actualizado (${formatDelta(stats.wordsDelta)} palabras).`
  }
  return 'Sin cambios medibles.'
}

const EXPAND_RE =
  /\b(ampl[ií]a|extiende|desarrolla|llena|densifica)\b|m[aá]s\s+(contenido|largo|p[aá]rrafos?|desglose|texto|detalle)/i
const EXPAND_ALL_RE =
  /\b(cada\s+punto|todos\s+los\s+puntos|todas\s+las\s+secciones|cada\s+secci[oó]n|todo\s+el\s+documento|en\s+todo)\b/i
const SHORTEN_RE =
  /\b(acorta|reduce|compacta|resume)\b|m[aá]s\s+cort[oa]|menos\s+(texto|contenido|p[aá]rrafos?)/i
const CHART_RE = /\b(gr[aá]fic[oa]s?|chart)\b/i
const TABLE_TO_CHART_RE =
  /(?:en\s+vez\s+de|en\s+lugar\s+de|sustitu[yi].*|cambia).*tabla|tabla.*(?:gr[aá]fic|chart)|(?:gr[aá]fic|chart).*en\s+vez\s+de.*tabla/i

/**
 * Comprueba si el diff real encaja con la intención del usuario.
 * Si no hay heurística aplicable → satisfied: true (no bloqueamos).
 */
export function verifyIntent(
  instruction: string,
  stats: ProposalDiffStats
): VerifyIntentResult {
  const text = (instruction || '').trim()
  if (!text) return { satisfied: true }

  if (TABLE_TO_CHART_RE.test(text) && CHART_RE.test(text)) {
    const tablesDown = stats.tablesAfter < stats.tablesBefore
    const chartsUp = stats.chartsAfter > stats.chartsBefore
    if (!tablesDown || !chartsUp) {
      return {
        satisfied: false,
        reason:
          'Pediste sustituir una tabla por un gráfico, pero el documento no refleja ese cambio (tabla↓ y gráfico↑).',
      }
    }
    return { satisfied: true }
  }

  if (CHART_RE.test(text)) {
    const chartsUp = stats.chartsAfter > stats.chartsBefore
    const typeChanged = chartTypesChanged(stats.chartTypesBefore, stats.chartTypesAfter)
    if (!chartsUp && !typeChanged) {
      return {
        satisfied: false,
        reason: 'Pediste un gráfico (o cambiar su tipo) y no hay cambio medible en :::chart.',
      }
    }
    return { satisfied: true }
  }

  if (EXPAND_RE.test(text)) {
    const bulk = EXPAND_ALL_RE.test(text)
    const minWords = bulk ? 400 : 80
    if (stats.wordsDelta < minWords) {
      return {
        satisfied: false,
        reason: bulk
          ? `Pediste ampliar todos los puntos; solo hay ${formatDelta(stats.wordsDelta)} palabras (mínimo ~${minWords}).`
          : `Pediste ampliar contenido; solo hay ${formatDelta(stats.wordsDelta)} palabras (mínimo ~${minWords}).`,
      }
    }
    return { satisfied: true }
  }

  if (SHORTEN_RE.test(text)) {
    if (stats.wordsDelta >= 0) {
      return {
        satisfied: false,
        reason: 'Pediste acortar y el documento no ha perdido palabras.',
      }
    }
    return { satisfied: true }
  }

  return { satisfied: true }
}

/** Note honesta cuando el cambio es insuficiente respecto a la instrucción. */
export function buildHonestNote(
  instruction: string,
  stats: ProposalDiffStats,
  verify: VerifyIntentResult
): string {
  const w = formatDelta(stats.wordsDelta)
  if (EXPAND_RE.test(instruction)) {
    if (stats.wordsDelta <= 0) {
      return 'No he conseguido ampliar el contenido de forma apreciable. Dime qué punto concreto quieres desarrollar y con qué contenido.'
    }
    return `Solo he podido ampliarlo un poco (${w} palabras). Dime qué punto concreto quieres desarrollar y con qué contenido.`
  }
  if (TABLE_TO_CHART_RE.test(instruction) || CHART_RE.test(instruction)) {
    return 'He tocado el documento, pero no veo el cambio de gráfico que pediste. Prueba: «sustituye la tabla del punto N por un gráfico de barras» o pega el fragmento.'
  }
  if (SHORTEN_RE.test(instruction)) {
    return 'No he conseguido acortar el contenido de forma apreciable. Indica el punto o el fragmento exacto a reducir.'
  }
  return (
    verify.reason ||
    `El cambio ha sido menor de lo pedido (${w} palabras). Sé más concreto o indica el punto exacto.`
  )
}

/**
 * Combina note del modelo con métricas reales.
 * Si la intención no se cumple, prioriza la note honesta.
 */
export function resolveEditorNote(input: {
  instruction: string
  modelNote: string
  stats: ProposalDiffStats
}): { note: string; satisfied: boolean; stats: ProposalDiffStats } {
  const verify = verifyIntent(input.instruction, input.stats)
  if (!verify.satisfied) {
    return {
      note: buildHonestNote(input.instruction, input.stats, verify),
      satisfied: false,
      stats: input.stats,
    }
  }

  const factual = describeChange(input.stats)
  const model = (input.modelNote || '').trim()
  // Evitar notes optimistas del modelo sin ancla cuantitativa
  let note = factual
  if (model && !/ampliad|extendid|añadid|todo|cada punto|todas/i.test(model)) {
    // Note corta del modelo + dato real
    if (input.stats.wordsDelta !== 0 && !/\+\d|\d+\s*palabras/i.test(model)) {
      note = `${model.replace(/\.*$/, '')} (${formatDelta(input.stats.wordsDelta)} palabras).`
    } else if (model.length < 120) {
      note = model
    }
  } else if (model && input.stats.wordsDelta !== 0) {
    note = `${factual}`
  }

  return { note, satisfied: true, stats: input.stats }
}
