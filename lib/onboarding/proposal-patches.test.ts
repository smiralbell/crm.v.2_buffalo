import { describe, expect, it } from 'vitest'
import {
  applyProposalPatches,
  tryLocalPatches,
} from './proposal-patches'
import { classifyProposalSkill } from './proposal-skills'
import {
  softPolishProposalDraft,
  parseProposalDraft,
  splitProposalPageChunks,
  withProposalPageMode,
} from './proposal-brm'

const SAMPLE = `# Agente inteligente para Acme

Esta es una descripción de portada extremadamente larga que habla de muchas cosas a la vez, menciona canales, volúmenes, ROI, implementación, mantenimiento y sigue y sigue sin parar para llenar la portada con un muro de texto que no debería aparecer así en un documento comercial serio porque queda muy feo visualmente en la plantilla Buffalo y confunde al lector.

## Punto de partida

Acme hoy atiende por email sin priorización.

## Qué construiremos

Software a medida Buffalo.

## Aceptación

Cómo formalizar.

| Cliente | Proveedor |
| --- | --- |
| Acme | Buffalo |
`

describe('applyProposalPatches', () => {
  it('shorten_cover acorta el subtítulo', () => {
    const { draft, applied } = applyProposalPatches(SAMPLE, [{ op: 'shorten_cover' }])
    expect(applied).toBe(1)
    const { subtitle } = parseProposalDraft(draft)
    expect(subtitle.length).toBeLessThan(250)
    expect(subtitle.length).toBeGreaterThan(20)
  })

  it('ensure_signatures crea :::signatures', () => {
    const { draft, applied } = applyProposalPatches(
      SAMPLE,
      [{ op: 'ensure_signatures' }],
      { clientCompany: 'Acme SL' }
    )
    expect(applied).toBe(1)
    expect(draft).toMatch(/:::signatures/)
    expect(draft).toMatch(/client: Acme SL/)
    expect(draft).not.toMatch(/\| Cliente \| Proveedor \|/)
  })

  it('replace_section reescribe un punto por índice', () => {
    const { draft, applied } = applyProposalPatches(SAMPLE, [
      {
        op: 'replace_section',
        section: 1,
        body: 'Nuevo cuerpo del punto de partida con más detalle.',
      },
    ])
    expect(applied).toBe(1)
    expect(draft).toContain('Nuevo cuerpo del punto de partida')
    expect(draft).toContain('## Qué construiremos')
    expect(draft).not.toContain('atiende por email sin priorización')
  })

  it('replace_text sustituye un fragmento', () => {
    const { draft, applied } = applyProposalPatches(SAMPLE, [
      {
        op: 'replace_text',
        match: 'atiende por email sin priorización',
        with: 'atiende por WhatsApp y email',
      },
    ])
    expect(applied).toBe(1)
    expect(draft).toContain('atiende por WhatsApp y email')
  })

  it('set_theme no muta el texto pero marca theme', () => {
    const { draft, applied, theme } = applyProposalPatches(SAMPLE, [
      { op: 'set_theme', theme: 'dark' },
    ])
    expect(applied).toBe(1)
    expect(theme).toBe('dark')
    expect(draft.trim()).toBe(SAMPLE.trim())
  })
})

describe('tryLocalPatches', () => {
  it('detecta acortar portada', () => {
    const patches = tryLocalPatches('arregla la portada, la descripción es muy fea')
    expect(patches?.[0]?.op).toBe('shorten_cover')
  })

  it('detecta firmas', () => {
    const patches = tryLocalPatches('reestructura las firmas de aceptación')
    expect(patches?.[0]?.op).toBe('ensure_signatures')
  })

  it('detecta tema oscuro', () => {
    const patches = tryLocalPatches('pon el tema oscuro')
    expect(patches?.[0]).toEqual({ op: 'set_theme', theme: 'dark' })
  })
})

describe('classifyProposalSkill', () => {
  it('clasifica cover / acceptance / regenerate / design', () => {
    expect(classifyProposalSkill('acorta la portada')).toBe('cover')
    expect(classifyProposalSkill('arregla las firmas')).toBe('acceptance')
    expect(classifyProposalSkill('regenera toda la propuesta')).toBe('regenerate')
    expect(classifyProposalSkill('hazme una tabla más bonita')).toBe('design')
    expect(classifyProposalSkill('ponlo en burbujas')).toBe('design')
    expect(classifyProposalSkill('mejora el diseño de ese bloque')).toBe('design')
  })
})

