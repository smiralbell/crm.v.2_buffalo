/**
 * Caja de herramientas del editor de propuestas (lectura + escritura determinista).
 * Las mutaciones pasan por applyProposalPatches — no se duplica el motor.
 */

import { z } from 'zod'
import type { ORTool } from '@/lib/openrouter'
import { openRouterChatCompletion, resolveModel } from '@/lib/openrouter'
import {
  applyProposalPatches,
  type ProposalPatch,
  type ProposalPatchOpts,
  type ProposalTheme,
} from '@/lib/onboarding/proposal-patches'
import { listProposalSections } from '@/lib/onboarding/proposal-brm'
import { extractSectionBodies } from '@/lib/onboarding/proposal-verify'
import type { ProposalContextPack } from '@/lib/onboarding/proposal-context-pack'

export type ProposalToolState = {
  draft: string
  contextPack: ProposalContextPack
  polishOpts: ProposalPatchOpts
  theme?: ProposalTheme
  /** Progreso SSE (fan-out). */
  onProgress?: (info: { done: number; total: number; label: string }) => void
  signal?: AbortSignal
}

export type ToolResult = {
  ok: boolean
  error?: string
  hint?: string
  wordsDelta?: number
  charsDelta?: number
  sectionsTouched?: string[]
  preview?: string
  data?: unknown
}

export type ProposalToolDef = {
  spec: ORTool
  run: (args: unknown, state: ProposalToolState) => Promise<ToolResult> | ToolResult
}

