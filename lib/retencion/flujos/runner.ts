import { openRouterToolTurn, parseJsonFromModelOutput, resolveModel, type ORMessage } from '@/lib/openrouter'
import {
  finishRun,
  getFlujo,
  startRun,
  type FlujoRow,
  type TraceStep,
} from '@/lib/retencion/flujos/store'
import { executeFlowTool, toolsForGroups } from '@/lib/retencion/flujos/tools'
import { sendFlowToWhatsapp } from '@/lib/retencion/flujos/whatsapp'
import { checkStop, markFinished, markRunning, raceStop, RunStopped } from '@/lib/retencion/run-control'

/** Clave para parar un flujo propio en marcha. */
export const flujoKey = (flujoId: string) => `flujo:${flujoId}`

/** Pasos máximos de herramientas por ejecución. Evita bucles y costes sin control. */
export const MAX_TOOL_ROUNDS = 8

export const FLOW_SYSTEM_PROMPT = [
  'Eres un agente de análisis de proyectos de Buffalo AI.',
  'Obtén los datos con las herramientas que tengas disponibles en este flujo.',
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
export async function runFlujo(
  flujo: FlujoRow,
  trigger: 'manual' | 'cron',
  opts: { onStart?: (runId: string) => void } = {}
): Promise<FlowRunResult> {
  const runId = await startRun(flujo.id, trigger)
  opts.onStart?.(runId)
  const key = flujoKey(flujo.id)
  markRunning(key)
  const trace: TraceStep[] = []
  let output: unknown = null
  let error: string | null = null
  let status: 'ok' | 'error' = 'ok'
  let stopped = false

  try {
    const messages: ORMessage[] = [
      { role: 'system', content: FLOW_SYSTEM_PROMPT },
      { role: 'user', content: `Proyecto: ${flujo.name}\n\nInstrucciones del flujo:\n${flujo.prompt}` },
    ]

    let final: string | null = null
    for (let round = 0; round < MAX_TOOL_ROUNDS && final === null; round++) {
      checkStop(key)
      const turn = await raceStop(
        key,
        openRouterToolTurn(messages, toolsForGroups(flujo.tools), {
          model: resolveModel('heavy'),
          temperature: 0.1,
        })
      )
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
        checkStop(key)
        const outcome = await raceStop(key, executeFlowTool(flujo.proyecto_id, call.name, args, flujo.tools))
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
    stopped = e instanceof RunStopped
    error = stopped ? 'Parado a mano' : e instanceof Error ? e.message : String(e)
  } finally {
    markFinished(key)
  }
  if (stopped) trace.push({ tool: 'parar', args: {}, ok: false, preview: 'Parado a mano' })

  // Nodo «Enviar por WhatsApp»: el informe en PDF a cada móvil, solo si el flujo ha ido bien.
  if (status === 'ok' && flujo.whatsapp_enabled && flujo.whatsapp_to.length > 0) {
    try {
      const wa = await sendFlowToWhatsapp(flujo, output)
      trace.push({
        tool: 'whatsapp',
        args: { to: flujo.whatsapp_to },
        ok: wa.errors.length === 0,
        preview: wa.errors.length ? `Enviado a ${wa.sent}. Fallos: ${wa.errors.join('; ')}` : `PDF enviado a ${wa.sent} móvil(es)`,
      })
    } catch (e) {
      trace.push({ tool: 'whatsapp', args: {}, ok: false, preview: e instanceof Error ? e.message : String(e) })
    }
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

/**
 * Lanza el flujo en segundo plano y devuelve su ejecución al momento. La pantalla sigue
 * el resultado consultando las ejecuciones: así una ejecución larga no choca con el
 * tiempo máximo de respuesta del proxy (Cloudflare corta a los 100 s).
 */
export async function launchFlujoById(proyectoId: string, flujoId: string): Promise<{ runId: string } | null> {
  const flujo = await getFlujo(proyectoId, flujoId)
  if (!flujo) return null
  return new Promise((resolve, reject) => {
    let started = false
    runFlujo(flujo, 'manual', {
      onStart: (runId) => {
        started = true
        resolve({ runId })
      },
    }).catch((e) => {
      if (!started) reject(e)
      else console.error('[retencion/flujos/run]', e)
    })
  })
}
