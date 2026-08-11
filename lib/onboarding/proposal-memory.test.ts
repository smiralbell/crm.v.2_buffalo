import { describe, expect, it } from 'vitest'
import {
  buildFeedbackRelaunch,
  isFeedbackOnly,
  type ProposalTurnMemory,
} from './proposal-memory'
import { diffProposalStats } from './proposal-verify'

describe('isFeedbackOnly', () => {
  it('detecta frases de feedback', () => {
    expect(isFeedbackOnly('lo veo igual')).toBe(true)
    expect(isFeedbackOnly('no ha cambiado')).toBe(true)
    expect(isFeedbackOnly('sigue igual')).toBe(true)
    expect(isFeedbackOnly('no me gusta')).toBe(true)
    expect(isFeedbackOnly('otra vez')).toBe(true)
    expect(isFeedbackOnly('repite')).toBe(true)
    expect(isFeedbackOnly('no es eso')).toBe(true)
    expect(isFeedbackOnly('mas de lo mismo')).toBe(true)
    expect(isFeedbackOnly('igual que antes')).toBe(true)
    expect(isFeedbackOnly('no funciona')).toBe(true)
  })

  it('no marca instrucciones con contenido real', () => {
    expect(isFeedbackOnly('amplía el punto 4')).toBe(false)
    expect(isFeedbackOnly('quita los saltos de página')).toBe(false)
    expect(isFeedbackOnly('añade un gráfico de barras')).toBe(false)
  })
})

describe('buildFeedbackRelaunch', () => {
  it('incluye la instrucción anterior y pide agresividad', () => {
    const stats = diffProposalStats('a', 'a b')
    const last: ProposalTurnMemory = {
      instruction: 'amplía el punto 4',
      tools: ['replace_section'],
      sections: ['Qué construiremos'],
      stats,
      satisfied: false,
    }
    const out = buildFeedbackRelaunch(last, 'lo veo igual')
    expect(out).toMatch(/amplía el punto 4/)
    expect(out).toMatch(/agresiva/i)
    expect(out).toMatch(/replace_section/)
  })
})
