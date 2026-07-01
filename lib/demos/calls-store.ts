import { query } from '@/lib/db'
import type { RetellOutboundVariables } from './outbound-form'
import { buildVoiceMetricsFromRows } from './call-metrics'
import type { DemoVoiceMetrics } from './types'

export async function insertDemoLlamada(input: {
  demo_id: number
  numero_destino: string
  call_id?: string | null
  estado?: string
  variables: RetellOutboundVariables
  error_mensaje?: string | null
}): Promise<void> {
  await query(
    `INSERT INTO demo_llamadas (demo_id, numero_destino, call_id, estado, variables, error_mensaje)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      input.demo_id,
      input.numero_destino,
      input.call_id ?? null,
      input.estado ?? 'iniciada',
      JSON.stringify(input.variables),
      input.error_mensaje ?? null,
    ]
  )
}

export async function getDemoVoiceMetrics(demoId: number): Promise<DemoVoiceMetrics> {
  try {
    const result = await query<{
      numero_destino: string
      estado: string
      variables: Record<string, string> | null
      error_mensaje: string | null
      created_at: Date
    }>(
      `SELECT numero_destino, estado, variables, error_mensaje, created_at
       FROM demo_llamadas
       WHERE demo_id = $1
       ORDER BY created_at DESC`,
      [demoId]
    )

    return buildVoiceMetricsFromRows(
      result.rows.map((r) => ({
        numero_destino: r.numero_destino,
        estado: r.estado,
        variables: r.variables,
        error_mensaje: r.error_mensaje,
        created_at: r.created_at,
      }))
    )
  } catch {
    return {
      testers_count: 0,
      successful_count: 0,
      failed_count: 0,
      total_calls: 0,
      last_activity_at: null,
      sessions: [],
    }
  }
}
