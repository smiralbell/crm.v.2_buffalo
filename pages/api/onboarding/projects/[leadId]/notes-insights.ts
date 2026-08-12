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
import { getResearch, listNotes } from '@/lib/onboarding/notes/store'
import { analyseNotesHeuristic, TOPICS } from '@/lib/onboarding/notes/topics'

const bodySchema = z.object({
  kind: z.enum(['context', 'diagnosis', 'both']).default('both'),
})

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildRawPack(input: {
  clientLabel: string
  projectTitle: string | null
  notesText: string
  research: Awaited<ReturnType<typeof getResearch>>
  faltan: string[]
}): string {
  const parts: string[] = [
    `# CLIENTE\n${input.clientLabel}${input.projectTitle ? ' · ' + input.projectTitle : ''}`,
  ]
  if (input.research?.data) {
    const r = input.research.data
    parts.push(
      `# WEB\nEmpresa: ${r.nombre}\nSector: ${r.sector}\nQué hacen: ${r.hace}\nServicios: ${(r.servicios || []).join(', ')}`
    )
  }
  if (input.notesText.trim()) parts.push(`# NOTAS\n${input.notesText.trim()}`)
  if (input.faltan.length) {
    parts.push(`# HUECOS\n${input.faltan.map((f) => `- ${f}`).join('\n')}`)
  }
  return parts.join('\n\n')
}

function fallbackContext(pack: string): string {
  return (
    pack ||
    'Aún no hay notas suficientes para construir el contexto del proyecto.'
  )
}

function fallbackDiagnosisHtml(input: {
  covered: Set<string>
  faltan: string[]
  palabras: number
  defPalabras: number
  summary?: string
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
    ${
      input.summary
        ? bloque('Lectura', `<p style="margin:0;line-height:1.55">${esc(input.summary)}</p>`)
        : ''
    }
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
    const clientLabel =
      [lead.contact?.empresa, lead.contact?.nombre].filter(Boolean).join(' · ') ||
      `Lead #${leadId}`
    const projectTitle = cfg?.title || null

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

    const pack = buildRawPack({
      clientLabel,
      projectTitle,
      notesText,
      research,
      faltan,
    })

    let context = fallbackContext(pack)
    let diagnosis_html = fallbackDiagnosisHtml({
      covered,
      faltan,
      palabras,
      defPalabras,
    })
    let diagnosis_plain =
      'Faltan:\n' + faltan.map((f) => `- ${f}`).join('\n')
    let source: 'llm' | 'fallback' = 'fallback'

    if (process.env.OPENROUTER_API_KEY && notesText.trim().length >= 40) {
      try {
        const wantContext = body.kind === 'context' || body.kind === 'both'
        const wantDiag = body.kind === 'diagnosis' || body.kind === 'both'
        const raw = await openRouterChatCompletion(
          [
            {
              role: 'system',
              content: `Eres el analista comercial senior de Buffalo AI (automatización e IA para empresas).
A partir de las notas de reunión, redactas claridad: de qué trata el proyecto y qué falta saber.

Devuelve SOLO JSON:
{
  "contexto": "texto markdown claro (sin fences). Explica: quién es el cliente, qué problema tienen, qué se quiere construir, alcance tentativo, restricciones y cifras clave. Español profesional, 180-450 palabras. No inventes datos.",
  "diagnostico": {
    "headline": "frase corta de estado",
    "nivel": "listo|precaucion|bloqueado",
    "lectura": "párrafo de 2-4 frases: qué tan sólido está el conocimiento y por qué",
    "sabemos": ["hallazgos concretos ya confirmados"],
    "falta": ["huecos críticos con impacto comercial"],
    "preguntas_clave": ["3-5 preguntas top que desbloquearían la propuesta"],
    "riesgo": "una frase de riesgo si se redacta ya"
  }
}
Si no hay material, dilo con honestidad. No rellenes con genéricos.`,
            },
            {
              role: 'user',
              content: `CLIENTE: ${clientLabel}\nPROYECTO: ${projectTitle || '(sin título)'}\n\nMATERIAL:\n${pack.slice(0, 18000)}`,
            },
          ],
          {
            model: resolveModel('heavy'),
            temperature: 0.35,
            maxTokens: 3200,
            json: true,
          }
        )
        const parsed = parseJsonFromModelOutput(raw) as {
          contexto?: string
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

        if (wantContext && parsed.contexto?.trim()) {
          context = parsed.contexto.trim()
          source = 'llm'
        }

        const d = parsed.diagnostico
        if (wantDiag && d) {
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
        console.warn('[notes-insights] fallback', e)
      }
    }

    return res.status(200).json({
      ok: true,
      source,
      context,
      diagnosis_html,
      diagnosis_plain,
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
