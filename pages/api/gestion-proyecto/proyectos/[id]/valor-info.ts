import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { requireProjectAccessAPI } from '@/lib/gestion-proyecto/require-project-access'
import {
  emptyValorInfo,
  normalizePasswordEntry,
  parseValorInfo,
  type ProjectPasswordEntry,
  type ProjectValorInfo,
} from '@/lib/gestion-proyecto/valor-info'

async function ensureColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE project_dev_onboarding
      ADD COLUMN IF NOT EXISTS repo_url TEXT,
      ADD COLUMN IF NOT EXISTS passwords_json JSONB NOT NULL DEFAULT '[]'::jsonb
  `)
}

async function ensureOnboardingRow(projectId: string) {
  await prisma.$executeRaw`
    INSERT INTO project_dev_onboarding (project_id)
    VALUES (${projectId}::uuid)
    ON CONFLICT (project_id) DO NOTHING
  `
}

async function loadValorInfo(projectId: string): Promise<ProjectValorInfo> {
  try {
    const rows = await prisma.$queryRaw<{ repo_url: string | null; passwords_json: unknown }[]>`
      SELECT repo_url, passwords_json
      FROM project_dev_onboarding
      WHERE project_id = ${projectId}::uuid
      LIMIT 1
    `
    if (!rows[0]) return emptyValorInfo()
    return parseValorInfo(rows[0].repo_url, rows[0].passwords_json)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg.includes('repo_url') || msg.includes('passwords_json') || msg.includes('does not exist')) {
      await ensureColumns()
      const rows = await prisma.$queryRaw<{ repo_url: string | null; passwords_json: unknown }[]>`
        SELECT repo_url, passwords_json
        FROM project_dev_onboarding
        WHERE project_id = ${projectId}::uuid
        LIMIT 1
      `
      if (!rows[0]) return emptyValorInfo()
      return parseValorInfo(rows[0].repo_url, rows[0].passwords_json)
    }
    throw e
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id || '')
  if (!id) return res.status(400).json({ error: 'ID requerido' })

  try {
    await requireProjectAccessAPI(req, res, id)

    if (req.method === 'GET') {
      await ensureOnboardingRow(id)
      const info = await loadValorInfo(id)
      return res.status(200).json(info)
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = req.body || {}
      const repo_url = String(body.repo_url ?? '').trim()
      const incoming = Array.isArray(body.passwords) ? body.passwords : []
      const passwords: ProjectPasswordEntry[] = []
      for (const item of incoming) {
        const entry = normalizePasswordEntry(item)
        if (entry) passwords.push(entry)
      }

      await ensureOnboardingRow(id)
      const save = async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE project_dev_onboarding
           SET repo_url = $1,
               passwords_json = $2::jsonb,
               updated_at = NOW()
           WHERE project_id = $3::uuid`,
          repo_url || null,
          JSON.stringify(passwords),
          id
        )
      }
      try {
        await save()
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (msg.includes('repo_url') || msg.includes('passwords_json') || msg.includes('does not exist')) {
          await ensureColumns()
          await save()
        } else {
          throw e
        }
      }

      return res.status(200).json({ repo_url, passwords })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session' ||
        error.message === 'Forbidden')
    ) {
      return
    }
    console.error('[valor-info]', error)
    return res.status(500).json({ error: 'Error al guardar información de valor' })
  }
}
