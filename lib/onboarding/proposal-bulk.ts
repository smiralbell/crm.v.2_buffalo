/**
 * Fan-out masivo: editar muchas secciones en paralelo (lotes), no en una sola respuesta.
 */

import { openRouterChatCompletion, resolveModel } from '@/lib/openrouter'
import { PROPOSAL_BRM_SYNTAX } from '@/lib/onboarding/proposal-prompt'
import { listProposalSections } from '@/lib/onboarding/proposal-brm'
import {
  applyProposalPatches,
  type ProposalPatchOpts,
} from '@/lib/onboarding/proposal-patches'
import {
  extractSectionBodies,
  verifyIntent,
  type ProposalDiffStats,
  diffProposalStats,
} from '@/lib/onboarding/proposal-verify'
import { throwIfAborted } from '@/lib/onboarding/proposal-agent-events'

export type BulkAction = 'expand' | 'condense' | 'enrich'

export type BulkScope = {
  bulk: true
  scope: 'all_sections' | 'listed'
  sections?: number[]
  action: BulkAction
}

export type BulkWriteSectionInput = {
  index: number
  title: string
  body: string
  action: BulkAction
  targetWords: number
  contextSlice: string
  mustInclude?: string
  signal?: AbortSignal
}

export type BulkWriteSectionFn = (input: BulkWriteSectionInput) => Promise<string>

export type BulkSectionEditResult = {
  draft: string
  okCount: number
  failCount: number
  total: number
  wordsDelta: number
  tablesDelta: number
  sectionsTouched: string[]
  note: string
  stats: ProposalDiffStats
}

const TARGET_WORDS: Record<BulkAction, number> = {
  expand: 450,
  enrich: 400,
  condense: 0, // relativo: -40%
}

function normalize(instruction: string): string {
  return instruction
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Secciones que no deben densificarse en fan-out "todos". */
export function isBulkExpandableTitle(title: string): boolean {
  return !/aceptaci[oó]n|acceptance|firma|signature/i.test(title)
}

/**
 * Detecta pedidos masivos (pasos 4, 5, 15 del criterio de aceptación).
 */
export function detectBulkScope(instruction: string): BulkScope | null {
  const n = normalize(instruction)
  if (!n.trim()) return null

  const bulkSignal =
    /cada punto|todos los puntos|todo el documento|cada seccion|todas las secciones|el doble( de contenido)?|mas contenido en todo|llena todo|muy cortos|en todas las secciones|en todo el documento|amplia(r)? (todo|todos|cada)|extiende.{0,50}(cada|todos|todo|los puntos|las secciones)/.test(
      n
    ) ||
    (/mas contenido|mas parrafos|mas desglose|mas tablas|mas puntos/.test(n) &&
      /(cada|todos|todo|documento|secciones)/.test(n)) ||
    // Varias secciones listadas ("puntos 2, 3 y 5") — plural obligatorio
    /(?:amplia|extiende|desarrolla|densifica).{0,40}puntos\s+[\d,]/.test(n)

  if (!bulkSignal) return null

  let action: BulkAction = 'expand'
  if (
    /\b(condens|acorta|resume|resumir|mas corto|menos texto|reduce|reducir)\b/.test(n) &&
    !/\b(amplia|extiende|el doble|llena|mas contenido)\b/.test(n)
  ) {
    action = 'condense'
  } else if (
    /mas tablas|mas desglose|mas visual|cards|callout|tabla|enrich|mas puntos y mas contenido|muy cortos/.test(
      n
    )
  ) {
    // densificar con bloques visuales (paso 5)
    action = 'enrich'
  } else {
    action = 'expand'
  }

  // "puntos 2, 3 y 5" / "puntos 1-4" / "secciones 3 y 4"
  const listed: number[] = []
  const range = n.match(
    /(?:puntos?|apartados?|secciones?)\s+(\d+)\s*(?:-|a|hasta)\s*(\d+)/
  )
  if (range) {
    const a = parseInt(range[1], 10)
    const b = parseInt(range[2], 10)
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      for (let i = lo; i <= hi && i <= 30; i++) listed.push(i)
    }
  }
  const multi = n.match(/(?:puntos?|apartados?|secciones?)\s+([\d,\sy]+)/)
  if (multi && !range) {
    const nums = multi[1].match(/\d+/g) || []
    for (const raw of nums) {
      const num = parseInt(raw, 10)
      if (Number.isFinite(num) && num > 0 && num <= 30 && !listed.includes(num)) {
        listed.push(num)
      }
    }
  }

  if (listed.length >= 2) {
    return { bulk: true, scope: 'listed', sections: listed, action }
  }

  return { bulk: true, scope: 'all_sections', action }
}

