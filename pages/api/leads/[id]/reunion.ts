import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '@/lib/prisma'
import { createActivity } from '@/lib/crm/activities'
import { openRouterChatCompletion, openRouterTranscribeAudio, resolveModel } from '@/lib/openrouter'
import { isSessionError, requireLeadPage } from '@/lib/leads/lead-api-guard'

/** El audio de una reunión puede ser largo: hasta ~35 MB en base64. */
export const config = { api: { bodyParser: { sizeLimit: '35mb' } } }

const FORMATS: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
}

function audioFormat(mime: string, name: string): string {
  const base = mime.split(';')[0].trim().toLowerCase()
  if (FORMATS[base]) return FORMATS[base]
  const ext = name.split('.').pop()?.toLowerCase()
  return ext && ext.length <= 4 ? ext : 'webm'
}

const SUMMARY_PROMPT = [
  'Eres el asistente interno de Buffalo AI. Te paso lo que se habló en una reunión presencial con un cliente.',
  'Escribe en español de España, en texto plano, sin inventar nada:',
  'un resumen de 3 a 6 frases y después una línea «Próximos pasos:» con lo acordado, en guiones.',
].join(' ')

/**
 * POST: guarda una reunión presencial en el contexto del lead.
 * { titulo, fecha, notas? , audio?: { base64, mime, name } }
 * Con audio, se transcribe y se resume; la transcripción queda guardada debajo.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const ctx = await requireLeadPage(req, res)
    if (!ctx) return
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const body = (req.body || {}) as {
      titulo?: string
      fecha?: string
      notas?: string
      audio?: { base64?: string; mime?: string; name?: string }
    }
    const lead = await prisma.lead.findUnique({ where: { id: ctx.leadId }, select: { contact_id: true } })
    if (!lead) return res.status(404).json({ error: 'Lead no encontrado' })

    const notas = String(body.notas || '').trim()
    let transcript = ''
    if (body.audio?.base64) {
      const format = audioFormat(String(body.audio.mime || ''), String(body.audio.name || ''))
      try {
        transcript = await openRouterTranscribeAudio(body.audio.base64, format)
      } catch (e) {
        console.error('[leads/reunion] transcripción', e)
        return res.status(502).json({ error: 'No se pudo transcribir el audio. Prueba con otro formato (mp3, m4a, webm).' })
      }
      if (!transcript) return res.status(422).json({ error: 'El audio no tiene voz que se pueda transcribir' })
    }
    if (!notas && !transcript) return res.status(400).json({ error: 'Escribe unas notas o sube un audio' })

    let resumen = ''
    if (transcript) {
      try {
        resumen = (
          await openRouterChatCompletion(
            [
              { role: 'system', content: SUMMARY_PROMPT },
              { role: 'user', content: [notas && `Notas del equipo:\n${notas}`, `Transcripción:\n${transcript.slice(0, 60_000)}`].filter(Boolean).join('\n\n') },
            ],
            { model: resolveModel('fast'), temperature: 0.2, maxTokens: 700 }
          )
        ).trim()
      } catch (e) {
        console.error('[leads/reunion] resumen', e)
      }
    }

    const fecha = body.fecha && !Number.isNaN(new Date(body.fecha).getTime()) ? new Date(body.fecha) : new Date()
    const texto = [
      resumen,
      notas && (resumen ? `Notas del equipo:\n${notas}` : notas),
      transcript && `Transcripción:\n${transcript}`,
    ]
      .filter(Boolean)
      .join('\n\n')

    const activity = await createActivity({
      contactId: lead.contact_id,
      leadId: ctx.leadId,
      kind: 'meeting',
      title: String(body.titulo || '').trim().slice(0, 200) || 'Reunión presencial',
      body: texto,
      meta: { presencial: true, transcrita: Boolean(transcript), fecha: fecha.toISOString() },
      createdBy: ctx.user.name || ctx.user.email,
    })
    if (!activity) return res.status(500).json({ error: 'No se pudo guardar la reunión' })
    return res.json({ ok: true, activity })
  } catch (error) {
    if (isSessionError(error)) return
    console.error('[leads/reunion]', error)
    return res.status(500).json({ error: 'No se pudo guardar la reunión' })
  }
}