function countWords(s: string): number {
  const t = (s || '').trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

function observeWrite(
  before: string,
  after: string,
  extra?: Partial<ToolResult>
): ToolResult {
  return {
    ok: true,
    wordsDelta: countWords(after) - countWords(before),
    charsDelta: after.length - before.length,
    sectionsTouched: listChangedSections(before, after),
    preview: after.slice(0, 200),
    ...extra,
  }
}

function listChangedSections(before: string, after: string): string[] {
  const a = extractSectionBodies(before)
  const b = extractSectionBodies(after)
  const mapB = new Map(b.map((s) => [s.title.toLowerCase(), s.body]))
  const out: string[] = []
  for (const s of a) {
    const next = mapB.get(s.title.toLowerCase())
    if (next === undefined || next.trim() !== s.body.trim()) out.push(s.title)
  }
  for (const s of b) {
    if (!a.some((x) => x.title.toLowerCase() === s.title.toLowerCase())) out.push(s.title)
  }
  return Array.from(new Set(out))
}

function applyOne(
  state: ProposalToolState,
  patch: ProposalPatch | ProposalPatch[]
): ToolResult {
  const before = state.draft
  const patches = Array.isArray(patch) ? patch : [patch]
  const { draft, applied, errors, theme } = applyProposalPatches(
    before,
    patches,
    state.polishOpts
  )
  if (theme) state.theme = theme
  if (applied <= 0 || draft.trim() === before.trim()) {
    return {
      ok: false,
      error: errors[0] || 'No se aplicó ningún cambio',
      hint: 'Usa read_section primero y pasa el texto exacto',
    }
  }
  state.draft = draft
  return observeWrite(before, draft)
}

function findSectionBody(
  draft: string,
  section: number | string
): { title: string; body: string; index: number } | null {
  const listed = listProposalSections(draft)
  const bodies = extractSectionBodies(draft)
  if (typeof section === 'number' || /^\d+$/.test(String(section))) {
    const idx = typeof section === 'number' ? section : parseInt(String(section), 10)
    const meta = listed.find((s) => s.index === idx)
    const body = bodies[idx - 1]
    if (!meta || !body) return null
    return { title: meta.title, body: body.body, index: idx }
  }
  const needle = String(section).toLowerCase()
  const meta = listed.find((s) => s.title.toLowerCase().includes(needle))
  if (!meta) return null
  const body = bodies[meta.index - 1]
  if (!body) return null
  return { title: meta.title, body: body.body, index: meta.index }
}

const sectionRef = z.union([z.number().int().positive(), z.string().min(1)])

function zodFail(err: z.ZodError): ToolResult {
  return {
    ok: false,
    error: `Args inválidos: ${err.issues.map((i) => i.message).join('; ')}`,
    hint: 'Corrige los argumentos y reintenta',
  }
}

const tools: ProposalToolDef[] = [
  {
    spec: {
      name: 'list_sections',
      description: 'Lista las secciones ## del documento con índice, título y métricas.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: (_args, state) => {
      const listed = listProposalSections(state.draft)
      const bodies = extractSectionBodies(state.draft)
      const data = listed.map((s, i) => {
        const body = bodies[i]?.body || ''
        return {
          index: s.index,
          title: s.title,
          words: countWords(body),
          hasChart: /:::chart\b/i.test(body),
          hasTable: /:::table\b/i.test(body) || /^\|.+\|$/m.test(body),
        }
      })
      return { ok: true, data, preview: JSON.stringify(data).slice(0, 200) }
    },
  },
  {
    spec: {
      name: 'read_section',
      description: 'Devuelve el título y el cuerpo BRM literal de una sección (índice o título).',
      parameters: {
        type: 'object',
        properties: { section: { oneOf: [{ type: 'number' }, { type: 'string' }] } },
        required: ['section'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ section: sectionRef }).safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      const found = findSectionBody(state.draft, parsed.data.section)
      if (!found) {
        return {
          ok: false,
          error: `Sección no encontrada: ${parsed.data.section}`,
          hint: 'Usa list_sections para ver índices',
        }
      }
      return {
        ok: true,
        data: found,
        preview: found.body.slice(0, 200),
        sectionsTouched: [found.title],
      }
    },
  },
  {
    spec: {
      name: 'search_document',
      description: 'Busca un texto en el documento y devuelve fragmentos con su sección.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z
        .object({ query: z.string().min(2), limit: z.number().int().positive().max(20).optional() })
        .safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      const q = parsed.data.query.toLowerCase()
      const limit = parsed.data.limit ?? 5
      const hits: Array<{ section: string; index: number; snippet: string }> = []
      const listed = listProposalSections(state.draft)
      const bodies = extractSectionBodies(state.draft)
      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i]
        const idx = body.body.toLowerCase().indexOf(q)
        if (idx < 0) continue
        const start = Math.max(0, idx - 40)
        hits.push({
          section: listed[i]?.title || body.title,
          index: listed[i]?.index || i + 1,
          snippet: body.body.slice(start, start + 160),
        })
        if (hits.length >= limit) break
      }
      return { ok: true, data: hits, preview: hits[0]?.snippet?.slice(0, 120) }
    },
  },
  {
    spec: {
      name: 'get_client_context',
      description:
        'Busca en el contexto del cliente (definición, auditoría, reuniones, precios). Úsala antes de afirmar un dato.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ query: z.string().min(2) }).safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      const src = state.contextPack.block || ''
      const q = parsed.data.query.toLowerCase()
      const paras = src.split(/\n{2,}/)
      const hits = paras.filter((p) => p.toLowerCase().includes(q)).slice(0, 6)
      if (!hits.length) {
        return {
          ok: true,
          data: [],
          preview: 'Sin coincidencias — usa "A definir con el cliente"',
        }
      }
      return { ok: true, data: hits, preview: hits[0]?.slice(0, 200) }
    },
  },
  {
    spec: {
      name: 'replace_section',
      description: 'Sustituye el cuerpo de una sección ## (sin incluir el título ##).',
      parameters: {
        type: 'object',
        properties: {
          section: { oneOf: [{ type: 'number' }, { type: 'string' }] },
          body: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['section', 'body'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z
        .object({ section: sectionRef, body: z.string().min(1), title: z.string().optional() })
        .safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, {
        op: 'replace_section',
        section: parsed.data.section,
        body: parsed.data.body,
        title: parsed.data.title,
      })
    },
  },
  {
    spec: {
      name: 'append_to_section',
      description: 'Añade markdown al final de una sección.',
      parameters: {
        type: 'object',
        properties: {
          section: { oneOf: [{ type: 'number' }, { type: 'string' }] },
          body: { type: 'string' },
        },
        required: ['section', 'body'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z
        .object({ section: sectionRef, body: z.string().min(1) })
        .safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, {
        op: 'append_to_section',
        section: parsed.data.section,
        body: parsed.data.body,
      })
    },
  },
  {
    spec: {
      name: 'insert_section',
      description: 'Inserta una sección ## nueva después de after (índice/título) o al final.',
      parameters: {
        type: 'object',
        properties: {
          after: { oneOf: [{ type: 'number' }, { type: 'string' }] },
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['title', 'body'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z
        .object({
          after: sectionRef.optional(),
          title: z.string().min(1),
          body: z.string().min(1),
        })
        .safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, {
        op: 'insert_section',
        after: parsed.data.after,
        title: parsed.data.title,
        body: parsed.data.body,
      })
    },
  },
  {
    spec: {
      name: 'delete_section',
      description: 'Elimina una sección ## por índice o título.',
      parameters: {
        type: 'object',
        properties: { section: { oneOf: [{ type: 'number' }, { type: 'string' }] } },
        required: ['section'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ section: sectionRef }).safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, { op: 'delete_section', section: parsed.data.section })
    },
  },
  {
    spec: {
      name: 'replace_text',
      description: 'Sustituye un fragmento literal en todo el documento.',
      parameters: {
        type: 'object',
        properties: {
          match: { type: 'string' },
          replacement: { type: 'string', description: 'Texto nuevo (alias de with)' },
        },
        required: ['match', 'replacement'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z
        .object({ match: z.string().min(3), replacement: z.string() })
        .safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, {
        op: 'replace_text',
        match: parsed.data.match,
        with: parsed.data.replacement,
      })
    },
  },
  {
    spec: {
      name: 'set_title',
      description: 'Cambia el título # de portada.',
      parameters: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ value: z.string().min(1) }).safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, { op: 'set_title', value: parsed.data.value })
    },
  },
  {
    spec: {
      name: 'set_subtitle',
      description: 'Cambia el subtítulo de portada.',
      parameters: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ value: z.string() }).safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, { op: 'set_subtitle', value: parsed.data.value })
    },
  },
  {
    spec: {
      name: 'shorten_cover',
      description: 'Acorta el subtítulo de portada.',
      parameters: {
        type: 'object',
        properties: { maxChars: { type: 'number' } },
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ maxChars: z.number().optional() }).safeParse(args ?? {})
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, { op: 'shorten_cover', maxChars: parsed.data.maxChars })
    },
  },
  {
    spec: {
      name: 'ensure_signatures',
      description: 'Reescribe la sección de aceptación con :::signatures.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: (_args, state) => applyOne(state, { op: 'ensure_signatures' }),
  },
  {
    spec: {
      name: 'set_page_mode',
      description: 'flow = puntos seguidos; sections = un ## por hoja.',
      parameters: {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['flow', 'sections'] } },
        required: ['mode'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ mode: z.enum(['flow', 'sections']) }).safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, { op: 'set_page_mode', mode: parsed.data.mode })
    },
  },
  {
    spec: {
      name: 'ensure_section_pagebreaks',
      description: 'PONE un salto de página entre cada punto ##.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: (_args, state) => applyOne(state, { op: 'ensure_section_pagebreaks' }),
  },
  {
    spec: {
      name: 'remove_pagebreaks',
      description: 'QUITA los saltos de página entre puntos.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: (_args, state) =>
      applyOne(state, [
        { op: 'set_page_mode', mode: 'flow' },
        { op: 'remove_pagebreaks' },
      ]),
  },
  {
    spec: {
      name: 'add_pagebreak',
      description: 'Añade un pagebreak antes de una sección concreta.',
      parameters: {
        type: 'object',
        properties: { before_section: { oneOf: [{ type: 'number' }, { type: 'string' }] } },
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ before_section: sectionRef.optional() }).safeParse(args ?? {})
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, {
        op: 'add_pagebreak',
        before_section: parsed.data.before_section,
      })
    },
  },
  {
    spec: {
      name: 'compact_blank_lines',
      description: 'Compacta líneas en blanco superfluas (no pagebreaks).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    run: (_args, state) => applyOne(state, { op: 'compact_blank_lines' }),
  },
  {
    spec: {
      name: 'set_theme',
      description: 'Cambia el tema visual: green | light | dark.',
      parameters: {
        type: 'object',
        properties: { theme: { type: 'string', enum: ['green', 'light', 'dark'] } },
        required: ['theme'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ theme: z.enum(['green', 'light', 'dark']) }).safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      return applyOne(state, { op: 'set_theme', theme: parsed.data.theme })
    },
  },
  {
    spec: {
      name: 'insert_block',
      description: 'Inserta un bloque BRM (:::cards, :::callout, :::roi…) al inicio o final de una sección.',
      parameters: {
        type: 'object',
        properties: {
          section: { oneOf: [{ type: 'number' }, { type: 'string' }] },
          position: { type: 'string', enum: ['start', 'end'] },
          brm: { type: 'string' },
        },
        required: ['section', 'brm'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z
        .object({
          section: sectionRef,
          position: z.enum(['start', 'end']).optional(),
          brm: z.string().min(3),
        })
        .safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      const found = findSectionBody(state.draft, parsed.data.section)
      if (!found) {
        return { ok: false, error: 'Sección no encontrada', hint: 'list_sections' }
      }
      const pos = parsed.data.position || 'end'
      const body =
        pos === 'start'
          ? `${parsed.data.brm.trim()}\n\n${found.body}`.trim()
          : `${found.body}\n\n${parsed.data.brm.trim()}`.trim()
      return applyOne(state, {
        op: 'replace_section',
        section: found.index,
        body,
      })
    },
  },
  {
    spec: {
      name: 'set_chart_type',
      description: 'Cambia solo el type= de un :::chart existente en una sección (line|area|bar|barcompare|donut|pie).',
      parameters: {
        type: 'object',
        properties: {
          section: { oneOf: [{ type: 'number' }, { type: 'string' }] },
          type: {
            type: 'string',
            enum: ['line', 'area', 'bar', 'barcompare', 'donut', 'pie'],
          },
        },
        required: ['section', 'type'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z
        .object({
          section: sectionRef,
          type: z.enum(['line', 'area', 'bar', 'barcompare', 'donut', 'pie']),
        })
        .safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      const found = findSectionBody(state.draft, parsed.data.section)
      if (!found) return { ok: false, error: 'Sección no encontrada' }
      if (!/:::chart\b/i.test(found.body)) {
        return {
          ok: false,
          error: 'No hay :::chart en esa sección',
          hint: 'Usa insert_block o rewrite_section_freeform',
        }
      }
      const nextBody = found.body.replace(
        /:::chart\{([^}]*)\}/i,
        (_m, attrs: string) => {
          let a = String(attrs)
          if (/\btype\s*=/.test(a)) {
            a = a.replace(/\btype\s*=\s*["']?[a-z]+["']?/i, `type="${parsed.data.type}"`)
          } else {
            a = `type="${parsed.data.type}" ${a}`.trim()
          }
          return `:::chart{${a}}`
        }
      )
      if (nextBody === found.body) {
        return { ok: false, error: 'No pude cambiar el type del chart' }
      }
      return applyOne(state, {
        op: 'replace_section',
        section: found.index,
        body: nextBody,
      })
    },
  },
  {
    spec: {
      name: 'expand_sections',
      description:
        'Fan-out masivo: reescribe VARIAS o TODAS las secciones en paralelo (ampliar / densificar / condensar). Úsala cuando pidan «cada punto», «todo el documento», «el doble de contenido» o «más tablas en todo».',
      parameters: {
        type: 'object',
        properties: {
          sections: {
            type: 'array',
            items: { oneOf: [{ type: 'number' }, { type: 'string' }] },
            description: 'Índices o títulos. Si se omite, todas las secciones ampliables.',
          },
          target_words: { type: 'number' },
          action: {
            type: 'string',
            enum: ['expand', 'enrich', 'condense'],
            description: 'expand=más prosa; enrich=+bloques visuales; condense=-40%',
          },
          must_include: { type: 'string' },
        },
        additionalProperties: false,
      },
    },
    run: async (args, state) => {
      const parsed = z
        .object({
          sections: z.array(z.union([z.number(), z.string()])).optional(),
          target_words: z.number().optional(),
          action: z.enum(['expand', 'enrich', 'condense']).optional(),
          must_include: z.string().optional(),
        })
        .safeParse(args ?? {})
      if (!parsed.success) return zodFail(parsed.error)

      const { detectBulkScope, runBulkSectionEdit } = await import(
        '@/lib/onboarding/proposal-bulk'
      )
      const detected = detectBulkScope(
        parsed.data.action
          ? `${parsed.data.action} cada punto`
          : 'extiende cada punto'
      )
      const action = parsed.data.action || detected?.action || 'expand'
      const sectionNums = (parsed.data.sections || [])
        .map((s) => {
          if (typeof s === 'number') return s
          if (/^\d+$/.test(s)) return parseInt(s, 10)
          const found = findSectionBody(state.draft, s)
          return found?.index
        })
        .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))

      const before = state.draft
      const result = await runBulkSectionEdit({
        draft: state.draft,
        instruction: `bulk:${action}`,
        contextPackBlock: state.contextPack.block,
        scope:
          sectionNums.length > 0
            ? { bulk: true, scope: 'listed', sections: sectionNums, action }
            : { bulk: true, scope: 'all_sections', action },
        polishOpts: state.polishOpts,
        mustInclude: parsed.data.must_include,
        signal: state.signal,
        onProgress: state.onProgress,
      })
      state.draft = result.draft
      return {
        ...observeWrite(before, result.draft, {
          sectionsTouched: result.sectionsTouched,
          data: {
            okCount: result.okCount,
            failCount: result.failCount,
            total: result.total,
            note: result.note,
            action,
            target_words: parsed.data.target_words ?? null,
          },
        }),
        preview: result.note,
      }
    },
  },
  {
    spec: {
      name: 'insert_scenario_chart',
      description: 'Inserta gráfico de proyección (fase posterior). Usa rewrite_section_freeform mientras tanto.',
      parameters: {
        type: 'object',
        properties: {
          section: { oneOf: [{ type: 'number' }, { type: 'string' }] },
          chartType: { type: 'string' },
        },
        additionalProperties: true,
      },
    },
    run: () => ({
      ok: false,
      error: 'insert_scenario_chart llegará en la fase de gráficos',
      hint: 'Usa rewrite_section_freeform pidiendo :::chart type=line con proyección ilustrativa y nota de hipótesis',
    }),
  },
  {
    spec: {
      name: 'replace_document',
      description:
        'Reemplaza TODO el documento BRM. SOLO para traducir o regenerar la propuesta completa. Conserva ##, :::pagebreak y :::signatures.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Propuesta BRM completa' },
        },
        required: ['content'],
        additionalProperties: false,
      },
    },
    run: (args, state) => {
      const parsed = z.object({ content: z.string().min(80) }).safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      console.info('[proposal-tools] replace_document', {
        chars: parsed.data.content.length,
      })
      return applyOne(state, { op: 'replace_doc', content: parsed.data.content })
    },
  },
  {
    spec: {
      name: 'rewrite_section_freeform',
      description:
        'Comodín: reescribe una sección completa según una instrucción libre (BRM válido). Úsala cuando no encaje otra herramienta.',
      parameters: {
        type: 'object',
        properties: {
          section: { oneOf: [{ type: 'number' }, { type: 'string' }] },
          instruction: { type: 'string' },
        },
        required: ['section', 'instruction'],
        additionalProperties: false,
      },
    },
    run: async (args, state) => {
      const parsed = z
        .object({ section: sectionRef, instruction: z.string().min(3) })
        .safeParse(args)
      if (!parsed.success) return zodFail(parsed.error)
      const found = findSectionBody(state.draft, parsed.data.section)
      if (!found) {
        return { ok: false, error: 'Sección no encontrada', hint: 'list_sections' }
      }
      try {
        const raw = await openRouterChatCompletion(
          [
            {
              role: 'system',
              content: `Eres redactor de propuestas Buffalo (BRM: markdown + :::directivas).
Devuelve SOLO el cuerpo nuevo de la sección (sin el ## título), en español de España salvo que pidan otro idioma.
Usa datos del contexto del cliente; si falta un dato: "A definir con el cliente".
Cierra todos los :::. No inventes precios contractuales.`,
            },
            {
              role: 'user',
              content: [
                `CONTEXTO CLIENTE:\n${state.contextPack.block}`,
                `SECCIÓN: ${found.title}`,
                `CUERPO ACTUAL:\n${found.body}`,
                `INSTRUCCIÓN:\n${parsed.data.instruction}`,
              ].join('\n\n'),
            },
          ],
          { model: resolveModel('heavy'), temperature: 0.35, maxTokens: 4000 }
        )
        const body = String(raw || '')
          .replace(/^```(?:markdown|md)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .replace(/^##\s+.*\n+/, '')
          .trim()
        if (body.length < 40) {
          return { ok: false, error: 'La reescritura freeform devolvió poco texto' }
        }
        return applyOne(state, {
          op: 'replace_section',
          section: found.index,
          body,
        })
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'Error en freeform',
          hint: 'Reintenta o usa replace_section con un cuerpo que tú redactes',
        }
      }
    },
  },
]

export function getProposalTools(): ProposalToolDef[] {
  return tools
}

export function getProposalToolSpecs(): ORTool[] {
  return tools.map((t) => t.spec)
}

export async function runProposalTool(
  name: string,
  args: unknown,
  state: ProposalToolState
): Promise<ToolResult> {
  if (
    args &&
    typeof args === 'object' &&
    (args as { __parseError?: boolean }).__parseError
  ) {
    return {
      ok: false,
      error: `JSON inválido en argumentos: ${String((args as { __raw?: string }).__raw || '').slice(0, 200)}`,
      hint: 'Reenvía la herramienta con JSON válido',
    }
  }
  const tool = tools.find((t) => t.spec.name === name)
  if (!tool) {
    return {
      ok: false,
      error: `Herramienta desconocida: ${name}`,
      hint: 'Usa solo las herramientas listadas',
    }
  }
  try {
    return await tool.run(args ?? {}, state)
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Error ejecutando herramienta',
    }
  }
}
