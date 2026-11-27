import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { githubConfigured, listGithubBranches, listGithubRepos } from '@/lib/retencion/qa/repo-reader'

/**
 * Repositorios de GitHub para el cerebro (con GITHUB_TOKEN, solo lectura).
 * GET: lista de repositorios · GET ?repo=owner/name: sus ramas.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireAuthAPI(req, res)
    if (user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' })
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return res.status(405).json({ error: 'Método no permitido' })
    }
    if (!githubConfigured()) return res.status(200).json({ configured: false, repos: [] })
    const repo = typeof req.query.repo === 'string' ? req.query.repo : ''
    if (repo) return res.status(200).json({ configured: true, branches: await listGithubBranches(repo) })
    return res.status(200).json({ configured: true, repos: await listGithubRepos() })
  } catch (e) {
    if (res.headersSent) return
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Error con GitHub' })
  }
}
