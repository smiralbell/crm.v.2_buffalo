import { addDays, groupByDay, isValidDay, todayMadrid } from '@/lib/trabajo/format'
import { listWorkEntries, listWorkReports } from '@/lib/trabajo/store'
import { resolvePerson, resolveProject } from './task-tools'

/**
 * Trabajo diario del equipo para el agente de los socios: qué ha hecho cada
 * developer o PM un día, una semana o un mes. Solo lectura.
 */

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'function' as const, function: { name, description, parameters: { type: 'object', properties, required } } }
}

export const WORKLOG_TOOLS = [
  tool(
    'trabajo_consultar',
    'Qué ha hecho el equipo (Trabajo diario de developers y PMs): por persona, por proyecto y entre fechas. Devuelve los trabajos agrupados por persona y día, con horas. Úsalo para "qué hizo X ayer / esta semana / el mes pasado", resúmenes, comparativas o estudios de en qué se va el tiempo. Sin fechas: últimos 7 días.',
    {
      persona: { type: 'string', description: 'Nombre (o parte), email o id. Sin persona: todo el equipo' },
      proyecto: { type: 'string', description: 'Nombre (o parte) o id del proyecto' },
      desde: { type: 'string', description: 'YYYY-MM-DD' },
      hasta: { type: 'string', description: 'YYYY-MM-DD' },
      buscar: { type: 'string', description: 'Texto en título o detalle' },
      incluir_mensajes: {
        type: 'boolean',
        description: 'Añade lo que contaron tal cual (texto o audio transcrito). Útil para matices; ocupa más.',
      },
    }
  ),
]

export const WORKLOG_TOOL_NAMES = new Set(WORKLOG_TOOLS.map((t) => t.function.name))

const MAX_ENTRIES = 600

function plain(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

export async function runWorklogTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name !== 'trabajo_consultar') return { ok: false, error: `Herramienta desconocida: ${name}` }

  let userIds: number[] | null = null
  let persona: string | null = null
  if (args.persona) {
    const r = await resolvePerson(args.persona)
    if (!r.ok) return r
    userIds = [r.value.id]
    persona = r.value.name
  }
  let projectId: string | null = null
  let proyecto: string | null = null
  if (args.proyecto) {
    const r = await resolveProject(args.proyecto)
    if (!r.ok) return r
    projectId = r.value.id
    proyecto = r.value.name
  }

  const today = todayMadrid()
  const to = isValidDay(args.hasta) ? String(args.hasta) : today
  const from = isValidDay(args.desde) ? String(args.desde) : addDays(to, -6)
  if (from > to) return { ok: false, error: 'La fecha inicial va después de la final' }

  let entries = await listWorkEntries({ userIds, from, to, projectId })
  const q = plain(args.buscar).trim()
  if (q) entries = entries.filter((e) => plain(`${e.title} ${e.detail ?? ''}`).includes(q))
  const cut = entries.length > MAX_ENTRIES
  if (cut) entries = entries.slice(0, MAX_ENTRIES)

  const byPerson = new Map<string, typeof entries>()
  for (const e of entries) {
    const list = byPerson.get(e.user_name) ?? []
    list.push(e)
    byPerson.set(e.user_name, list)
  }

  const reports =
    args.incluir_mensajes === true
      ? await listWorkReports(Array.from(new Set(entries.map((e) => e.report_id).filter((x): x is string => Boolean(x)))))
      : []

  return {
    ok: true,
    desde: from,
    hasta: to,
    ...(persona ? { persona } : {}),
    ...(proyecto ? { proyecto } : {}),
    total_trabajos: entries.length,
    personas: Array.from(byPerson.entries()).map(([nombre, list]) => {
      const days = groupByDay(list)
      return {
        nombre,
        trabajos: list.length,
        dias_con_trabajo: days.length,
        horas_apuntadas: Math.round(list.reduce((s, e) => s + (e.hours ?? 0), 0) * 100) / 100,
        dias: days.map((d) => ({
          dia: d.date,
          horas: d.hours || undefined,
          trabajos: d.entries.map((e) => ({
            titulo: e.title,
            ...(e.detail ? { detalle: e.detail } : {}),
            ...(e.project_name ? { proyecto: e.project_name } : {}),
            ...(e.hours ? { horas: e.hours } : {}),
          })),
        })),
      }
    }),
    ...(reports.length
      ? {
          mensajes_originales: reports.map((r) => ({
            fecha: r.created_at.slice(0, 10),
            via: r.source,
            texto: r.raw_text.slice(0, 4000),
          })),
        }
      : {}),
    ...(cut ? { nota: `Hay más de ${MAX_ENTRIES} trabajos: acota fechas o persona.` } : {}),
    ...(entries.length === 0 ? { nota: 'No hay trabajo apuntado con esos filtros.' } : {}),
  }
}
