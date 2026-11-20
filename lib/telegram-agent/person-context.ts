import { prisma } from '@/lib/prisma'

/**
 * Todo lo que sabe el CRM de una persona, en una sola llamada, para que el agente
 * de los socios responda con contexto cuando se habla de alguien:
 *  - del equipo (crm_users): rol, proyectos, tareas abiertas, tickets;
 *  - clientes y leads (contacts / leads): estado, notas, actividad, proyectos, facturas, tickets.
 * Solo lectura y solo para los socios (el agente del equipo no lo tiene).
 * Cada bloque va por separado: si una tabla falta o falla, el resto sale igual.
 */

const MAX_MATCHES = 3

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

function day(v: unknown): string | null {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/$/, '')
}

async function teamContext(q: string) {
  const users = await safe(
    () => prisma.$queryRaw<{ id: number; name: string; email: string; role: string; active: boolean }[]>`
      SELECT id, name, email, role, active FROM crm_users
      WHERE name ILIKE ${`%${q}%`} OR email ILIKE ${`%${q}%`}
      ORDER BY active DESC, name LIMIT ${MAX_MATCHES}
    `,
    []
  )
  return Promise.all(
    users.map(async (u) => {
      const firstName = u.name.split(' ')[0] || u.name
      const [projects, personal, projectTasks, tickets] = await Promise.all([
        safe(
          () => prisma.$queryRaw<{ name: string; status: string }[]>`
            SELECT p.name, p.status FROM crm_user_projects up JOIN proyectos p ON p.id = up.project_id
            WHERE up.user_id = ${u.id} ORDER BY p.name
          `,
          []
        ),
        safe(
          () => prisma.$queryRaw<{ title: string; status: string; due_date: Date | null }[]>`
            SELECT title, status, due_date FROM crm_user_tasks
            WHERE user_id = ${u.id} AND status <> 'done'
            ORDER BY due_date NULLS LAST, created_at DESC LIMIT 30
          `,
          []
        ),
        safe(
          () => prisma.$queryRaw<{ title: string; status: string; due_date: Date | null; proyecto: string }[]>`
            SELECT t.title, t.status, t.due_date, p.name AS proyecto
            FROM project_dev_tasks t JOIN proyectos p ON p.id = t.project_id
            WHERE t.status <> 'done'
              AND (${u.id}::int = ANY(t.assignee_user_ids)
                   OR (cardinality(t.assignee_user_ids) = 0 AND t.assignee ILIKE ${`%${firstName}%`}))
            ORDER BY t.due_date NULLS LAST, t.updated_at DESC LIMIT 30
          `,
          []
        ),
        safe(
          () => prisma.$queryRaw<{ title: string; status: string; proyecto: string }[]>`
            SELECT t.title, t.status, p.name AS proyecto FROM tickets t JOIN proyectos p ON p.id = t.project_id
            WHERE t.assignee_user_id = ${u.id} AND t.status IN ('open', 'in_progress')
            ORDER BY t.created_at DESC LIMIT 20
          `,
          []
        ),
      ])
      const today = new Date().toISOString().slice(0, 10)
      const all = [...personal.map((t) => ({ ...t, proyecto: null as string | null })), ...projectTasks]
      return {
        tipo: 'equipo',
        nombre: u.name,
        email: u.email,
        rol: u.role,
        activo: u.active,
        proyectos: projects.map((p) => `${p.name} (${p.status})`),
        tareas_abiertas: all.length,
        tareas_vencidas: all.filter((t) => {
          const d = day(t.due_date)
          return d !== null && d < today
        }).length,
        tareas: all.slice(0, 12).map((t) => ({
          titulo: t.title,
          estado: t.status,
          fin: day(t.due_date),
          proyecto: t.proyecto ?? undefined,
        })),
        tickets_abiertos: tickets.map((t) => ({ titulo: t.title, estado: t.status, proyecto: t.proyecto })),
      }
    })
  )
}

