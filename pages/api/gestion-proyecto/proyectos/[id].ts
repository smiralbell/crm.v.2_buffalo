import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { buildDefaultOnboarding } from '@/lib/gestion-proyecto/prefill-onboarding'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import { sanitizeOnboardingForDeveloper } from '@/lib/gestion-proyecto/sanitize-onboarding'

type DbProyecto = {
  id: string
  name: string
  service_type: string
  status: string
  config_ref: string | null
  retell_agent_id: string | null
  twilio_number: string | null
  whatsapp_number: string | null
  dashboard_tier: string | null
  lead_id: number | null
  contact_id: number | null
}

async function fetchProyectoContext(id: string) {
  const rows = await prisma.$queryRaw<DbProyecto[]>`
    SELECT
      id, name, service_type, status, config_ref,
      retell_agent_id, twilio_number, whatsapp_number, dashboard_tier,
      lead_id, contact_id
    FROM proyectos
    WHERE id = ${id}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  try {
    await requireProjectAccessAPI(req, res, id)

    const row = await fetchProyectoContext(id)
    if (!row) return res.status(404).json({ error: 'Proyecto no encontrado' })

    let configuracion: string | null = null
    let leadNotas: string | null = null
    let leadValor: number | null = null
    let contact: {
      id: number
      nombre: string | null
      email: string | null
      empresa: string | null
      telefono: string | null
      ciudad: string | null
    } | null = null

    if (row.lead_id) {
      const lead = await prisma.lead.findUnique({
        where: { id: row.lead_id },
        select: {
          configuracion: true,
          notas: true,
          valor: true,
          contact: {
            select: {
              id: true,
              nombre: true,
              email: true,
              empresa: true,
              telefono: true,
              ciudad: true,
            },
          },
        },
      })
      configuracion = lead?.configuracion ?? null
      leadNotas = lead?.notas ?? null
      leadValor = lead?.valor != null ? Number(lead.valor) : null
      contact = lead?.contact ?? null
    } else if (row.contact_id) {
      contact = await prisma.contact.findUnique({
        where: { id: row.contact_id },
        select: {
          id: true,
          nombre: true,
          email: true,
          empresa: true,
          telefono: true,
          ciudad: true,
        },
      })
    }

    if (req.method === 'GET') {
      let onboarding = null
      let docs: unknown[] = []
      let tasks: unknown[] = []

      try {
        const onboardingRows = await prisma.$queryRaw<
          {
            project_id: string
            summary: string | null
            client_context: string | null
            scope_text: string | null
            stack_text: string | null
            deliverables: string | null
            contacts: string | null
            internal_notes: string | null
            updated_at: Date
          }[]
        >`
          SELECT * FROM project_dev_onboarding WHERE project_id = ${id}::uuid LIMIT 1
        `
        onboarding = onboardingRows[0]
          ? sanitizeOnboardingForDeveloper({
              project_id: onboardingRows[0].project_id,
              summary: onboardingRows[0].summary || '',
              client_context: '',
              scope_text: onboardingRows[0].scope_text || '',
              stack_text: onboardingRows[0].stack_text || '',
              deliverables: onboardingRows[0].deliverables || '',
              contacts: onboardingRows[0].contacts || '',
              internal_notes: onboardingRows[0].internal_notes || '',
              updated_at: onboardingRows[0].updated_at.toISOString(),
            })
          : null

        const docRows = await prisma.$queryRaw<
          {
            id: string
            project_id: string
            title: string
            doc_type: string
            url: string | null
            file_name: string | null
            mime_type: string | null
            file_size: number | null
            created_at: Date
          }[]
        >`
          SELECT id, project_id, title, doc_type, url, file_name, mime_type, file_size, created_at
          FROM project_dev_onboarding_docs
          WHERE project_id = ${id}::uuid
          ORDER BY created_at DESC
        `
        docs = docRows.map((d) => ({
          ...d,
          created_at: d.created_at.toISOString(),
        }))

        const taskRows = await prisma.$queryRaw<
          {
            id: string
            project_id: string
            title: string
            description: string | null
            status: string
            priority: string
            assignee: string | null
            position: number
            created_at: Date
            updated_at: Date
          }[]
        >`
          SELECT *
          FROM project_dev_tasks
          WHERE project_id = ${id}::uuid
          ORDER BY position ASC, created_at ASC
        `
        tasks = taskRows.map((t) => ({
          ...t,
          created_at: t.created_at.toISOString(),
          updated_at: t.updated_at.toISOString(),
          attachments: [] as {
            id: string
            task_id: string
            file_name: string
            mime_type: string | null
            file_size: number | null
            created_at: string
          }[],
        }))

        try {
          const attRows = await prisma.$queryRaw<
            {
              id: string
              task_id: string
              file_name: string
              mime_type: string | null
              file_size: number | null
              created_at: Date
            }[]
          >`
            SELECT id, task_id, file_name, mime_type, file_size, created_at
            FROM project_dev_task_attachments
            WHERE project_id = ${id}::uuid
            ORDER BY created_at ASC
          `
          const attMap = new Map<string, typeof attRows>()
          for (const a of attRows) {
            const list = attMap.get(a.task_id) || []
            list.push(a)
            attMap.set(a.task_id, list)
          }
          tasks = (tasks as any[]).map((t) => ({
            ...t,
            attachments: (attMap.get(t.id) || []).map((a) => ({
              ...a,
              created_at: a.created_at.toISOString(),
            })),
          }))
        } catch {
          // tabla de adjuntos opcional hasta ejecutar ALTER_PROJECT_TASK_ATTACHMENTS.sql
        }
      } catch (dbError) {
        const msg = dbError instanceof Error ? dbError.message : ''
        if (msg.includes('project_dev_onboarding') || msg.includes('does not exist')) {
          return res.status(500).json({
            error: 'Faltan tablas de gestión de proyecto.',
            hint: 'Ejecuta prisma/CREATE_PROJECT_GESTION_TABLES.sql en PostgreSQL.',
          })
        }
        throw dbError
      }

      if (!onboarding) {
        const defaults = buildDefaultOnboarding(id, {
          name: row.name,
          service_type: row.service_type,
          status: row.status,
          config_ref: row.config_ref,
          retell_agent_id: row.retell_agent_id,
          twilio_number: row.twilio_number,
          whatsapp_number: row.whatsapp_number,
          dashboard_tier: row.dashboard_tier,
          configuracion,
        })

        await prisma.$executeRaw`
          INSERT INTO project_dev_onboarding (
            project_id, summary, client_context, scope_text, stack_text,
            deliverables, contacts, internal_notes
          ) VALUES (
            ${id}::uuid,
            ${defaults.summary},
            ${defaults.client_context},
            ${defaults.scope_text},
            ${defaults.stack_text},
            ${defaults.deliverables},
            ${defaults.contacts},
            ${defaults.internal_notes}
          )
          ON CONFLICT (project_id) DO NOTHING
        `

        onboarding = sanitizeOnboardingForDeveloper({
          ...defaults,
          updated_at: new Date().toISOString(),
        })
      }

      const safeOnboarding = onboarding!

      return res.status(200).json({
        proyecto: {
          id: row.id,
          name: row.name,
          service_type: row.service_type,
          status: row.status,
          config_ref: row.config_ref,
          lead_id: row.lead_id,
        },
        onboarding: safeOnboarding,
        docs,
        tasks,
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof Error && ['Forbidden', 'No session', 'Invalid session'].includes(error.message)) {
      return
    }
    console.error('[gestion-proyecto/proyectos/[id]]', error)
    return res.status(500).json({ error: 'Error interno del servidor' })
  }
}
