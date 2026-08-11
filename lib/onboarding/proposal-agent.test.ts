import { describe, expect, it } from 'vitest'
import {
  classifyProposalSkills,
  formatSkillsForPrompt,
  proposalSkillsModelTier,
} from './proposal-skills'
import {
  applyProposalPatches,
  instructionNeedsAgent,
  tryLocalPatches,
} from './proposal-patches'
import { runProposalTool, getProposalToolSpecs } from './proposal-tools'
import type { ProposalToolState } from './proposal-tools'
import { buildProposalContextPack } from './proposal-context-pack'
import { runProposalAgent } from './proposal-agent'

const SAMPLE = `# Propuesta demo

Subtítulo corto.

## Uno

Texto corto del punto uno.

:::chart{type="bar" title="Demo"}
| Mes | Sin | Con |
| --- | --- | --- |
| Ene | 10 | 12 |
:::

## Dos

Otro párrafo breve.

:::pagebreak
:::

## Tres

Final.
`

function makeState(draft = SAMPLE): ProposalToolState {
  return {
    draft,
    contextPack: buildProposalContextPack({
      definition: 'Definición de prueba con volumen de 200 llamadas/día.',
      context: 'Auditoría: agenda en Calendly. Reunión: hablaron de ROI.',
      projectName: 'Demo',
      clientName: 'Ana',
      clientCompany: 'ACME',
      setupFee: 5000,
      monthlyFee: 900,
    }),
    polishOpts: { clientName: 'Ana', clientCompany: 'ACME' },
  }
}

describe('classifyProposalSkills — multi-intención', () => {
  it('paso 4: amplía cada punto Y quita saltos → layout + section_edit', () => {
    const ids = classifyProposalSkills(
      'ahora extiende mucho mas cada punto y quita los saltos'
    )
    expect(ids).toContain('layout')
    expect(ids).toContain('section_edit')
    expect(ids.indexOf('layout')).toBeLessThan(ids.indexOf('section_edit'))
  })

  it('densificar + tablas → section_edit + design', () => {
    const ids = classifyProposalSkills(
      'cada punto tiene un parrafo y son muy cortos, quiero mas tablas, mas desgloses, mas puntos y mas contenido'
    )
    expect(ids).toContain('design')
    expect(ids).toContain('section_edit')
  })
})

describe('formatSkillsForPrompt', () => {
  it('concatena skills sin duplicar catálogo (solo bloques de skill)', () => {
    const block = formatSkillsForPrompt(['layout', 'section_edit'])
    expect(block).toMatch(/SKILL ACTIVA:/)
    expect(block).toMatch(/layout/i)
    expect(block).toMatch(/section_edit|sección|Edición/i)
  })
})

describe('proposalSkillsModelTier', () => {
  it('heavy gana si hay redacción junto a layout', () => {
    expect(proposalSkillsModelTier(['layout', 'section_edit'])).toBe('heavy')
  })
})

describe('tryLocalPatches + multi-intención', () => {
  it('aplica quitar saltos y deja el resto al agente', () => {
    const instruction =
      'ahora extiende mucho mas cada punto y quita los saltos de pagina'
    const local = tryLocalPatches(instruction)
    expect(local?.some((p) => p.op === 'remove_pagebreaks' || p.op === 'set_page_mode')).toBe(
      true
    )
    expect(instructionNeedsAgent(instruction)).toBe(true)

    const { draft, applied } = applyProposalPatches(SAMPLE, local!)
    expect(applied).toBeGreaterThan(0)
    expect(draft).toMatch(/bf:page-mode:flow|flow/)
    expect(draft).toContain('## Uno')
  })
})

describe('proposal-tools', () => {
  it('expone specs con herramientas de lectura y escritura', () => {
    const names = getProposalToolSpecs().map((t) => t.name)
    expect(names).toContain('list_sections')
    expect(names).toContain('read_section')
    expect(names).toContain('get_client_context')
    expect(names).toContain('replace_section')
    expect(names).toContain('rewrite_section_freeform')
    expect(names).toContain('replace_document')
    expect(names).toContain('set_chart_type')
  })

  it('list_sections y read_section', async () => {
    const state = makeState()
    const listed = await runProposalTool('list_sections', {}, state)
    expect(listed.ok).toBe(true)
    expect(Array.isArray(listed.data)).toBe(true)

    const read = await runProposalTool('read_section', { section: 1 }, state)
    expect(read.ok).toBe(true)
    const blob = JSON.stringify(read.data || read.preview || '')
    expect(blob).toMatch(/Uno|Texto corto/i)
  })

  it('replace_text falla con hint si no hay match', async () => {
    const state = makeState()
    const res = await runProposalTool(
      'replace_text',
      { match: 'texto que no existe xyzzy', replacement: 'nuevo' },
      state
    )
    expect(res.ok).toBe(false)
    expect(res.hint || res.error).toBeTruthy()
  })

  it('set_chart_type cambia solo el type', async () => {
    const state = makeState()
    const before = state.draft
    const res = await runProposalTool('set_chart_type', { section: 1, type: 'line' }, state)
    expect(res.ok).toBe(true)
    expect(state.draft).toMatch(/:::chart\{[^}]*type="line"/)
    expect(state.draft).toContain('| Ene | 10 | 12 |')
    expect(state.draft).not.toBe(before)
  })

  it('get_client_context encuentra pasajes del pack', async () => {
    const state = makeState()
    const res = await runProposalTool('get_client_context', { query: 'Calendly' }, state)
    expect(res.ok).toBe(true)
    expect(JSON.stringify(res.data || res.preview || '')).toMatch(/Calendly/i)
  })

  it('JSON inválido no tumba el turno', async () => {
    const state = makeState()
    const res = await runProposalTool(
      'replace_text',
      { __parseError: true, __raw: '{broken' },
      state
    )
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/JSON inválido/i)
  })
})

describe('runProposalAgent — sin OpenRouter', () => {
  it('aplica atajos locales de saltos sin llamar al modelo', async () => {
    const result = await runProposalAgent({
      draft: SAMPLE,
      instruction: 'quita los saltos de pagina entre punto y punto',
    })
    expect(result.content).toMatch(/bf:page-mode:flow|flow/)
    expect(result.toolsUsed.some((t) => t.startsWith('local:'))).toBe(true)
    expect(result.turnMemory).toBeTruthy()
  })

  it('con feedback-only sin lastTurn pide concreción', async () => {
    const result = await runProposalAgent({
      draft: SAMPLE,
      instruction: 'lo veo igual',
    })
    expect(result.intentSatisfied).toBe(false)
    expect(result.note).toMatch(/concreto|turno anterior/i)
    expect(result.content).toBe(SAMPLE.trim())
  })

  it('multi-intención local+agente: quita saltos en local y marca needsAgent', async () => {
    const instruction = 'extiende mucho mas cada punto y quita los saltos de pagina'
    expect(instructionNeedsAgent(instruction)).toBe(true)
    const local = tryLocalPatches(instruction)
    expect(local?.length).toBeGreaterThan(0)
    // No llamamos al modelo aquí: solo verificamos que el camino parcial está listo
    const { draft } = applyProposalPatches(SAMPLE, local!)
    expect(draft).not.toContain(':::pagebreak')
  })
})
