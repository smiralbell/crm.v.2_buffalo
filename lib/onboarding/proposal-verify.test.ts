import { describe, expect, it } from 'vitest'
import {
  buildHonestNote,
  describeChange,
  diffProposalStats,
  resolveEditorNote,
  verifyIntent,
} from './proposal-verify'

const BEFORE = `# Propuesta Acme

Portada corta.

## Punto de partida

Acme hoy atiende por email sin priorización.

## Qué construiremos

Software a medida Buffalo.

## Retorno de la inversión

Comparativa de costes.

| Concepto | Sin Buffalo | Con Buffalo |
| --- | --- | --- |
| Coste mensual | 5000 | 1200 |

## Aceptación

Firmas.
`

const AFTER_TINY = BEFORE.replace(
  'Software a medida Buffalo.',
  'Software a medida Buffalo AI.'
)

const AFTER_EXPAND_P4 = BEFORE.replace(
  'Comparativa de costes.\n\n| Concepto | Sin Buffalo | Con Buffalo |\n| --- | --- | --- |\n| Coste mensual | 5000 | 1200 |',
  `${'El retorno se entiende mejor con un desglose operativo y financiero. '.repeat(40)}

### Desglose

Más detalle sobre ahorro en tickets y tiempo de respuesta.

| Concepto | Sin Buffalo | Con Buffalo |
| --- | --- | --- |
| Coste mensual | 5000 | 1200 |
| Horas/semana | 80 | 20 |
`
)

describe('diffProposalStats', () => {
  it('detecta cambio mínimo de palabras', () => {
    const stats = diffProposalStats(BEFORE, AFTER_TINY)
    expect(stats.wordsDelta).toBeGreaterThanOrEqual(1)
    expect(stats.wordsDelta).toBeLessThan(10)
    expect(stats.sectionsTouched).toContain('Qué construiremos')
  })

  it('cuenta tablas y charts', () => {
    const withChart = BEFORE.replace(
      `| Concepto | Sin Buffalo | Con Buffalo |
| --- | --- | --- |
| Coste mensual | 5000 | 1200 |`,
      `:::chart{type="bar" title="Costes"}
| Concepto | Sin | Con |
| --- | --- | --- |
| Mensual | 5000 | 1200 |
:::`
    )
    const stats = diffProposalStats(BEFORE, withChart)
    expect(stats.chartsAfter).toBe(1)
    expect(stats.chartsBefore).toBe(0)
    expect(stats.tablesBefore).toBe(1)
    expect(stats.tablesAfter).toBe(0)
  })
})

describe('verifyIntent', () => {
  it('amplía mucho el punto 4 con cambio de una palabra → no satisfecho', () => {
    const stats = diffProposalStats(BEFORE, AFTER_TINY)
    const result = verifyIntent('amplía mucho más el punto 4 y pon algún párrafo', stats)
    expect(result.satisfied).toBe(false)
    expect(result.reason).toMatch(/ampliar|palabras/i)
  })

  it('ampliación real de una sección → satisfecho', () => {
    const stats = diffProposalStats(BEFORE, AFTER_EXPAND_P4)
    expect(stats.wordsDelta).toBeGreaterThanOrEqual(80)
    const result = verifyIntent('extiende mucho mas el punto 4 y pon algun parrafo', stats)
    expect(result.satisfied).toBe(true)
  })

  it('ampliar todos los puntos exige umbral alto', () => {
    const stats = diffProposalStats(BEFORE, AFTER_EXPAND_P4)
    // AFTER_EXPAND_P4 suele quedar bajo 400 palabras de delta
    const result = verifyIntent(
      'ahora extiende mucho mas cada punto y quita los saltos',
      stats
    )
    if (stats.wordsDelta < 400) {
      expect(result.satisfied).toBe(false)
    } else {
      expect(result.satisfied).toBe(true)
    }
  })

  it('pedido de gráfico sin chart nuevo → no satisfecho', () => {
    const stats = diffProposalStats(BEFORE, AFTER_TINY)
    const result = verifyIntent('pero en vez de una tabla quiero que sea un grafico', stats)
    expect(result.satisfied).toBe(false)
  })

  it('tabla → gráfico detectado correctamente', () => {
    const after = BEFORE.replace(
      `Comparativa de costes.

| Concepto | Sin Buffalo | Con Buffalo |
| --- | --- | --- |
| Coste mensual | 5000 | 1200 |`,
      `Comparativa de costes.

:::chart{type="bar" title="Buffalo vs sin Buffalo"}
| Concepto | Sin Buffalo | Con Buffalo |
| --- | --- | --- |
| Coste mensual | 5000 | 1200 |
:::`
    )
    const stats = diffProposalStats(BEFORE, after)
    expect(stats.chartsAfter).toBeGreaterThan(stats.chartsBefore)
    expect(stats.tablesAfter).toBeLessThan(stats.tablesBefore)
    const result = verifyIntent('en vez de una tabla quiero que sea un grafico', stats)
    expect(result.satisfied).toBe(true)
  })

  it('cambio de type= del chart cuenta como satisfecho', () => {
    const withBar = `# Doc

## ROI

:::chart{type="bar" title="Evolución"}
| Mes | A | B |
| --- | --- | --- |
| Ene | 1 | 2 |
:::
`
    const withLine = withBar.replace('type="bar"', 'type="line"')
    const stats = diffProposalStats(withBar, withLine)
    expect(verifyIntent('quiero un grafico temporal en vez de barras', stats).satisfied).toBe(
      true
    )
  })
})

describe('describeChange + resolveEditorNote', () => {
  it('describe ampliación de una sección', () => {
    const stats = diffProposalStats(BEFORE, AFTER_EXPAND_P4)
    const phrase = describeChange(stats)
    expect(phrase).toMatch(/Ampliado|secciones ampliadas|palabras/i)
  })

  it('no usa la note optimista del modelo si el cambio es insuficiente', () => {
    const stats = diffProposalStats(BEFORE, AFTER_TINY)
    const resolved = resolveEditorNote({
      instruction: 'amplía mucho más el punto 4 y pon algún párrafo',
      modelNote: 'Ampliado el contenido de cada punto con más párrafos, tablas y desgloses',
      stats,
    })
    expect(resolved.satisfied).toBe(false)
    expect(resolved.note).not.toMatch(/Ampliado el contenido de cada punto/)
    expect(resolved.note).toMatch(/Solo he podido|No he conseguido/i)
  })

  it('buildHonestNote menciona el delta real', () => {
    const stats = diffProposalStats(BEFORE, AFTER_TINY)
    const note = buildHonestNote(
      'extiende mucho mas el punto 4',
      stats,
      { satisfied: false }
    )
    expect(note).toMatch(/\+\d+|palabras/i)
  })
})
