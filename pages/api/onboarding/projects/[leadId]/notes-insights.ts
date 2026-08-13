import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireAuthAPI } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import {
  openRouterChatCompletion,
  parseJsonFromModelOutput,
  resolveModel,
} from '@/lib/openrouter'
import { mergeLeadConfig } from '@/lib/onboarding/project-context-ai'
import { getResearch, listNotes } from '@/lib/onboarding/notes/store'
import { syncNotebookContextLightweight } from '@/lib/onboarding/notes/sync-context'
import { analyseNotesHeuristic, TOPICS } from '@/lib/onboarding/notes/topics'

const bodySchema = z.object({
  kind: z.enum(['context', 'diagnosis']).default('context'),
  /** Fuerza regenerar el diagnóstico aunque el hash no haya cambiado */
  force: z.boolean().optional(),
})

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function contentHash(input: {
  notesUpdated: string
  researchUpdated: string
  notesLen: number
}): string {
  return `${input.notesLen}:${input.notesUpdated}:${input.researchUpdated}`
}

function fallbackDiagnosisHtml(input: {
  covered: Set<string>
  faltan: string[]
  palabras: number
  defPalabras: number
}): string {
  const listo =
    input.faltan.length <= 3 && input.palabras >= 200 && input.defPalabras >= 80
  const semaforo = listo
    ? (['#047857', 'Listo para redactar la propuesta'] as const)
    : input.faltan.length <= 6
      ? (['#b45309', 'Va bien, pero faltan piezas importantes'] as const)
      : (['#b91c1c', 'Demasiados huecos: no redactes todavía'] as const)

  const bloque = (t: string, c: string) =>
    `<div class="d-row"><div class="d-k" style="color:var(--muted)">${t}</div><div class="d-v" style="color:var(--ink-2)">${c}</div></div>`

  return `
    <div style="padding:12px 14px;border-radius:14px;background:${semaforo[0]}12;border:1px solid ${semaforo[0]}44;margin-bottom:14px">
      <strong style="color:${semaforo[0]};font-size:13px">${semaforo[1]}</strong>
      <div style="font-size:11.5px;color:var(--muted);margin-top:4px">
        ${input.covered.size} de ${TOPICS.length} temas · ${input.palabras} palabras en notas ·
        definición ${input.defPalabras ? input.defPalabras + ' palabras' : 'sin escribir'}
      </div>
    </div>
    ${bloque(
      'Qué falta',
      input.faltan.length
        ? `<ul>${input.faltan.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>`
        : 'Nada crítico pendiente en el guion.'
    )}
  `
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAuthAPI(req, res)
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const leadId = parseInt(String(req.query.leadId), 10)
    if (!Number.isFinite(leadId) || leadId <= 0) {
      return res.status(400).json({ error: 'leadId inválido' })
    }

    const body = bodySchema.parse(req.body ?? {})
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { contact: { select: { nombre: true, empresa: true } } },
    })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const notes = await listNotes(leadId)
    const research = await getResearch(leadId)
    const cfg = parseConfiguradorConfig(lead.configuracion)
    const hash = contentHash({
      notesLen: notes.reduce((a, n) => a + n.body.length, 0),
      notesUpdated: notes.map((n) => n.updated_at).join('|'),
      researchUpdated: research?.updated_at || '',
    })

    // ── Contexto: ficha del lead, sin IA. Sync barato por si el save
    //    aún no había reescrito project_context (misma salida si no hay cambios).
    if (body.kind === 'context') {
      const synced = await syncNotebookContextLightweight({ leadId })
      const context = (synced.context || '').trim()
      return res.status(200).json({
        ok: true,
        kind: 'context',
        source: 'stored',
        cached: true,
        context:
          context ||
          'Aún no hay notas. Escribe en el cuaderno: el contexto se actualiza solo al guardar.',
        content_hash: hash,
      })
    }

    // ── Diagnóstico: caché por hash; IA solo si cambió el material ────
    const cached = cfg?.notebook_diagnosis
    if (
      !body.force &&
      cached?.hash === hash &&
      cached.html?.trim() &&
      cached.plain?.trim()
    ) {
      return res.status(200).json({
        ok: true,
        kind: 'diagnosis',
        source: 'cached',
        cached: true,
        diagnosis_html: cached.html,
        diagnosis_plain: cached.plain,
        content_hash: hash,
      })
    }

    const notesText = notes
      .filter((n) => n.body.trim())
      .map(
        (n) =>
          `## ${n.title || 'Sin título'} (${n.note_date} · ${n.type})\n${n.body.trim()}`
      )
      .join('\n\n')

    const heuristic = analyseNotesHeuristic({
      notesText,
      researchGanchos: research?.data?.ganchos || [],
    })
    const covered = new Set(heuristic.cubiertos)
    const faltan = TOPICS.filter((t) => !covered.has(t.id)).map((t) => t.label)
    const reuniones = notes.filter((n) => n.type !== 'definicion' && n.body.trim())
    const palabras = reuniones.reduce(
      (a, n) => a + (n.body.trim() ? n.body.trim().split(/\s+/).length : 0),
      0
    )
    const def = notes.find((n) => n.type === 'definicion')
    const defPalabras = def?.body.trim()
      ? def.body.trim().split(/\s+/).length
      : 0

    let diagnosis_html = fallbackDiagnosisHtml({
      covered,
      faltan,
      palabras,
      defPalabras,
    })
    let diagnosis_plain =
      'Faltan:\n' + faltan.map((f) => `- ${f}`).join('\n')
    let source: 'llm' | 'fallback' = 'fallback'

    const clientLabel =
      [lead.contact?.empresa, lead.contact?.nombre].filter(Boolean).join(' · ') ||
      `Lead #${leadId}`
    const projectTitle = cfg?.title || null
    const pack = [
      `# CLIENTE\n${clientLabel}${projectTitle ? ' · ' + projectTitle : ''}`,
      research?.data
        ? `# WEB\n${research.data.nombre}\n${research.data.hace}`
        : null,
      notesText ? `# NOTAS\n${notesText}` : null,
      faltan.length ? `# HUECOS\n${faltan.map((f) => `- ${f}`).join('\n')}` : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    if (process.env.OPENROUTER_API_KEY && notesText.trim().length >= 40) {
      try {
        const raw = await openRouterChatCompletion(
          [
            {
              role: 'system',
              content: `Eres el analista comercial senior de Buffalo AI.
Devuelve SOLO JSON:
{
  "diagnostico": {
    "headline": "frase corta de estado",
    "nivel": "listo|precaucion|bloqueado",
    "lectura": "párrafo de 2-4 frases",
    "sabemos": ["hallazgos concretos"],
    "falta": ["huecos críticos"],
    "preguntas_clave": ["3-5 preguntas top"],
    "riesgo": "una frase"
  }
}
No inventes datos. Español profesional.`,
            },
            {
              role: 'user',
              content: `MATERIAL:\n${pack.slice(0, 18000)}`,
            },
          ],
          {
            model: resolveModel('heavy'),
            temperature: 0.35,
            maxTokens: 2200,
            json: true,
          }
        )
        const parsed = parseJsonFromModelOutput(raw) as {
          diagnostico?: {
            headline?: string
            nivel?: string
            lectura?: string
            sabemos?: string[]
            falta?: string[]
            preguntas_clave?: string[]
            riesgo?: string
          }
        }
        const d = parsed.diagnostico
        if (d) {
          const nivel = String(d.nivel || '')
          const color =
            nivel === 'listo'
              ? '#047857'
              : nivel === 'precaucion'
                ? '#b45309'
                : '#b91c1c'
          const headline = d.headline || 'Diagnóstico del proyecto'
          const ul = (items?: string[]) =>
            items?.length
              ? `<ul>${items.map((x) => `<li>${esc(String(x))}</li>`).join('')}</ul>`
              : '<p style="margin:0;color:var(--muted)">—</p>'
          const bloque = (t: string, c: string) =>
            `<div class="d-row" style="margin-bottom:12px"><div class="d-k" style="color:var(--muted);margin-bottom:4px">${t}</div><div class="d-v" style="color:var(--ink-2);line-height:1.55">${c}</div></div>`

          diagnosis_html = `
            <div style="padding:12px 14px;border-radius:14px;background:${color}12;border:1px solid ${color}44;margin-bottom:14px">
              <strong style="color:${color};font-size:13px">${esc(headline)}</strong>
              <div style="font-size:11.5px;color:var(--muted);margin-top:4px">
                ${covered.size}/${TOPICS.length} temas · ${palabras} palabras · definición ${
                  defPalabras ? defPalabras + ' palabras' : 'pendiente'
                }
              </div>
            </div>
            ${d.lectura ? bloque('Lectura', esc(d.lectura)) : ''}
            ${bloque('Qué ya sabemos', ul(d.sabemos))}
            ${bloque('Qué falta', ul(d.falta?.length ? d.falta : faltan))}
            ${bloque('Preguntas que desbloquean', ul(d.preguntas_clave))}
            ${d.riesgo ? bloque('Riesgo', esc(d.riesgo)) : ''}
          `
          diagnosis_plain = [
            headline,
            d.lectura || '',
            'Sabemos:',
            ...(d.sabemos || []).map((x) => `- ${x}`),
            'Falta:',
            ...(d.falta || faltan).map((x) => `- ${x}`),
            'Preguntas clave:',
            ...(d.preguntas_clave || []).map((x) => `- ${x}`),
            d.riesgo ? `Riesgo: ${d.riesgo}` : '',
          ]
            .filter(Boolean)
            .join('\n')
          source = 'llm'
        }
      } catch (e) {
        console.warn('[notes-insights] diagnosis fallback', e)
      }
    }

    const { encoded } = mergeLeadConfig(lead.configuracion, {
      notebook_diagnosis: {
        hash,
        html: diagnosis_html,
        plain: diagnosis_plain,
        at: new Date().toISOString(),
      },
    })
    await prisma.lead.update({
      where: { id: leadId },
      data: { configuracion: encoded },
    })

    return res.status(200).json({
      ok: true,
      kind: 'diagnosis',
      source,
      cached: false,
      diagnosis_html,
      diagnosis_plain,
      content_hash: hash,
    })
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
    console.error('[notes-insights]', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error generando insights',
    })
  }
}
