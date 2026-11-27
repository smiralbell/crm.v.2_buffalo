import { describe, expect, it } from 'vitest'
import { computeProgress, initialPhases, type BrainPhase, type Flow1Config } from './types'
import { normalizeReport, reportPdfOutput } from './reports'
import {
  buildBrain,
  chunkSources,
  emptyFacts,
  extractJson,
  keyOf,
  mergeFacts,
  normalizeCambios,
  normalizeFacts,
  upgradeBrain,
} from './brain-format'
import { mapLimit, parseGithubRepo, scoreRepoPath, selectRepoFiles } from './repo-reader'
import { cleanPhones, codePrefix, flow1Of, nextCode, whatsappOf } from './store'
import { SpiderStopped, argCandidates } from './spider'
import { charsToTokens, estimateCost } from './llm'

describe('computeProgress', () => {
  it('suma el peso de las fases terminadas y la parte hecha de la actual', () => {
    const phases: BrainPhase[] = initialPhases().map((p) =>
      p.id === 'crm' ? { ...p, status: 'done' } : p.id === 'repo' ? { ...p, status: 'running' } : p
    )
    expect(computeProgress(phases, 'repo', 0.5)).toBe(20) // 5 + 30 * 0.5
  })
  it('cuenta las fases saltadas y llega a 100', () => {
    const phases = initialPhases().map((p) => ({ ...p, status: p.id === 'mcp' ? ('skipped' as const) : ('done' as const) }))
    expect(computeProgress(phases, null, 0)).toBe(100)
  })
})

describe('repositorio', () => {
  it('lee GitHub en sus formas habituales', () => {
    expect(parseGithubRepo('https://github.com/smiralbell/PREICO.git')).toEqual({ owner: 'smiralbell', repo: 'PREICO' })
    expect(parseGithubRepo('github.com/org/repo/tree/main')).toEqual({ owner: 'org', repo: 'repo' })
    expect(parseGithubRepo('org/repo')).toEqual({ owner: 'org', repo: 'repo' })
    expect(parseGithubRepo('C:\\Users\\Admin\\PREICO')).toBeNull()
  })
  it('prioriza documentación y prompts y descarta ruido', () => {
    expect(scoreRepoPath('CLAUDE.md')).toBe(100)
    expect(scoreRepoPath('docs/funcionalidades/voz.md')).toBeGreaterThan(scoreRepoPath('src/utils/dni.js'))
    expect(scoreRepoPath('src/utils/prompts.js')).toBeGreaterThan(scoreRepoPath('src/utils/dni.js'))
    expect(scoreRepoPath('node_modules/x/index.js')).toBe(0)
    expect(scoreRepoPath('bun.lock')).toBe(0)
    expect(scoreRepoPath('src/agents/foo.test.js')).toBe(0)
    expect(scoreRepoPath('.claude/worktrees/x/CLAUDE.md')).toBe(0)
    const picked = selectRepoFiles(['src/x.ts', 'README.md', 'docs/a.md', 'logo.png', 'src/utils/prompts.js'].map((p) => ({ path: p, size: 1 })))
    expect(picked[0].path).toBe('README.md')
    expect(picked.map((f) => f.path)).not.toContain('logo.png')
  })
  it('mapLimit respeta el orden y el límite', async () => {
    let live = 0
    let peak = 0
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (x) => {
      live++
      peak = Math.max(peak, live)
      await new Promise((r) => setTimeout(r, 5))
      live--
      return x * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50])
    expect(peak).toBe(2)
  })
})

describe('troceado', () => {
  it('agrupa fuentes pequeñas y parte las grandes sin perder texto', () => {
    const big = Array.from({ length: 300 }, (_, i) => `línea ${i} ${'x'.repeat(30)}`).join('\n')
    const chunks = chunkSources(
      [
        { label: 'a.md', text: 'uno' },
        { label: 'b.md', text: 'dos' },
        { label: 'grande.md', text: big },
      ],
      3000
    )
    expect(chunks.length).toBeGreaterThan(2)
    expect(chunks.every((c) => c.length <= 3000)).toBe(true)
    expect(chunks[0]).toContain('--- a.md ---')
    expect(chunks[0]).toContain('--- b.md ---')
    const joined = chunks.join('\n')
    for (let i = 0; i < 300; i += 37) expect(joined).toContain(`línea ${i} `)
    expect(joined).toContain('grande.md (parte 2)')
  })
})