/** Recorta el context pack a pasajes relevantes para una sección. */
export function filterContextForSection(
  packBlock: string,
  sectionTitle: string,
  maxChars = 6000
): string {
  const src = (packBlock || '').trim()
  if (!src) return ''
  if (src.length <= maxChars) return src

  const tokens = sectionTitle
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3)

  const paras = src.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const economy = paras.filter((p) => /^##\s*cliente/i.test(p) || /setup|mensualidad|cliente:/i.test(p))
  const scored = paras
    .filter((p) => !economy.includes(p))
    .map((p) => {
      const low = p.toLowerCase()
      const score = tokens.reduce((s, t) => s + (low.includes(t) ? 2 : 0), 0)
      return { p, score }
    })
    .sort((a, b) => b.score - a.score)

  const out: string[] = [...economy]
  let used = out.join('\n\n').length
  for (const { p } of scored) {
    const extra = (out.length ? 2 : 0) + p.length
    if (used + extra > maxChars) break
    out.push(p)
    used += extra
  }
  if (out.length === 0) {
    return src.slice(0, maxChars)
  }
  return out.join('\n\n')
}

function countWords(s: string): number {
  const t = (s || '').trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

function actionBrief(action: BulkAction, targetWords: number): string {
  if (action === 'expand') {
    return `AMPLÍA esta sección a ~${targetWords} palabras (rango 350–600). Más párrafos, ### subtítulos y desglose concreto con datos del contexto. Conserva hechos; no inventes cifras.`
  }
  if (action === 'enrich') {
    return `DENSIFICA esta sección (~${targetWords} palabras): mínimo UN bloque visual (:::table o :::cards o :::callout o :::chart) y al menos 2 subtítulos ###. Más contenido útil anclado al cliente.`
  }
  return `CONDENSA esta sección a ~${targetWords} palabras (~40% menos), conservando TODOS los hechos y compromisos. Sin perder datos del cliente.`
}

function cleanSectionBody(raw: string): string {
  return String(raw || '')
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^##\s+.*\n+/, '')
    .trim()
}

/** Redactor por defecto (OpenRouter heavy). Inyectable en tests. */
export async function defaultBulkWriteSection(
  input: BulkWriteSectionInput
): Promise<string> {
  throwIfAborted(input.signal)
  const raw = await openRouterChatCompletion(
    [
      {
        role: 'system',
        content: `Eres redactor de propuestas Buffalo.
${PROPOSAL_BRM_SYNTAX}

Devuelve SOLO el cuerpo nuevo de la sección (sin el ## título).
Cierra todos los :::. Español de España salvo que el contexto indique otro idioma.
Si falta un dato: "A definir con el cliente". No inventes precios contractuales.`,
      },
      {
        role: 'user',
        content: [
          `CONTEXTO (filtrado para esta sección):\n${input.contextSlice || '(vacío)'}`,
          `SECCIÓN ${input.index}: ${input.title}`,
          `CUERPO ACTUAL (${countWords(input.body)} palabras):\n${input.body || '(vacío)'}`,
          actionBrief(input.action, input.targetWords),
          input.mustInclude ? `DEBE INCLUIR:\n${input.mustInclude}` : null,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
    {
      model: resolveModel('heavy'),
      temperature: input.action === 'condense' ? 0.2 : 0.35,
      maxTokens: 4500,
    }
  )
  return cleanSectionBody(raw)
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor
      cursor += 1
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

export function formatBulkNote(result: {
  okCount: number
  total: number
  wordsDelta: number
  tablesDelta: number
  action: BulkAction
}): string {
  const verb =
    result.action === 'condense'
      ? 'condensados'
      : result.action === 'enrich'
        ? 'enriquecidos'
        : 'ampliados'
  const words =
    result.wordsDelta === 0
      ? 'sin cambio neto de palabras'
      : `${result.wordsDelta > 0 ? '+' : ''}${result.wordsDelta} palabras`
  const tables =
    result.tablesDelta !== 0
      ? `, ${result.tablesDelta > 0 ? '+' : ''}${result.tablesDelta} tablas`
      : ''
  return `${result.okCount} de ${result.total} puntos ${verb} (${words}${tables}).`
}

export type RunBulkSectionEditInput = {
  draft: string
  instruction: string
  contextPackBlock: string
  scope: BulkScope
  polishOpts?: ProposalPatchOpts
  /** Override IA (tests). */
  writeSection?: BulkWriteSectionFn
  concurrency?: number
  mustInclude?: string
  signal?: AbortSignal
  onProgress?: (info: { done: number; total: number; label: string }) => void
}

/**
 * Reescribe N secciones en lotes; falla una → conserva original y sigue.
 */
export async function runBulkSectionEdit(
  input: RunBulkSectionEditInput
): Promise<BulkSectionEditResult> {
  const before = (input.draft || '').replace(/\r\n/g, '\n')
  const listed = listProposalSections(before)
  const bodies = extractSectionBodies(before)
  const write = input.writeSection || defaultBulkWriteSection
  const concurrency = input.concurrency ?? 3
  const action = input.scope.action

  let targets: Array<{ index: number; title: string; body: string }>
  if (input.scope.scope === 'listed' && input.scope.sections?.length) {
    targets = input.scope.sections
      .map((idx) => {
        const meta = listed.find((s) => s.index === idx)
        const body = bodies[idx - 1]
        if (!meta || !body) return null
        return { index: idx, title: meta.title, body: body.body }
      })
      .filter((x): x is { index: number; title: string; body: string } => Boolean(x))
  } else {
    targets = listed
      .filter((s) => isBulkExpandableTitle(s.title))
      .map((s) => {
        const body = bodies[s.index - 1]
        return {
          index: s.index,
          title: s.title,
          body: body?.body || '',
        }
      })
  }

  const total = targets.length
  if (total === 0) {
    const stats = diffProposalStats(before, before)
    return {
      draft: before,
      okCount: 0,
      failCount: 0,
      total: 0,
      wordsDelta: 0,
      tablesDelta: 0,
      sectionsTouched: [],
      note: 'No encontré secciones para editar en masa.',
      stats,
    }
  }

  let done = 0
  const outcomes = await mapPool(targets, concurrency, async (section) => {
    throwIfAborted(input.signal)
    const currentWords = countWords(section.body)
    const targetWords =
      action === 'condense'
        ? Math.max(80, Math.round(currentWords * 0.6))
        : TARGET_WORDS[action]

    try {
      const contextSlice = filterContextForSection(
        input.contextPackBlock,
        section.title
      )
      const nextBody = await write({
        index: section.index,
        title: section.title,
        body: section.body,
        action,
        targetWords,
        contextSlice,
        mustInclude: input.mustInclude,
        signal: input.signal,
      })
      done += 1
      input.onProgress?.({
        done,
        total,
        label: section.title,
      })
      if (!nextBody || nextBody.length < 20) {
        return { ok: false as const, index: section.index, title: section.title }
      }
      // Verificación ligera por sección (densidad)
      const nextWords = countWords(nextBody)
      if (action === 'expand' && nextWords < Math.min(200, currentWords + 40)) {
        // demasiado pobre: aún así aplicamos si hay algo más largo
        if (nextWords <= currentWords) {
          return { ok: false as const, index: section.index, title: section.title }
        }
      }
      if (action === 'enrich') {
        const hasVisual =
          /:::table\b|:::cards\b|:::callout\b|:::chart\b|:::roi\b|:::kpi-grid\b/i.test(
            nextBody
          )
        const h3 = (nextBody.match(/^###\s+/gm) || []).length
        if (!hasVisual && h3 < 2 && nextWords < currentWords + 30) {
          // aceptamos si al menos creció; si no, fallo suave
          if (nextWords <= currentWords) {
            return { ok: false as const, index: section.index, title: section.title }
          }
        }
      }
      return {
        ok: true as const,
        index: section.index,
        title: section.title,
        body: nextBody,
      }
    } catch (e) {
      done += 1
      input.onProgress?.({ done, total, label: section.title })
      if (
        e instanceof Error &&
        (e.name === 'AbortError' || e.message === 'Aborted')
      ) {
        throw e
      }
      console.warn('[proposal-bulk] sección falló, se conserva original', {
        section: section.title,
        error: e instanceof Error ? e.message : e,
      })
      return { ok: false as const, index: section.index, title: section.title }
    }
  })

  let draft = before
  let okCount = 0
  let failCount = 0
  const touched: string[] = []

  for (const o of outcomes) {
    if (!o.ok) {
      failCount += 1
      continue
    }
    const { draft: next, applied } = applyProposalPatches(
      draft,
      [{ op: 'replace_section', section: o.index, body: o.body }],
      input.polishOpts
    )
    if (applied > 0) {
      draft = next
      okCount += 1
      touched.push(o.title)
    } else {
      failCount += 1
    }
  }

  const stats = diffProposalStats(before, draft)
  // verifyIntent sobre la instrucción original (informativo)
  void verifyIntent(input.instruction, stats)

  const tablesDelta =
    (draft.match(/:::table\b/gi) || []).length -
    (before.match(/:::table\b/gi) || []).length

  const note = formatBulkNote({
    okCount,
    total,
    wordsDelta: stats.wordsDelta,
    tablesDelta,
    action,
  })

  return {
    draft,
    okCount,
    failCount,
    total,
    wordsDelta: stats.wordsDelta,
    tablesDelta,
    sectionsTouched: touched,
    note,
    stats,
  }
}
