import {
  openRouterDescribeImage,
  openRouterTranscribeAudio,
} from '@/lib/openrouter'
import { decryptWasenderMedia, fetchMediaAsBase64, mimetypeToAudioFormat } from './wasender-media'

export type ResolvedUserInput = {
  text: string
  source: 'text' | 'audio' | 'image'
  rawCaption?: string
}

export async function resolveUserMessageFromWebhook(
  body: unknown,
  parsed: {
    text: string
    mediaType: 'text' | 'image' | 'audio' | null
    hasMedia: boolean
  }
): Promise<ResolvedUserInput> {
  if (parsed.text && !parsed.hasMedia) {
    return { text: parsed.text, source: 'text' }
  }

  if (!parsed.hasMedia) {
    throw new Error('Mensaje sin texto ni archivo multimedia')
  }

  const { publicUrl, mimetype } = await decryptWasenderMedia(body)
  const { base64, mimetype: fetchedMime } = await fetchMediaAsBase64(publicUrl)
  const mime = mimetype || fetchedMime || 'application/octet-stream'

  if (parsed.mediaType === 'audio') {
    const format = mimetypeToAudioFormat(mime)
    const transcript = await openRouterTranscribeAudio(base64, format)
    const text = transcript.trim()
      ? `[Nota de voz del usuario]: ${transcript.trim()}`
      : '[El usuario envió una nota de voz pero no se pudo transcribir]'
    return { text, source: 'audio' }
  }

  if (parsed.mediaType === 'image') {
    const description = await openRouterDescribeImage(base64, mime)
    const caption = parsed.text.trim()
    const parts = [`[Imagen enviada por el usuario]: ${description.trim()}`]
    if (caption) parts.push(`[Texto con la imagen]: ${caption}`)
    return {
      text: parts.join('\n'),
      source: 'image',
      rawCaption: caption || undefined,
    }
  }

  if (parsed.text) {
    return { text: parsed.text, source: 'text' }
  }

  throw new Error('Tipo de multimedia no soportado')
}