describe('cerebro', () => {
  it('saca el JSON aunque venga en un bloque de código', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Aquí tienes: {"a":2} fin')).toEqual({ a: 2 })
  })
  it('normaliza los hechos de un trozo', () => {
    const f = normalizeFacts({
      entradas: [{ nombre: 'WhatsApp', disparador: 'cliente', canal: 'WhatsApp', detalle: 'texto, audio', fuentes: ['docs/whatsapp.md'] }, { nombre: '' }, { nombre: 'Campañas', disparador: 'raro' }],
      herramientas: [{ nombre: 'qualify_lead', efecto_real: 'true' }],
      normas_propuestas: [{ regla: 'Trata de tú', gravedad: 'ALTA' }, { regla: '' }],
    })
    expect(f.entradas).toHaveLength(2)
    expect(f.entradas[1].disparador).toBe('cliente')
    expect(f.herramientas[0].efecto_real).toBe(true)
    expect(f.normas_propuestas).toEqual([{ regla: 'Trata de tú', area: '', canal: '', gravedad: 'alta', origen: '' }])
  })
  it('junta los trozos sin perder detalle y sin duplicar', () => {
    const a = { ...emptyFacts(), agentes: [{ nombre: 'Agente principal', rol: 'Atiende', canal: 'WhatsApp', modelo: '', herramientas: ['qualify_lead'], detalle: 'Cualifica tras aceptar el precio.', fuentes: ['a.md'] }] }
    const b = { ...emptyFacts(), agentes: [{ nombre: 'principal', rol: '', canal: '', modelo: 'Haiku', herramientas: ['escalate_to_human'], detalle: 'Deriva a Consultas.', fuentes: ['b.md'] }] }
    const c = { ...emptyFacts(), normas_propuestas: [{ regla: 'Trata de tú', area: '', canal: '', gravedad: 'media' as const, origen: '' }, { regla: 'trata  de  TÚ', area: '', canal: '', gravedad: 'media' as const, origen: '' }] }
    const m = mergeFacts([a, b, c])
    expect(m.agentes).toHaveLength(1)
    expect(m.agentes[0].detalle).toContain('Cualifica tras aceptar el precio.')
    expect(m.agentes[0].detalle).toContain('Deriva a Consultas.')
    expect(m.agentes[0].herramientas).toEqual(['qualify_lead', 'escalate_to_human'])
    expect(m.agentes[0].modelo).toBe('Haiku')
    expect(m.agentes[0].fuentes).toEqual(['a.md', 'b.md'])
    expect(m.normas_propuestas).toHaveLength(1)
    expect(keyOf('Agente Principal')).toBe(keyOf('principal'))
  })
  it('si la IA no consolida las normas, se quedan todas', () => {
    const facts = { ...emptyFacts(), normas_propuestas: [{ regla: 'A', area: '', canal: '', gravedad: 'alta' as const, origen: '' }] }
    expect(buildBrain(facts, {}).normas_propuestas).toHaveLength(1)
    expect(buildBrain(facts, { resumen: 'x', normas: [{ regla: 'B' }, { regla: 'C' }] }).normas_propuestas.map((n) => n.regla)).toEqual(['B', 'C'])
  })
  it('lee cerebros guardados con la forma anterior', () => {
    const old = upgradeBrain({
      resumen: 'r',
      entradas: [{ nombre: 'WhatsApp', disparador: 'cliente', canal: 'WhatsApp', descripcion: 'd', fuente: 'f.md' }],
      voces: [{ proveedor: 'ElevenLabs', voz: 'Lucía', uso: 'audios' }],
      conocimiento: ['Qdrant'],
      normas_propuestas: [{ regla: 'x' }],
    })
    expect(old?.entradas[0]).toMatchObject({ detalle: 'd', fuentes: ['f.md'] })
    expect(old?.modelos[0]).toMatchObject({ nombre: 'Lucía', tipo: 'voz' })
    expect(old?.conocimiento[0].nombre).toBe('Qdrant')
    expect(upgradeBrain(null)).toBeNull()
  })
})

describe('MCP y coste', () => {
  it('saca identificadores de las respuestas anteriores', () => {
    const out = ['{"agentes":[{"id":"principal","nombre":"Principal"},{"id":"seguimiento"}]}', '{"agent_id":"agent_123"}']
    expect(argCandidates('agente', out)).toEqual(expect.arrayContaining(['principal', 'seguimiento', 'agent_123']))
    expect(argCandidates('agent_id', out)).toContain('agent_123')
  })
  it('estima el coste con el precio por token', () => {
    expect(charsToTokens(3500)).toBe(1000)
    expect(estimateCost({ prompt: 0.0000001, completion: 0.0000005 }, 1_000_000, 100_000)).toBeCloseTo(0.15)
    expect(estimateCost(null, 1, 1)).toBeNull()
  })
})

