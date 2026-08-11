import { describe, expect, it, vi } from 'vitest'
import {
  formatSseFrame,
  parseSseBuffer,
  type ProposalAgentEvent,
} from './proposal-agent-events'
import { writeProposalChatSse } from './proposal-chat-sse'

describe('proposal SSE frames', () => {
  it('formatea tramas data: bien formadas', () => {
    const frame = formatSseFrame({
      type: 'start',
      skills: ['section_edit'],
      model: 'heavy',
    })
    expect(frame).toBe(
      'data: {"type":"start","skills":["section_edit"],"model":"heavy"}\n\n'
    )
  })

  it('parsea un buffer con varias tramas', () => {
    const joined = [
      formatSseFrame({ type: 'start', skills: ['layout'], model: 'fast' }),
      formatSseFrame({ type: 'tool', name: 'read_section', target: 'Uno' }),
      formatSseFrame({
        type: 'done',
        content: '# ok',
        note: 'listo',
        theme: null,
        stats: null,
        intentSatisfied: true,
      }),
    ].join('')
    const { events, rest } = parseSseBuffer(joined)
    expect(rest).toBe('')
    expect(events).toHaveLength(3)
    expect(events[0]?.type).toBe('start')
    expect(events[1]?.type).toBe('tool')
    expect(events[2]?.type).toBe('done')
  })

  it('conserva el resto incompleto', () => {
    const partial = 'data: {"type":"start"'
    const { events, rest } = parseSseBuffer(partial)
    expect(events).toHaveLength(0)
    expect(rest).toBe(partial)
  })
})

describe('writeProposalChatSse', () => {
  it('escribe 3 tramas data: de un agente mock y cierra sin error', async () => {
    const chunks: string[] = []
    const res = {
      write: (s: string) => {
        chunks.push(s)
      },
      flush: vi.fn(),
    }

    const mockEvents: ProposalAgentEvent[] = [
      { type: 'start', skills: ['section_edit'], model: 'heavy' },
      { type: 'tool', name: 'read_section', target: 'Punto de partida' },
      {
        type: 'done',
        content: '# Doc\n\n## Uno\n\nTexto.',
        note: '+12 palabras',
        theme: null,
        stats: null,
        intentSatisfied: true,
      },
    ]

    const ac = new AbortController()
    const persist = vi.fn(async () => undefined)

    const { frames, saved } = await writeProposalChatSse({
      res: res as never,
      signal: ac.signal,
      shouldSave: true,
      persist,
      run: async (onEvent) => {
        for (const ev of mockEvents) onEvent(ev)
        return {
          content: '# Doc\n\n## Uno\n\nTexto.',
          note: '+12 palabras',
          intentSatisfied: true,
          turnMemory: null,
        }
      },
    })

    expect(frames).toBe(3)
    expect(saved).toBe(true)
    expect(persist).toHaveBeenCalledOnce()
    const body = chunks.join('')
    expect(body.match(/^data: /gm)?.length).toBe(3)
    expect(body).toContain('"type":"start"')
    expect(body).toContain('"type":"tool"')
    expect(body).toContain('"type":"done"')
    // Cada trama termina en doble salto
    expect(chunks.every((c) => c.endsWith('\n\n'))).toBe(true)
  })

  it('no persiste si se cancela', async () => {
    const chunks: string[] = []
    const res = { write: (s: string) => chunks.push(s), flush: vi.fn() }
    const ac = new AbortController()
    const persist = vi.fn(async () => undefined)

    const { saved } = await writeProposalChatSse({
      res: res as never,
      signal: ac.signal,
      shouldSave: true,
      persist,
      run: async (onEvent, signal) => {
        onEvent({ type: 'start', skills: ['general'], model: 'heavy' })
        ac.abort()
        if (signal.aborted) {
          const err = new Error('Aborted')
          err.name = 'AbortError'
          throw err
        }
        return { content: 'x', note: 'n' }
      },
    })

    expect(saved).toBe(false)
    expect(persist).not.toHaveBeenCalled()
    expect(chunks.join('')).toMatch(/Cancelado/)
  })
})
