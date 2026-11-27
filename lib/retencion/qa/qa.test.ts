import { describe, expect, it } from 'vitest'
import { computeProgress, initialPhases, type BrainPhase } from './types'
import { extractJson, normalizeBrain, normalizeCambios } from './brain-format'
import { parseGithubRepo, scoreRepoPath, selectRepoFiles } from './repo-reader'
import { codePrefix, flow1Of, nextCode } from './store'

describe('computeProgress', () => {
  it('suma el peso de las fases terminadas y la parte hecha de la actual', () => {
    const phases: BrainPhase[] = initialPhases().map((p) =>
      p.id === 'crm' ? { ...p, status: 'done' } : p.id === 'repo' ? { ...p, status: 'running' } : p
    )
    expect(computeProgress(phases, 'repo', 0.5)).toBe(28) // 10 + 35 * 0.5
  })
  it('cuenta las fases saltadas y llega a 100', () => {
    const phases = initialPhases().map((p) => ({ ...p, status: p.id === 'retell' ? ('skipped' as const) : ('done' as const) }))
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
    expect(scoreRepoPath('public/logo.png')).toBe(0)
    const picked = selectRepoFiles(['src/x.ts', 'README.md', 'docs/a.md', 'logo.png', 'src/utils/prompts.js'])
    expect(picked[0]).toBe('README.md')
    expect(picked).not.toContain('logo.png')
  })
})

describe('respuestas de la IA', () => {
  it('saca el JSON aunque venga en un bloque de código', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Aquí tienes: {"a":2} fin')).toEqual({ a: 2 })
  })
  it('normaliza el cerebro y descarta lo vacío', () => {
    const b = normalizeBrain({
      resumen: 'Sistema',
      entradas: [{ nombre: 'WhatsApp', disparador: 'cliente', canal: 'WhatsApp' }, { nombre: '' }, { nombre: 'Campañas', disparador: 'raro' }],
      herramientas: [{ nombre: 'qualify_lead', efecto_real: 'true' }],
      normas_propuestas: [{ regla: 'Trata de tú', gravedad: 'ALTA' }, { regla: '' }],
    })
    expect(b.entradas).toHaveLength(2)
    expect(b.entradas[1].disparador).toBe('cliente')
    expect(b.herramientas[0].efecto_real).toBe(true)
    expect(b.normas_propuestas).toEqual([{ regla: 'Trata de tú', area: '', canal: '', gravedad: 'alta', origen: '' }])
    expect(b.identidad.asistente).toBe('')
  })
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
})

describe('normas', () => {
  it('genera códigos con el prefijo del proyecto', () => {
    expect(codePrefix('PREICO Jurídicos')).toBe('PREICO')
    expect(codePrefix('Elías y Muñoz')).toBe('ELIAS')
    expect(nextCode('PREICO', [])).toBe('PREICO-001')
    expect(nextCode('PREICO', ['PREICO-001', 'PREICO-009', 'OTRO-050'])).toBe('PREICO-010')
  })
  it('lee la configuración del flujo con valores por defecto', () => {
    expect(flow1Of({ flow1: null })).toEqual({ manual: true, tickets: false, repo: false, repo_every_minutes: 1440 })
    expect(flow1Of({ flow1: { tickets: true, repo_every_minutes: 5 } }).repo_every_minutes).toBe(1440)
  })
})