async function clientContext(q: string) {
  const like = `%${q}%`
  const contacts = await safe(
    () => prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT c.id, c.nombre, c.empresa, c.email, c.telefono, c.ciudad,
             l.id AS lead_id, l.estado, l.origen_principal AS origen, l.prioridad, l.valor,
             l.notas, l.ultima_interaccion, l.created_at AS lead_creado
      FROM contacts c LEFT JOIN leads l ON l.contact_id = c.id
      WHERE c.nombre ILIKE ${like} OR c.empresa ILIKE ${like} OR c.email ILIKE ${like} OR c.telefono ILIKE ${like}
      ORDER BY l.updated_at DESC NULLS LAST, c.updated_at DESC
      LIMIT ${MAX_MATCHES}
    `,
    []
  )
  return Promise.all(
    contacts.map(async (c) => {
      const contactId = Number(c.id)
      const leadId = c.lead_id == null ? null : Number(c.lead_id)
      const [activity, projects, invoices] = await Promise.all([
        safe(
          () => prisma.$queryRaw<{ kind: string; title: string; body: string | null; created_at: Date; created_by: string | null }[]>`
            SELECT kind, title, body, created_at, created_by FROM crm_activities
            WHERE contact_id = ${contactId} OR (${leadId}::int IS NOT NULL AND lead_id = ${leadId}::int)
            ORDER BY created_at DESC LIMIT 8
          `,
          []
        ),
        safe(
          () => prisma.$queryRaw<{ name: string; status: string; tickets_abiertos: number }[]>`
            SELECT p.name, p.status,
                   (SELECT COUNT(*)::int FROM tickets t WHERE t.project_id = p.id AND t.status IN ('open', 'in_progress')) AS tickets_abiertos
            FROM proyectos p
            WHERE p.contact_id = ${contactId} OR (${leadId}::int IS NOT NULL AND p.lead_id = ${leadId}::int)
            ORDER BY p.created_at DESC LIMIT 10
          `,
          []
        ),
        leadId
          ? safe(
              () => prisma.$queryRaw<
                { invoice_number: string | null; total: unknown; status: string; issue_date: Date; due_date: Date | null; pagada: boolean }[]
              >`
                SELECT invoice_number, total, status, issue_date, due_date, (bank_transaction_id IS NOT NULL) AS pagada
                FROM invoices
                WHERE lead_id = ${leadId} AND deleted_at IS NULL AND COALESCE(invoice_source, 'client') = 'client'
                ORDER BY issue_date DESC LIMIT 12
              `,
              []
            )
          : Promise.resolve([]),
      ])
      const pending = invoices.filter((i) => !i.pagada && ['draft', 'sent'].includes(i.status))
      return {
        tipo: leadId ? 'lead/cliente' : 'contacto',
        nombre: c.nombre,
        empresa: c.empresa,
        email: c.email,
        telefono: c.telefono,
        ciudad: c.ciudad,
        lead: leadId
          ? {
              id: leadId,
              estado: c.estado,
              origen: c.origen,
              prioridad: c.prioridad,
              valor: num(c.valor),
              ultima_interaccion: day(c.ultima_interaccion),
              desde: day(c.lead_creado),
              // Lo último de las notas, que es lo más reciente
              notas: c.notas ? String(c.notas).slice(-1500) : undefined,
              enlace: `${baseUrl()}/leads/${leadId}`,
            }
          : undefined,
        actividad: activity.map((a) => ({
          fecha: day(a.created_at),
          tipo: a.kind,
          titulo: a.title,
          texto: a.body ? a.body.slice(0, 300) : undefined,
          por: a.created_by ?? undefined,
        })),
        proyectos: projects.map((p) => ({ nombre: p.name, estado: p.status, tickets_abiertos: p.tickets_abiertos })),
        facturas: invoices.length
          ? {
              total: invoices.length,
              pendientes: pending.length,
              importe_pendiente: pending.reduce((s, i) => s + (num(i.total) ?? 0), 0),
              ultimas: invoices.slice(0, 4).map((i) => ({
                numero: i.invoice_number,
                total: num(i.total),
                estado: i.pagada ? 'pagada' : i.status,
                fecha: day(i.issue_date),
                vence: day(i.due_date),
              })),
            }
          : undefined,
      }
    })
  )
}

export const PERSON_CONTEXT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'contexto_persona',
    description:
      'Todo el contexto del CRM sobre una persona en una sola llamada: si es del equipo (rol, proyectos, tareas abiertas y vencidas, tickets) y si es cliente, lead o contacto (estado, notas recientes, actividad, proyectos, facturas pendientes, tickets). Úsala SIEMPRE antes de responder cuando se hable de alguien por su nombre o empresa.',
    parameters: {
      type: 'object',
      properties: { nombre: { type: 'string', description: 'Nombre, empresa, email o teléfono (o parte)' } },
      required: ['nombre'],
    },
  },
}

export async function gatherPersonContext(raw: unknown): Promise<unknown> {
  const q = String(raw ?? '').trim()
  if (q.length < 2) return { ok: false, error: 'Dime al menos 2 letras del nombre' }
  const [equipo, clientes] = await Promise.all([teamContext(q), clientContext(q)])
  const n = equipo.length + clientes.length
  if (!n) {
    return { ok: true, encontrados: 0, nota: `No hay nadie en el CRM que coincida con "${q}". Prueba con el apellido, la empresa o el email.` }
  }
  return {
    ok: true,
    encontrados: n,
    ...(n > 1 ? { aviso: 'Hay varias coincidencias: si no está claro de quién hablan, pregunta.' } : {}),
    equipo,
    clientes,
  }
}
