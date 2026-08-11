/**
 * Escritura SSE del chat de propuestas (pages router + tests).
 */

import type { ProposalTurnMemory } from '@/lib/onboarding/proposal-memory'
import type { ProposalDiffStats } from '@/lib/onboarding/proposal-verify'
import {
  formatSseFrame,
  isAbortError,
  type ProposalAgentEvent,
} from '@/lib/onboarding/proposal-agent-events'

export type ProposalChatSseWriter = {
  write: (chunk: string) => void
  flush?: () => void
}

function writeSse(res: ProposalChatSseWriter, event: ProposalAgentEvent): void {
  res.write(formatSseFrame(event))
  if (typeof res.flush === 'function') res.flush()
}

/**
 * Escribe un stream SSE a partir de un agente mockeable.
 * Devuelve si se persistió el resultado.
 */
export async function writeProposalChatSse(opts: {
  res: ProposalChatSseWriter
  run: (
    onEvent: (ev: ProposalAgentEvent) => void,
    signal: AbortSignal
  ) => Promise<{
    content: string
    note: string
    theme?: 'green' | 'light' | 'dark'
    stats?: ProposalDiffStats | null
    intentSatisfied?: boolean | null
    turnMemory?: ProposalTurnMemory | null
  }>
  signal: AbortSignal
  persist: (result: {
    content: string
    turnMemory?: ProposalTurnMemory | null
  }) => Promise<void>
  shouldSave: boolean
}): Promise<{ saved: boolean; frames: number }> {
  const { res, run, signal, persist, shouldSave } = opts
  let frames = 0
  let doneEmitted = false

  const onEvent = (ev: ProposalAgentEvent) => {
    if (signal.aborted) return
    if (ev.type === 'done') doneEmitted = true
    writeSse(res, ev)
    frames += 1
  }

  try {
    const result = await run(onEvent, signal)
    if (signal.aborted) {
      if (!doneEmitted) {
        writeSse(res, { type: 'error', message: 'Cancelado por el usuario' })
        frames += 1
      }
      return { saved: false, frames }
    }
    if (shouldSave) {
      await persist({ content: result.content, turnMemory: result.turnMemory })
    }
    if (!doneEmitted) {
      writeSse(res, {
        type: 'done',
        content: result.content,
        note: result.note,
        theme: result.theme || null,
        stats: result.stats ?? null,
        intentSatisfied: result.intentSatisfied ?? null,
      })
      frames += 1
    }
    return { saved: shouldSave, frames }
  } catch (e) {
    if (isAbortError(e) || signal.aborted) {
      writeSse(res, { type: 'error', message: 'Cancelado por el usuario' })
      frames += 1
      return { saved: false, frames }
    }
    writeSse(res, {
      type: 'error',
      message: e instanceof Error ? e.message : 'Error editando la propuesta',
    })
    frames += 1
    return { saved: false, frames }
  }
}
