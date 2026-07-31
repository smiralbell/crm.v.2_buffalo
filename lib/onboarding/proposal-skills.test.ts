import { describe, expect, it } from 'vitest'
import { classifyProposalSkill, formatSkillForPrompt } from './proposal-skills'

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
  it('inyecta el catálogo de diseño (incluye :::chart)', () => {
    const block = formatSkillForPrompt('chart')
    expect(block).toMatch(/SKILL ACTIVA: Gráficos/)
    expect(block).toMatch(/:::chart/)
    expect(block).toMatch(/barcompare|donut|pie/)
  })
})