describe('splitProposalPageChunks', () => {
  it('sin pagebreaks parte por ## (una hoja por sección)', () => {
    const draft = `## Uno\n\nA.\n\n## Dos\n\nB.\n\n## Tres\n\nC.`
    const pages = splitProposalPageChunks(draft)
    expect(pages.length).toBe(3)
    expect(pages[0]).toContain('## Uno')
    expect(pages[1]).toContain('## Dos')
    expect(pages[2]).toContain('## Tres')
  })

  it('modo flow: puntos seguidos en una sola hoja', () => {
    const draft = `<!-- bf:page-mode:flow -->\n\n## Uno\n\nA.\n\n## Dos\n\nB.\n\n## Tres\n\nC.`
    const pages = splitProposalPageChunks(draft)
    expect(pages.length).toBe(1)
    expect(pages[0]).toContain('## Uno')
    expect(pages[0]).toContain('## Tres')
  })

  it('con pagebreaks también expande secciones', () => {
    const draft = `## Uno\n\nA.\n\n:::pagebreak\n:::\n\n## Dos\n\nB.\n\n## Tres\n\nC.`
    const pages = splitProposalPageChunks(draft)
    expect(pages.length).toBeGreaterThanOrEqual(3)
  })
})

describe('tryLocalPatches page flow', () => {
  it('QUITAR: “entre punto y punto no hagas salto”', () => {
    const patches = tryLocalPatches(
      'quiero que entre punto y punto no hagas un salto de pagina por favor'
    )
    expect(patches?.some((p) => p.op === 'set_page_mode' && p.mode === 'flow')).toBe(true)
    expect(patches?.some((p) => p.op === 'ensure_section_pagebreaks')).toBeFalsy()
  })

  it('PONER: “pon un salto de pagina entre punto y punto” (no lo invierte)', () => {
    const patches = tryLocalPatches('pon un salto de pagina entre punto y punto por favor')
    expect(patches?.[0]?.op).toBe('ensure_section_pagebreaks')
    expect(patches?.some((p) => p.op === 'set_page_mode' && p.mode === 'flow')).toBeFalsy()
  })

  it('aplica flow y la preview deja de partir por ##', () => {
    const draft = `# Título\n\nSubtítulo corto.\n\n## Uno\n\nA.\n\n## Dos\n\nB.\n\n## Tres\n\nC.`
    expect(splitProposalPageChunks(parseProposalDraft(draft).content).length).toBe(3)

    const patches = tryLocalPatches('borra los saltos de pagina entre punto y punto')
    expect(patches).toBeTruthy()
    const { draft: next, applied } = applyProposalPatches(draft, patches!)
    expect(applied).toBeGreaterThan(0)

    const parsed = parseProposalDraft(next)
    expect(parsed.content).toMatch(/bf:page-mode:flow/)
    expect(parsed.subtitle).not.toMatch(/bf:page-mode/)
    expect(splitProposalPageChunks(parsed.content).length).toBe(1)
  })

  it('ensure_section_pagebreaks vuelve a separar por hojas', () => {
    const draft = withProposalPageMode(
      `# Título\n\nSub.\n\n## Uno\n\nA.\n\n## Dos\n\nB.\n\n## Tres\n\nC.`,
      'flow'
    )
    expect(splitProposalPageChunks(parseProposalDraft(draft).content).length).toBe(1)

    const { draft: next, applied } = applyProposalPatches(draft, [
      { op: 'ensure_section_pagebreaks' },
    ])
    expect(applied).toBe(1)
    const parsed = parseProposalDraft(next)
    expect(parsed.content).toMatch(/:::pagebreak/)
    expect(parsed.content).toMatch(/bf:page-mode:sections/)
    expect(splitProposalPageChunks(parsed.content).length).toBe(3)
  })

  it('withProposalPageMode sobrevive al parse (no se pierde en subtítulo)', () => {
    const draft = `# Título\n\nSub.\n\n## Uno\n\nA.\n\n## Dos\n\nB.`
    const next = withProposalPageMode(draft, 'flow')
    const again = parseProposalDraft(next)
    expect(splitProposalPageChunks(again.content).length).toBe(1)
  })
})

describe('softPolishProposalDraft', () => {
  it('no acorta subtítulos razonables', () => {
    const draft = `# Título

Promesa corta de valor.

## Aceptación

Intro.

:::signatures
client: Acme
provider: Buffalo IA Global Digital Solutions, S.L.
:::
`
    const next = softPolishProposalDraft(draft, { clientCompany: 'Acme' })
    expect(parseProposalDraft(next).subtitle).toBe('Promesa corta de valor.')
  })

  it('añade firmas si faltan', () => {
    const draft = `# Título

Sub.

## Punto de partida

Texto.

## Aceptación

Firma aquí en tabla rota.
`
    const next = softPolishProposalDraft(draft, { clientCompany: 'Acme' })
    expect(next).toMatch(/:::signatures/)
  })
})
