/**
 * Eventos del agente de propuestas (SSE / progreso UI).
 */

import type { ProposalDiffStats } from '@/lib/onboarding/proposal-verify'
import type { ProposalSkillId } from '@/lib/onboarding/proposal-skills'

export type ProposalAgentEvent =
  | {
      type: 'start'
      skills: ProposalSkillId[]
      model: 'fast' | 'heavy'
    }
  | {
      type: 'tool'
      name: string
      target?: string
    }
  | {
      type: 'progress'
      done: number
      total: number
      label?: string
    }
  | {
      type: 'retry'
      reason: string
    }
  | {
      type: 'done'
      content: string
      note: string
      theme?: 'green' | 'light' | 'dark' | null
      stats?: ProposalDiffStats | null
      intentSatisfied?: boolean | null
    }
  | {
      type: 'error'
      message: string
    }

/** Una trama SSE `data: …\\n\\n`. */
export function formatSseFrame(event: ProposalAgentEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

/**
 * Parsea un buffer SSE incremental (POST + ReadableStream).
 * Devuelve eventos completos y el resto sin cerrar.
 */
export function parseSseBuffer(buffer: string): {
  events: ProposalAgentEvent[]
  rest: string
} {
  const events: ProposalAgentEvent[] = []
  let rest = buffer
  // Partir por doble salto (SSE frame boundary)
  for (;;) {
    const idx = rest.indexOf('\n\n')
    if (idx < 0) break
    const rawFrame = rest.slice(0, idx)
    rest = rest.slice(idx + 2)
    const dataLines = rawFrame
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
    if (!dataLines.length) continue
    const payload = dataLines.join('\n')
    try {
      const parsed = JSON.parse(payload) as ProposalAgentEvent
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        events.push(parsed)
      }
    } catch {
      // trama malformada: ignorar
    }
  }
  return { events, rest }
}

/** Etiqueta legible del argumento de una herramienta. */
export function toolCallTarget(name: string, args: unknown): string | undefined {
  if (!args || typeof args !== 'object') return undefined
  const a = args as Record<string, unknown>
  if (a.section != null) return String(a.section)
  if (typeof a.query === 'string' && a.query.trim()) return a.query.trim().slice(0, 80)
  if (typeof a.match === 'string' && a.match.trim()) return a.match.trim().slice(0, 60)
  if (typeof a.title === 'string' && a.title.trim()) return a.title.trim().slice(0, 60)
  if (typeof a.instruction === 'string' && a.instruction.trim()) {
    return a.instruction.trim().slice(0, 60)
  }
  if (name.startsWith('local:')) return name.slice(6)
  return undefined
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const err = new Error('Aborted')
  err.name = 'AbortError'
  throw err
}

export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof Error && (e.name === 'AbortError' || e.message === 'Aborted')) ||
    (typeof e === 'object' &&
      e !== null &&
      'name' in e &&
      (e as { name?: string }).name === 'AbortError')
  )
}
