import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { getDemoById } from '@/lib/demos/store'
import {
  countDemoKbChunks,
  DEMO_KB_FULL_INJECT_MAX_CHARS,
  getDemoKbMeta,
} from '@/lib/demos/kb-rag'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const id = parseInt(req.query.id as string, 10)
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  const demo = await getDemoById(id)
  if (!demo) return res.status(404).json({ error: 'Demo no encontrada' })

  if (demo.tipo !== 'whatsapp' || demo.es_asistente_crm) {
    return res.status(200).json({
      rag: {
        ok: true,
        status: 'n_a',
        chunks: 0,
        message:
          demo.tipo === 'voz'
            ? 'RAG de voz lo gestiona Retell.'
            : 'Asistente CRM no usa este índice RAG.',
      },
    })
  }

  const textLen = demo.base_conocimiento.trim().length
  if (!textLen) {
    return res.status(200).json({
      rag: {
        ok: true,
        status: 'empty',
        chunks: 0,
        message: 'Sin base de conocimiento (nada indexado).',
      },
    })
  }

  try {
    const meta = await getDemoKbMeta(id)
    const chunks = meta?.chunk_count ?? (await countDemoKbChunks(id))
    if (chunks > 0) {
      const modeNote =
        textLen <= DEMO_KB_FULL_INJECT_MAX_CHARS
          ? ' Base corta: en chat se inyecta entera; vectores listos por si crece.'
          : ' En chat usa search_knowledge.'
      return res.status(200).json({
        rag: {
          ok: true,
          status: 'indexed',
          chunks,
          message: `RAG listo · ${chunks} trozo${chunks === 1 ? '' : 's'} en vectores.${modeNote}`,
        },
      })
    }
    return res.status(200).json({
      rag: {
        ok: false,
        status: 'error',
        chunks: 0,
        message: 'Hay texto en la base pero no hay vectores. Guarda de nuevo para indexar.',
      },
    })
  } catch (err) {
    return res.status(200).json({
      rag: {
        ok: false,
        status: 'error',
        chunks: 0,
        message: 'No se pudo leer el estado del RAG.',
        error: err instanceof Error ? err.message : 'Error',
      },
    })
  }
}
