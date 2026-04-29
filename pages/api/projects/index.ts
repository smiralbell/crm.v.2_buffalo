import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listEvaluationProjectsForUI } from '@/lib/evaluation-projects'

function prismaProjectErrorPayload(e: unknown): { status: number; body: Record<string, string> } | null {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2021') {
      return {
        status: 503,
        body: {
          error: 'En la base de datos no existen las tablas de proyectos de evaluación.',
          hint: 'Ejecuta el script sql/add_evaluation_projects.sql en PostgreSQL, o desde el proyecto: npx prisma db push',
        },
      }
    }
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (/evaluation_projects|project_journal_entries|project_ai_analyses/i.test(msg) && /does not exist|no existe/i.test(msg)) {
    return {
      status: 503,
      body: {
        error: 'Faltan tablas de proyectos en PostgreSQL.',
        hint: 'Ejecuta sql/add_evaluation_projects.sql o npx prisma db push',
      },
    }
  }
  return null
}

const createSchema = z.object({
  name: z.string().min(1),
  client_name: z.string().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  tags: z.array(z.string()).optional().default([]),
  opened_at: z.string().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    try {
      const list = await listEvaluationProjectsForUI()
      return res.status(200).json({ projects: list })
    } catch (e) {
      const known = prismaProjectErrorPayload(e)
      if (known) {
        console.error('[projects GET]', e)
        return res.status(known.status).json(known.body)
      }
      console.error('[projects GET]', e)
      return res.status(500).json({ error: 'Error al listar proyectos' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createSchema.parse(req.body)
      const p = await prisma.evaluationProject.create({
        data: {
          name: data.name,
          client_name: data.client_name ?? null,
          is_active: data.is_active,
          tags: data.tags,
          opened_at: data.opened_at ? new Date(data.opened_at) : undefined,
        },
      })
      return res.status(201).json({
        project: {
          id: p.id,
          name: p.name,
          client_name: p.client_name,
          is_active: p.is_active,
          tags: p.tags,
          opened_at: p.opened_at.toISOString(),
          closed_at: p.closed_at?.toISOString() ?? null,
        },
      })
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ error: 'Revisa los datos del formulario', details: e.flatten() })
      }
      const known = prismaProjectErrorPayload(e)
      if (known) {
        console.error('[projects POST]', e)
        return res.status(known.status).json(known.body)
      }
      console.error('[projects POST]', e)
      const msg = e instanceof Error ? e.message : 'Error al crear proyecto'
      return res.status(500).json({
        error: 'Error al crear proyecto',
        ...(process.env.NODE_ENV === 'development' ? { detail: msg } : {}),
      })
    }
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ error: 'Método no permitido' })
}