describe('cambios y normas', () => {
  it('normaliza los cambios', () => {
    const c = normalizeCambios({
      cambios: [
        { titulo: 'x', accion: 'modificar', regla: 'nueva regla', norma: 'PREICO-042', conflicto: 'null' },
        { accion: 'inventada', regla: 'algo' },
      ],
    })
    expect(c[0]).toMatchObject({ accion: 'modificar', norma: 'PREICO-042', conflicto: null, gravedad: 'media' })
    expect(c[1]).toMatchObject({ accion: 'no_es_norma', regla: '' })
  })
  it('genera códigos con el prefijo del proyecto', () => {
    expect(codePrefix('PREICO Jurídicos')).toBe('PREICO')
    expect(codePrefix('Elías y Muñoz')).toBe('ELIAS')
    expect(nextCode('PREICO', [])).toBe('PREICO-001')
    expect(nextCode('PREICO', ['PREICO-001', 'PREICO-009', 'OTRO-050'])).toBe('PREICO-010')
  })
  it('lee la configuración del flujo con valores por defecto', () => {
    expect(flow1Of({ flow1: null })).toEqual({ manual: true, tareas: false, repo: false, repo_every_minutes: 1440, whatsapp: { enabled: false, to: [] } })
    expect(flow1Of({ flow1: { tareas: true, repo_every_minutes: 5 } }).repo_every_minutes).toBe(1440)
    // La configuración antigua con tickets no activa las tareas.
    expect(flow1Of({ flow1: { tickets: true } as unknown as Partial<Flow1Config> }).tareas).toBe(false)
  })
  it('limpia los móviles de WhatsApp', () => {
    expect(cleanPhones(['+34 600 11 12 22', '34600111222', '123', 'abc', '0034600333444'])).toEqual(['34600111222', '0034600333444'])
    expect(whatsappOf({ enabled: true, to: ['34600111222'] })).toEqual({ enabled: true, to: ['34600111222'] })
    expect(whatsappOf(null)).toEqual({ enabled: false, to: [] })
  })
})

describe('informes', () => {
  it('normaliza el informe y no inventa campos', () => {
    const r = normalizeReport(
      {
        resumen: 'Bien en general',
        metricas: { revisadas: 30, con_incumplimientos: 2, raro: { x: 1 } },
        items: [
          { titulo: 'Deriva a ATCliente una consulta nueva', detalle: 'd', norma: 'PREICO-016', conversaciones: ['c1 · 26/11'], gravedad: 'ALTA' },
          { titulo: '' },
          { titulo: 'Mejora', norma: 'null', impacto: 'alta', esfuerzo: 'baja', norma_propuesta: 'Ofrecer cita al final' },
        ],
        bien: ['Tono correcto'],
      },
      '25/11 – 26/11'
    )
    expect(r.periodo).toBe('25/11 – 26/11')
    expect(r.metricas).toEqual({ revisadas: 30, con_incumplimientos: 2 })
    expect(r.items).toHaveLength(2)
    expect(r.items[0]).toMatchObject({ norma: 'PREICO-016', gravedad: 'alta' })
    expect(r.items[1]).toMatchObject({ norma: null, impacto: 'alta', esfuerzo: 'baja', norma_propuesta: 'Ofrecer cita al final' })
    expect(normalizeReport(null, 'p').resumen).toBe('Sin resumen.')
  })
  it('prepara el PDF con listas de texto', () => {
    const out = normalizeReport({ resumen: 'x', items: [{ titulo: 'Fallo', norma: 'A-1', gravedad: 'alta', conversaciones: ['c1'] }] }, 'p')
    const pdf = reportPdfOutput('real', out)
    expect(pdf.incumplimientos).toEqual(['[alta] Fallo (A-1) · c1'])
    expect(reportPdfOutput('mejoras', normalizeReport({}, 'p')).mejoras_propuestas).toEqual(['Ninguno.'])
  })
})

describe('parada del rastreo', () => {
  it('la parada lleva las fases y no es un error normal', () => {
    const e = new SpiderStopped(initialPhases())
    expect(e).toBeInstanceOf(Error)
    expect(e.phases).toHaveLength(4)
    expect(e.message).toBe('Rastreo parado')
  })
})
