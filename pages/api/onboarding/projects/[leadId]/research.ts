import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  deleteResearch,
  getResearch,
  saveResearch,
  type ProjectResearchData,
} from '@/lib/onboarding/notes/store'
import { researchToNoteText, researchUrl } from '@/lib/onboarding/notes/scrape'

const postSchema = z.object({
  url: z.string().min(1).max(2000),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    if (req.method === 'GET') {
      const research = await getResearch(leadId)
      return res.status(200).json({
        ok: true,
        research,
        noteText: research ? researchToNoteText(research.data as never) : null,
      })
    }

    if (req.method === 'DELETE') {
      await deleteResearch(leadId)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'POST') {
      const body = postSchema.parse(req.body ?? {})
      const scraped = await researchUrl(body.url)
      if ('error' in scraped && scraped.error) {
        return res.status(422).json({
          error: scraped.error,
          detalle: 'detalle' in scraped ? scraped.detalle : undefined,
        })
      }
      const data = scraped as ProjectResearchData
      const research = await saveResearch(leadId, String(data.url || body.url), data)
      return res.status(200).json({
        ok: true,
        research,
        noteText: researchToNoteText(data as never),
      })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message || 'Datos inválidos' })
    }
    if (
      error instanceof Error &&
      (error.message === 'No session' ||
        error.message === 'Invalid session' ||
        error.message === 'Expired session')
    ) {
      return
    }
    console.error('[onboarding/research]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error investigando',
    })
  }
}
