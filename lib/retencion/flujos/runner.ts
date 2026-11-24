import { openRouterToolTurn, parseJsonFromModelOutput, resolveModel, type ORMessage } from '@/lib/openrouter'
import {
  finishRun,
  getFlujo,
  startRun,
  type FlujoRow,
  type TraceStep,
} from '@/lib/retencion/flujos/store'
import { FLOW_TOOLS, executeFlowTool } from '@/lib/retencion/flujos/tools'

/** Pasos máximos de herramientas por ejecución. Evita bucles y costes sin control. */
export const MAX_TOOL_ROUNDS = 8

export const FLOW_SYSTEM_PROMPT = [
  'Eres un agente de análisis de proyectos de Buffalo AI.',
  'Obtén los datos con las herramientas disponibles (MCP del proyecto, incidencias, tickets).',
  'No inventes cifras: si una herramienta no devuelve un dato, dilo en el JSON.',
  'Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto fuera del JSON.',
  'Si las instrucciones piden una forma concreta, respétala. Si no, usa:',
  '{"resumen": string, "metricas": {}, "hallazgos": [string], "fuentes": [string]}.',
].join('\n')

export type FlowRunResult = {
  runId: string
  status: 'ok' | 'error'
  output: unknown
  error: string | null
  trace: TraceStep[]
}

/** Ejecuta un flujo: el agente usa las herramientas, y la respuesta final se guarda como JSON. */
export async function runFlujo(flujo: FlujoRow, trigger: 'manual' | 'cron'): Promise<FlowRunResult> {
  const runId = await startRun(flujo.id, trigger)
  const trace: TraceStep[] = []
  let output: unknown = null
  let error: string | null = null
  let status: 'ok' | 'error' = 'ok'

  try {
    const messages: ORMessage[] = [
      { role: 'system', content: FLOW_SYSTEM_PROMPT },
      { role: 'user', content: `Proyecto: ${flujo.name}\n\nInstrucciones del flujo:\n${flujo.prompt}` },
    ]

    let final: string | null = null
    for (let round = 0; round < MAX_TOOL_ROUNDS && final === null; round++) {
      const turn = await openRouterToolTurn(messages, FLOW_TOOLS, {
        model: resolveModel('heavy'),
        temperature: 0.1,
      })
      if (turn.toolCalls.length === 0) {
        final = turn.text
        break
      }
      messages.push(turn.assistantMessage)
      for (const call of turn.toolCalls) {
        let args: unknown = call.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {
            args = {}
          }
        }
        const outcome = await executeFlowTool(flujo.proyecto_id, call.name, args)
        trace.push({ tool: call.name, args, ok: outcome.ok, preview: outcome.preview })
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(outcome.result ?? null),
        })
      }
    }

    if (final === null) throw new Error(`El agente no terminó en ${MAX_TOOL_ROUNDS} pasos`)
    try {
      output = parseJsonFromModelOutput(final)
    } catch {
      output = { texto: final }
      throw new Error('La respuesta del agente no era JSON válido')
    }
  } catch (e) {
    status = 'error'
    error = e instanceof Error ? e.message : String(e)
  }

  await finishRun({
    runId,
    flujoId: flujo.id,
    status,
    output,
    trace,
    error,
    intervalMinutes: flujo.interval_minutes,
  })
  return { runId, status, output, error, trace }
}

/** Ejecuta un flujo de un proyecto concreto (comprueba que pertenece al proyecto). */
export async function runFlujoById(proyectoId: string, flujoId: string, trigger: 'manual' | 'cron') {
  const flujo = await getFlujo(proyectoId, flujoId)
  if (!flujo) return null
  return runFlujo(flujo, trigger)
}
