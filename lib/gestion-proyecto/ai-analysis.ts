import { prisma } from '@/lib/prisma'
import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'
import { buildProjectDashboard } from './dashboard-metrics'
import { sanitizeOnboardingForDeveloper } from './sanitize-onboarding'
import type { ProjectAiSummary, ProjectDashboardData } from './types'

const SYSTEM = `Eres el director de operaciones de Buffalo AI (agencia de agentes IA).
Analizas proyectos en desarrollo para el CEO: avance real, riesgos de entrega, carga del equipo y predicciones.

Recibirás un snapshot JSON con onboarding, métricas del dashboard y listado de tareas por estado.

Responde SOLO con JSON válido (sin markdown), en español:
{
  "resumen_ejecutivo": string (4-6 frases, directo para CEO),
  "salud_proyecto_0_100": number (0-100, salud global del proyecto),
  "estado_actual": string (1-2 frases: cómo va realmente),
  "fortalezas": string[] (máx 4),
  "riesgos": string[] (máx 5, concretos),
  "cuellos_de_botella": string[] (máx 4: bloqueos, dependencias, sobrecarga),
  "mejoras_sugeridas": string[] (máx 5: procesos, priorización, asignación),
  "acciones_prioritarias": string[] (máx 5: verbos, esta semana),
  "predicciones": string[] (máx 4: escenarios si sigue así / si acelera / si se retrasa),
  "por_persona": [
    { "persona": string, "situacion": string }
  ]
}

Reglas:
- Usa SOLO datos del snapshot; no inventes fechas ni cifras.
- Si falta fecha de fin o tareas sin asignar, dilo como riesgo.
- Sé crítico pero constructivo; evita generalidades vacías.
- Las predicciones deben ser casuísticas cualitativas basadas en velocidad y backlog.
- Tono profesional, accionable, en español.`

function truncate(text: string | null | undefined, max = 400): string | null {
  if (!text?.trim()) return null
  const t = text.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

async function fetchProjectContext(projectId: string) {
  const proyectoRows = await prisma.$queryRaw<
    {
      id: string
      name: string
      service_type: string
      status: string
      config_ref: string | null
      created_at: Date
      launched_at: Date | null
      dev_target_end_date: Date | null
    }[]
  >`
    SELECT id, name, service_type, status, config_ref, created_at, launched_at, dev_target_end_date
    FROM proyectos WHERE id = ${projectId}::uuid LIMIT 1
  `.catch(async () => {
    const rows = await prisma.$queryRaw<
      {
        id: string
        name: string
        service_type: string
        status: string
        config_ref: string | null
        created_at: Date
        launched_at: Date | null
      }[]
    >`
      SELECT id, name, service_type, status, config_ref, created_at, launched_at
      FROM proyectos WHERE id = ${projectId}::uuid LIMIT 1
    `
    return rows.map((r) => ({ ...r, dev_target_end_date: null }))
  })

  const proyecto = proyectoRows[0]
  if (!proyecto) return null

  let onboarding = null
  try {
    const obRows = await prisma.$queryRaw<
      {
        summary: string | null
        scope_text: string | null
        stack_text: string | null
        deliverables: string | null
        contacts: string | null
        internal_notes: string | null
      }[]
    >`
      SELECT summary, scope_text, stack_text, deliverables, contacts, internal_notes
      FROM project_dev_onboarding WHERE project_id = ${projectId}::uuid LIMIT 1
    `
    if (obRows[0]) {
      onboarding = sanitizeOnboardingForDeveloper({
        project_id: projectId,
        summary: obRows[0].summary || '',
        client_context: '',
        scope_text: obRows[0].scope_text || '',
        stack_text: obRows[0].stack_text || '',
        deliverables: obRows[0].deliverables || '',
        contacts: obRows[0].contacts || '',
        internal_notes: obRows[0].internal_notes || '',
        updated_at: '',
      })
    }
  } catch {
    // onboarding opcional
  }

  let taskRows: {
    id: string
    title: string
    description: string | null
    status: string
    priority: string
    assignee: string | null
    estimated_hours: number | null
    created_at: Date
    updated_at: Date
  }[] = []

  try {
    taskRows = await prisma.$queryRaw`
      SELECT id, title, description, status, priority, assignee,
        estimated_hours::float AS estimated_hours, created_at, updated_at
      FROM project_dev_tasks WHERE project_id = ${projectId}::uuid
      ORDER BY status, position, created_at
    `
  } catch {
    taskRows = await prisma.$queryRaw`
      SELECT id, title, description, status, priority, assignee, created_at, updated_at
      FROM project_dev_tasks WHERE project_id = ${projectId}::uuid
      ORDER BY status, position, created_at
    `.then((rows) =>
      (rows as typeof taskRows).map((r) => ({ ...r, estimated_hours: null }))
    )
  }

  const tasks = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    description: truncate(t.description),
    status: t.status,
    priority: t.priority,
    assignee: t.assignee,
    estimated_hours: t.estimated_hours,
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
  }))

  const dashboard: ProjectDashboardData = buildProjectDashboard(
    {
      id: proyecto.id,
      name: proyecto.name,
      status: proyecto.status,
      service_type: proyecto.service_type,
      config_ref: proyecto.config_ref,
      created_at: proyecto.created_at.toISOString(),
      launched_at: proyecto.launched_at?.toISOString() ?? null,
      dev_target_end_date: proyecto.dev_target_end_date
        ? proyecto.dev_target_end_date.toISOString().slice(0, 10)
        : null,
    },
    tasks.map((t) => ({
      id: t.id,
      status: t.status as 'pending' | 'in_progress' | 'buffalo_validation' | 'done',
      priority: t.priority as 'low' | 'medium' | 'high',
      assignee: t.assignee,
      estimated_hours: t.estimated_hours,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }))
  )

  return {
    proyecto: {
      nombre: proyecto.name,
      tipo: proyecto.service_type,
      estado: proyecto.status,
      config_ref: proyecto.config_ref,
    },
    onboarding,
    metricas: dashboard,
    tareas: {
      pendientes: tasks.filter((t) => t.status === 'pending'),
      en_curso: tasks.filter((t) => t.status === 'in_progress'),
      hechas: tasks.filter((t) => t.status === 'done'),
    },
  }
}

export async function generateProjectAiAnalysis(projectId: string): Promise<{
  summary: ProjectAiSummary
  model: string
}> {
  const payload = await fetchProjectContext(projectId)
  if (!payload) throw new Error('Proyecto no encontrado')

  const raw = await openRouterChatCompletion(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `Snapshot del proyecto:\n\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
    { temperature: 0.35 }
  )

  const summary = parseJsonFromModelOutput(raw) as ProjectAiSummary
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
  return { summary, model }
}
