import { describe, expect, it, vi } from 'vitest'
import {
  detectBulkScope,
  filterContextForSection,
  formatBulkNote,
  isBulkExpandableTitle,
  runBulkSectionEdit,
} from './proposal-bulk'

const SHORT_DOC = `# Propuesta

Subtítulo.

## Uno

Corto.

## Dos

También corto.

:::pagebreak
:::

## Tres

Final breve.

## Aceptación

:::signatures
client: ACME
provider: Buffalo
:::
`

function padWords(n: number, seed: string): string {
  const words: string[] = []
  for (let i = 0; i < n; i++) words.push(`${seed}${i}`)
  return words.join(' ')
}

describe('detectBulkScope', () => {
  it('paso 4: extiende cada punto y quita saltos → expand all', () => {
    const s = detectBulkScope(
      'ahora extiende mucho mas cada punto y quita los saltos'
    )
    expect(s).toEqual({
      bulk: true,
      scope: 'all_sections',
      action: 'expand',
    })
  })

  it('paso 5: más tablas y contenido → enrich', () => {
    const s = detectBulkScope(
      'cada punto tiene un parrafo y son muy cortos, quiero mas tablas, mas desgloses, mas puntos y mas contenido'
    )
    expect(s?.bulk).toBe(true)
    expect(s?.scope).toBe('all_sections')
    expect(s?.action).toBe('enrich')
  })

  it('paso 15: el doble de contenido → expand', () => {
    const s = detectBulkScope('que todo el documento tenga el doble de contenido')
    expect(s).toEqual({
      bulk: true,
      scope: 'all_sections',
      action: 'expand',
    })
  })

  it('no marca una sola sección', () => {
    expect(detectBulkScope('amplía el punto 4')).toBeNull()
  })

  it('lista explícita de puntos', () => {
    const s = detectBulkScope('extiende los puntos 2, 3 y 5')
    expect(s?.scope).toBe('listed')
    expect(s?.sections).toEqual([2, 3, 5])
  })
})

describe('isBulkExpandableTitle', () => {
  it('excluye aceptación', () => {
    expect(isBulkExpandableTitle('Aceptación')).toBe(false)
    expect(isBulkExpandableTitle('Uno')).toBe(true)
  })
})

describe('filterContextForSection', () => {
  it('prioriza párrafos con tokens del título', () => {
    const pack = [
      '## Cliente y economía\n- Cliente: ACME',
      'Auditoría: volumen de llamadas alto.',
      'Reunión: hablaron del mantenimiento continuo y SLAs.',
      'Otro: precios de setup.',
    ].join('\n\n')
    const out = filterContextForSection(pack, 'Mantenimiento y mejora continua', 2000)
    expect(out).toMatch(/mantenimiento/i)
    expect(out).toMatch(/Cliente/)
  })
})

describe('formatBulkNote', () => {
  it('resume con datos reales', () => {
    expect(
      formatBulkNote({
        okCount: 11,
        total: 13,
        wordsDelta: 4800,
        tablesDelta: 6,
        action: 'expand',
      })
    ).toBe('11 de 13 puntos ampliados (+4800 palabras, +6 tablas).')
  })
})

describe('runBulkSectionEdit — mock IA', () => {
  it('ensambla cuerpos nuevos y degrada si una falla', async () => {
    const write = vi.fn(async (input: { index: number; title: string }) => {
      if (input.index === 2) throw new Error('rate limit')
      return `### Detalle\n\n${padWords(360, `sec${input.index}_`)}\n\n:::callout\nNota.\n:::`
    })

    const result = await runBulkSectionEdit({
      draft: SHORT_DOC,
      instruction: 'extiende cada punto',
      contextPackBlock: '## Cliente\n- ACME\n\nAuditoría: 200 llamadas/día.',
      scope: { bulk: true, scope: 'all_sections', action: 'expand' },
      writeSection: write,
      concurrency: 2,
    })

    expect(result.total).toBe(3) // sin Aceptación
    expect(result.okCount).toBe(2)
    expect(result.failCount).toBe(1)
    expect(result.draft).toContain('sec1_')
    expect(result.draft).toContain('También corto') // Dos conservado
    expect(result.draft).toContain('sec3_')
    expect(result.wordsDelta).toBeGreaterThan(500)
    expect(result.note).toMatch(/2 de 3 puntos ampliados/)
    expect(write).toHaveBeenCalled()
  })

  it('enrich añade bloque visual en el mock', async () => {
    const result = await runBulkSectionEdit({
      draft: SHORT_DOC,
      instruction: 'mas tablas en todo',
      contextPackBlock: 'Cliente ACME',
      scope: { bulk: true, scope: 'listed', sections: [1], action: 'enrich' },
      writeSection: async () =>
        `### A\n\n${padWords(200, 'w')}\n\n### B\n\nMás texto.\n\n:::table{variant="compare"}\n| A | B |\n| --- | --- |\n| 1 | 2 |\n:::`,
      concurrency: 1,
    })
    expect(result.okCount).toBe(1)
    expect(result.draft).toMatch(/:::table/)
    expect(result.tablesDelta).toBeGreaterThanOrEqual(1)
  })
})
