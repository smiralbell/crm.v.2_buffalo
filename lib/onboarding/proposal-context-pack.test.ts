import { describe, expect, it } from 'vitest'
import {
  buildProposalContextPack,
  truncateByParagraphs,
} from './proposal-context-pack'

describe('truncateByParagraphs', () => {
  it('no corta a mitad si cabe entero', () => {
    expect(truncateByParagraphs('Hola mundo', 100)).toBe('Hola mundo')
  })

  it('corta por párrafos', () => {
    const text = 'Uno.\n\nDos tres cuatro.\n\nCinco seis.'
    const out = truncateByParagraphs(text, 20)
    expect(out.length).toBeLessThanOrEqual(25)
    expect(out).toMatch(/Uno/)
    expect(out).not.toMatch(/Cinco/)
  })
})

describe('buildProposalContextPack', () => {
  it('incluye metadatos y footer de no inventar', () => {
    const pack = buildProposalContextPack({
      projectName: 'Agente Acme',
      clientName: 'Ana',
      clientCompany: 'Acme SL',
      setupFee: 5000,
      monthlyFee: 900,
      definition: 'Automatizar tickets de soporte.',
      context: 'Auditoría: 400 tickets/mes por email.',
    })
    expect(pack.block).toMatch(/## Cliente y economía/)
    expect(pack.block).toMatch(/Acme SL/)
    expect(pack.block).toMatch(/## Definición del proyecto/)
    expect(pack.block).toMatch(/## Contexto CRM/)
    expect(pack.block).toMatch(/A definir con el cliente/)
    expect(pack.sources).toEqual(expect.arrayContaining(['definicion', 'auditoria', 'precios']))
    expect(pack.chars).toBe(pack.block.length)
  })

  it('respeta maxChars y conserva metadatos', () => {
    const longDef = Array.from({ length: 80 }, (_, i) => `Párrafo definición ${i}.`).join('\n\n')
    const longCtx = Array.from({ length: 80 }, (_, i) => `Párrafo auditoría ${i}.`).join('\n\n')
    const pack = buildProposalContextPack({
      projectName: 'Proyecto X',
      clientCompany: 'Cliente Y',
      setupFee: 1000,
      definition: longDef,
      context: longCtx,
      maxChars: 1200,
    })
    expect(pack.chars).toBeLessThanOrEqual(1200)
    expect(pack.block).toMatch(/Proyecto X/)
    expect(pack.block).toMatch(/Cliente Y/)
    expect(pack.block).toMatch(/Setup/)
    expect(pack.block).toMatch(/A definir con el cliente/)
  })
})
