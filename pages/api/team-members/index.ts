import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { query } from '@/lib/db'

const createMemberSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(255),
  color: z.string().optional().nullable(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method === 'GET') {
    try {
      const result = await query<{ id: number; name: string; color: string | null }>(
        `SELECT id, name, color FROM team_members WHERE active = TRUE ORDER BY name ASC`
      )
      return res.status(200).json({ members: result.rows })
    } catch (error) {
      console.error('[TeamMembers API] Error fetching members:', error)
      return res.status(500).json({ error: 'Error al obtener personas' })
    }
  }

  if (req.method === 'POST') {
    try {
      const data = createMemberSchema.parse(req.body)
      const result = await query<{ id: number }>(
        `
        INSERT INTO team_members (name, color)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
        `,
        [data.name, data.color || null]
      )

      const newId = result.rows[0]?.id
      return res.status(201).json({ id: newId })
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors[0].message })
      }
      // Clave única duplicada (nombre ya existe)
      if (error?.code === '23505') {
        return res.status(409).json({ error: 'Ya existe una persona con ese nombre' })
      }
      console.error('[TeamMembers API] Error creating member:', error)
      return res.status(500).json({ error: 'Error al crear persona' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}


