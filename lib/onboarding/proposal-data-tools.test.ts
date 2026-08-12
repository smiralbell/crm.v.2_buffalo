import { describe, expect, it } from 'vitest'
import {
  buildChartBlock,
  buildScenarioSeries,
  insertScenarioChartInBody,
  setChartTypeInBody,
} from './proposal-data-tools'
import { runProposalTool, type ProposalToolState } from './proposal-tools'
import { buildProposalContextPack } from './proposal-context-pack'

describe('buildScenarioSeries', () => {
  it('crecimiento compuesto y divergencia creciente', () => {
    const s = buildScenarioSeries({
      periods: 6,
      periodLabel: 'Mes',
      baseline: 100,
      baselineGrowthPct: 5,
      upliftPct: 25,
    })
    expect(s.columns).toEqual(['Mes', 'Sin Buffalo', 'Con Buffalo'])
    expect(s.rows).toHaveLength(6)
    expect(s.values.baseline[0]).toBe(100)
    expect(s.values.uplift[0]).toBe(125)

    // Cada periodo baseline crece
    for (let i = 1; i < 6; i++) {
      expect(s.values.baseline[i]).toBeGreaterThan(s.values.baseline[i - 1])
    }

    // Gap uplift - baseline crece (divergencia visible)
    const gaps = s.values.baseline.map((b, i) => s.values.uplift[i] - b)
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThan(gaps[i - 1])
    }
  })
})

describe('buildChartBlock', () => {
  it('emite :::chart GFM válido', () => {
    const block = buildChartBlock({
      type: 'line',
      title: 'Proyección ilustrativa',
      columns: ['Mes', 'Sin', 'Con'],
      rows: [
        ['Mes 1', '100', '125'],
        ['Mes 2', '105', '131'],
      ],
      note: 'Hipótesis de prueba',
    })
    expect(block).toMatch(/^:::chart\{type="line" title="Proyección ilustrativa"\}/)
    expect(block).toContain('| Mes | Sin | Con |')
    expect(block).toContain('| --- | --- | --- |')
    expect(block).toContain('| Mes 1 | 100 | 125 |')
    expect(block).toMatch(/\*Hipótesis de prueba\*/)
  })

  it('rechaza filas desiguales', () => {
    expect(() =>
      buildChartBlock({
        type: 'bar',
        title: 'X',
        columns: ['A', 'B'],
        rows: [['1', '2', '3']],
      })
    ).toThrow(/esperaba 2/)
  })

  it('escapa pipes en celdas', () => {
    const block = buildChartBlock({
      type: 'bar',
      title: 'T',
      columns: ['A', 'B'],
      rows: [['x|y', '1']],
    })
    expect(block).toContain('x\\|y')
  })
})

describe('setChartTypeInBody', () => {
  it('cambia type sin alterar datos', () => {
    const body = `Intro.

:::chart{type="bar" title="Demo"}
| Mes | Sin | Con |
| --- | --- | --- |
| Ene | 10 | 12 |
:::

Cierre.`
    const res = setChartTypeInBody(body, 'line')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.body).toMatch(/type="line"/)
    expect(res.body).toContain('| Ene | 10 | 12 |')
    expect(res.body).toContain('Intro.')
    expect(res.body).toContain('Cierre.')
  })
})

describe('insertScenarioChartInBody', () => {
  it('replaceExisting sustituye :::table', () => {
    const body = `Texto.

:::table{variant="compare"}
| A | B |
| --- | --- |
| 1 | 2 |
:::

Más.`
    const chart = buildChartBlock({
      type: 'line',
      title: 'Proyección ilustrativa',
      columns: ['Mes', 'Sin Buffalo', 'Con Buffalo'],
      rows: [
        ['Mes 1', '100', '125'],
        ['Mes 2', '103', '129'],
      ],
      note: 'Nota',
    })
    const next = insertScenarioChartInBody(body, chart, { replaceExisting: true })
    expect(next).not.toMatch(/:::table/)
    expect(next).toMatch(/:::chart\{type="line"/)
    expect(next).toContain('Texto.')
    expect(next).toContain('Más.')
  })
})

describe('proposal tools — charts', () => {
  function state(draft: string): ProposalToolState {
    return {
      draft,
      contextPack: buildProposalContextPack({
        definition: 'Proyecto demo',
        clientCompany: 'ACME',
      }),
      polishOpts: {},
    }
  }

  it('insert_scenario_chart con replaceExisting', async () => {
    const draft = `# P

Sub.

## ROI

:::table{variant="compare"}
| Escenario | Valor |
| --- | --- |
| Sin | 100 |
| Con | 120 |
:::
`
    const st = state(draft)
    const res = await runProposalTool(
      'insert_scenario_chart',
      {
        section: 1,
        chartType: 'line',
        periods: 4,
        upliftPct: 30,
        replaceExisting: true,
      },
      st
    )
    expect(res.ok).toBe(true)
    expect(st.draft).toMatch(/:::chart\{type="line"/)
    expect(st.draft).toMatch(/Proyección ilustrativa/i)
    expect(st.draft).not.toMatch(/:::table/)
    expect(st.draft).toMatch(/Escenario basado|ilustrativa|hipótesis/i)
  })

  it('set_chart_type no altera filas', async () => {
    const draft = `# P

Sub.

## Uno

:::chart{type="bar" title="Demo"}
| Mes | A | B |
| --- | --- | --- |
| Ene | 10 | 20 |
:::
`
    const st = state(draft)
    const res = await runProposalTool(
      'set_chart_type',
      { section: 1, type: 'area' },
      st
    )
    expect(res.ok).toBe(true)
    expect(st.draft).toMatch(/type="area"/)
    expect(st.draft).toContain('| Ene | 10 | 20 |')
  })
})
