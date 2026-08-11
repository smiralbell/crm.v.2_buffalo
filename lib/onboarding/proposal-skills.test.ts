import { describe, expect, it } from 'vitest'
import {
  classifyProposalSkill,
  formatSkillForPrompt,
  proposalSkillModelTier,
} from './proposal-skills'
import { buildProposalEditSystem } from './proposal-prompt'
import { PROPOSAL_DESIGN_CATALOG } from './proposal-design-catalog'
import { BRM_RENDERER_DIRECTIVES } from '@/components/retencion/report/remarkBuffaloDirectives'

describe('classifyProposalSkill — chart', () => {
  it('detecta pedidos de gráfico', () => {
    expect(classifyProposalSkill('hazme un gráfico de la evolución de tickets')).toBe('chart')
    expect(classifyProposalSkill('añade un chart de barras')).toBe('chart')
    expect(classifyProposalSkill('represéntalo visualmente en una gráfica')).toBe('chart')
    expect(
      classifyProposalSkill('añade un gráfico de barras comparando el coste manual vs Buffalo')
    ).toBe('chart')
    expect(classifyProposalSkill('pon un donut del mix de canales')).toBe('chart')
  })

  it('no confunde diseño genérico con chart cuando hay palabra gráfico', () => {
    expect(classifyProposalSkill('haz una card bonita con un gráfico dentro')).toBe('chart')
  })

  it('design sigue capturando tablas/cards sin gráfico', () => {
    expect(classifyProposalSkill('hazme una tabla más bonita')).toBe('design')
    expect(classifyProposalSkill('ponlo en cards')).toBe('design')
  })
})

describe('formatSkillForPrompt — chart', () => {
  it('activa la skill de gráficos (el catálogo va en buildProposalEditSystem)', () => {
    const block = formatSkillForPrompt('chart')
    expect(block).toMatch(/SKILL ACTIVA: Gráficos/)
    expect(block).toMatch(/:::chart|insertar|gráfico/i)
  })
})

describe('buildProposalEditSystem — catálogo siempre presente', () => {
  it('inyecta el catálogo completo aunque la skill no sea design', () => {
    const system = buildProposalEditSystem(formatSkillForPrompt('section_edit'))
    expect(system).toContain(PROPOSAL_DESIGN_CATALOG.slice(0, 40))
    expect(system).toMatch(/:::chart/)
    expect(system).toMatch(/:::roi/)
    expect(system).toMatch(/:::kpi-grid/)
  })
})

describe('catálogo vs renderer', () => {
  // Guardián: si alguien añade una directiva al renderer y no la documenta, la IA
  // nunca la usará. Exigimos la forma ":::nombre" — un `includes(nombre)` suelto
  // pasaría por subcadena ("card" dentro de "cards") y no probaría nada.
  it('documenta en el catálogo todas las directivas del renderer', () => {
    const catalog = PROPOSAL_DESIGN_CATALOG.toLowerCase()
    const missing = BRM_RENDERER_DIRECTIVES.filter((d) => !catalog.includes(`:::${d}`))
    expect(missing, `Faltan en catálogo: ${missing.join(', ')}`).toEqual([])
  })
})

describe('proposalSkillModelTier', () => {
  it('usa el modelo bueno para todo lo que implique redactar', () => {
    for (const id of ['section_edit', 'design', 'chart', 'language', 'regenerate'] as const) {
      expect(proposalSkillModelTier(id), id).toBe('heavy')
    }
  })

  it('reserva el rápido para cambios estructurales', () => {
    for (const id of ['layout', 'cover', 'acceptance'] as const) {
      expect(proposalSkillModelTier(id), id).toBe('fast')
    }
  })

  it('trata lo imprevisible (general) como redacción', () => {
    expect(proposalSkillModelTier('general')).toBe('heavy')
  })
})
