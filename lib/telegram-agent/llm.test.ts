import { describe, expect, it } from 'vitest'
import { MAX_TOOL_RESULT, supportsPromptCache, toolResultContent, withPromptCache, type LlmMessage } from './llm'

describe('supportsPromptCache', () => {
  it('solo los modelos de Anthropic', () => {
    expect(supportsPromptCache('anthropic/claude-sonnet-5.5')).toBe(true)
    expect(supportsPromptCache('~anthropic/claude-sonnet-latest')).toBe(true)
    expect(supportsPromptCache('openai/gpt-4o-mini')).toBe(false)
  })
})

describe('withPromptCache', () => {
  const messages: LlmMessage[] = [
    { role: 'system', content: 'instrucciones' },
    { role: 'user', content: 'hola' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'c1', name: 'x', content: '{"ok":true}' },
  ]

  it('marca las instrucciones y el último mensaje, y nada más', () => {
    const out = withPromptCache(messages)
    const marked = out.map((m) => Array.isArray(m.content) && m.content.some((p) => p.cache_control))
    expect(marked).toEqual([true, false, false, true])
    expect(out[3]).toMatchObject({ role: 'tool', tool_call_id: 'c1' })
  })

  it('no toca los mensajes originales (el historial sigue siendo texto)', () => {
    withPromptCache(messages)
    expect(typeof messages[0].content).toBe('string')
    expect(typeof messages[3].content).toBe('string')
  })

  it('con solo las instrucciones, una sola marca', () => {
    const out = withPromptCache([{ role: 'system', content: 'x' }])
    expect(out).toHaveLength(1)
    expect(Array.isArray(out[0].content)).toBe(true)
  })
})

describe('toolResultContent', () => {
  it('lo pequeño va entero', () => {
    expect(toolResultContent({ filas: [1, 2] })).toBe('{"filas":[1,2]}')
  })

  it('lo grande se recorta y le dice al agente que filtre en vez de pedir más', () => {
    const big = { filas: Array.from({ length: 2000 }, (_, i) => ({ id: i, nombre: `Lead ${i}` })) }
    const text = toolResultContent(big)
    expect(text.length).toBeLessThan(MAX_TOOL_RESULT + 300)
    expect(text).toContain('recortado')
    expect(text).toContain('GROUP BY')
  })
})
