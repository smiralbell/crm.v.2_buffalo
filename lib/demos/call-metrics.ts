import { maskPhone } from './metrics'
import type { DemoSessionStatus, DemoVoiceMetrics, DemoVoiceSessionRow } from './types'

export type DemoLlamadaRow = {
  numero_destino: string
  estado: string
  variables: Record<string, string> | null
  error_mensaje: string | null
  created_at: Date | string
}

function mapCallStatus(estado: string, error: string | null): DemoSessionStatus {
  if (error || estado === 'error') return 'error'
  if (estado === 'completada' || estado === 'registered' || estado === 'iniciada') {
    return estado === 'iniciada' ? 'pending' : 'ok'
  }
  if (estado === 'en_curso') return 'pending'
  return 'ok'
}

export function buildVoiceMetricsFromRows(rows: DemoLlamadaRow[]): DemoVoiceMetrics {
  const byPhone = new Map<
    string,
    {
      calls: number
      ok: number
      failed: number
      lastStatus: DemoSessionStatus
      lastAt: string
      nombre: string | null
    }
  >()

  let successful = 0
  let failed = 0
  let lastActivity: string | null = null

  for (const row of rows) {
    const status = mapCallStatus(row.estado, row.error_mensaje)
    if (status === 'ok') successful++
    if (status === 'error') failed++

    const updated =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString()
    if (!lastActivity || updated > lastActivity) lastActivity = updated

    const vars = row.variables ?? {}
    const nombre =
      typeof vars.nombre === 'string' && vars.nombre.trim() ? vars.nombre.trim() : null

    const prev = byPhone.get(row.numero_destino)
    if (!prev || updated > prev.lastAt) {
      byPhone.set(row.numero_destino, {
        calls: (prev?.calls ?? 0) + 1,
        ok: (prev?.ok ?? 0) + (status === 'ok' ? 1 : 0),
        failed: (prev?.failed ?? 0) + (status === 'error' ? 1 : 0),
        lastStatus: status,
        lastAt: updated,
        nombre,
      })
    } else {
      byPhone.set(row.numero_destino, {
        ...prev,
        calls: prev.calls + 1,
        ok: prev.ok + (status === 'ok' ? 1 : 0),
        failed: prev.failed + (status === 'error' ? 1 : 0),
      })
    }
  }

  const sessions: DemoVoiceSessionRow[] = Array.from(byPhone.entries()).map(([phone, s]) => ({
    phone,
    phone_masked: maskPhone(phone),
    nombre: s.nombre,
    calls_count: s.calls,
    status: s.lastStatus,
    updated_at: s.lastAt,
  }))

  sessions.sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  return {
    testers_count: sessions.length,
    successful_count: successful,
    failed_count: failed,
    total_calls: rows.length,
    last_activity_at: lastActivity,
    sessions,
  }
}
