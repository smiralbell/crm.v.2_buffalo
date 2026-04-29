import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { openRouterChatCompletion, parseJsonFromModelOutput } from '@/lib/openrouter'

const SYSTEM = `Eres un analista principal de operaciones de agencia (producto, marketing y cuentas).
Recibirás el historial cronológico de bitácoras internas de un proyecto.

Responde SOLO con JSON válido (sin markdown, sin texto fuera del JSON), en español, con esta estructura exacta:
{
  "resumen_ejecutivo": string (3-6 frases, accionable),
  "diagnostico_rapido": {
    "salud_general_0_100": number,
    "riesgo_entrega_0_100": number,
    "riesgo_cliente_0_100": number,
    "momento_actual": string
  },
  "timeline": [ { "periodo": string, "hechos_clave": string[] } ],
  "kpis_o_señales": [ { "nombre": string, "detalle": string } ],
  "contratos_y_compromisos": string[],
  "hecho_bien": string[],
  "hecho_mal_o_riesgos": string[],
  "mejoras_sugeridas": string[],
  "plan_30_dias": [
    { "semana": string, "objetivo": string, "acciones": string[], "owner_recomendado": string }
  ],
  "alertas_tempranas": string[],
  "preguntas_abiertas": string[]
}

Reglas de calidad:
- No inventes datos numéricos concretos si no aparecen; usa señales cualitativas.
- Cada bullet debe ser específico y verificable.
- Evita frases vacías tipo "mejorar comunicación" sin explicar el cómo.
- Si faltan datos, dilo explícitamente en el campo correspondiente ("No consta en las notas").
- La sección "plan_30_dias" debe ser práctica, priorizada y ejecutable.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
  } catch {
    return
  }

  const projectId = parseInt(String(req.query.id), 10)
  if (Number.isNaN(projectId)) {
    return res.status(400).json({ error: 'ID inválido' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método no permitido' })
  }

  try {
    const project = await prisma.evaluationProject.findFirst({
      where: { id: projectId, deleted_at: null },
      include: {
        entries: { orderBy: { created_at: 'asc' } },
      },
    })

    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }

    if (project.entries.length === 0) {
      return res.status(400).json({ error: 'Añade al menos una bitácora antes de analizar' })
    }

    const chronicle = project.entries
      .map(
        (e, i) =>
          `--- Entrada ${i + 1} (${e.created_at.toISOString().slice(0, 10)})${e.rating != null ? ` [nota periodo: ${e.rating}/5]` : ''} ---\n${e.body}`
      )
      .join('\n\n')

    const userContent = `Proyecto: "${project.name}"${project.client_name ? `\nCliente: ${project.client_name}` : ''}\nActivo: ${project.is_active ? 'sí' : 'no'}\n\nBitácoras (orden cronológico):\n\n${chronicle}`

    const raw = await openRouterChatCompletion([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userContent },
    ])

    let summaryJson: Record<string, unknown>
    try {
      summaryJson = parseJsonFromModelOutput(raw) as Record<string, unknown>
    } catch {
      return res.status(502).json({
        error: 'La IA no devolvió JSON válido. Prueba de nuevo o cambia de modelo en OPENROUTER_MODEL.',
        raw_preview: raw.slice(0, 400),
      })
    }

    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
    const row = await prisma.projectAiAnalysis.create({
      data: {
        project_id: projectId,
        summary_json: summaryJson as object,
        model,
      },
    })

    return res.status(200).json({
      analysis: {
        id: row.id,
        summary_json: row.summary_json,
        model: row.model,
        created_at: row.created_at.toISOString(),
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    if (msg.includes('OPENROUTER_API_KEY')) {
      return res.status(503).json({ error: msg })
    }
    console.error('[projects analyze]', e)
    return res.status(500).json({ error: msg })
  }
}
