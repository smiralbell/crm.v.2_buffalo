import {
  openRouterDescribeImage,
  openRouterTranscribeAudio,
} from '@/lib/openrouter'
import {
  buildUnsupportedMediaUserText,
  mimetypeToAudioFormat,
  normalizeVisionMimetype,
  type DemoMediaKind,
} from './media'
import { downloadDemoMedia } from './whatsapp'

export type ResolvedUserInput = {
  text: string
  source: 'text' | 'audio' | 'image' | 'unsupported_media'
  rawCaption?: string
}

export async function resolveUserMessage(
  messageId: string | null,
  parsed: {
    text: string
    mediaType: DemoMediaKind | 'text'
    hasMedia: boolean
    mediaReadable: boolean
    mediaCaption: string
  }
): Promise<ResolvedUserInput> {
  if (parsed.text && !parsed.hasMedia) {
    return { text: parsed.text, source: 'text' }
  }

  if (parsed.hasMedia && !parsed.mediaReadable) {
    const caption = parsed.mediaCaption || parsed.text.trim()
    return {
      text: buildUnsupportedMediaUserText(parsed.mediaType as DemoMediaKind, caption),
      source: 'unsupported_media',
      rawCaption: caption || undefined,
    }
  }

  if (!parsed.hasMedia) {
    throw new Error('Mensaje sin texto ni archivo multimedia')
  }

  const caption = parsed.mediaCaption || parsed.text.trim()

  if (!messageId) throw new Error('Mensaje sin id: no se puede descargar el archivo')
  const { base64, mimetype: mime } = await downloadDemoMedia(messageId)

  if (parsed.mediaType === 'audio') {
    const format = mimetypeToAudioFormat(mime)
    const transcript = await openRouterTranscribeAudio(base64, format)
    const text = transcript.trim()
      ? `[Nota de voz del usuario]: ${transcript.trim()}`
      : '[El usuario envió una nota de voz pero no se pudo transcribir]'
    return { text, source: 'audio' }
  }

  if (parsed.mediaType === 'image') {
    const visionMime = normalizeVisionMimetype(mime)
    const description = await openRouterDescribeImage(base64, visionMime, caption)

    const parts: string[] = []
    if (caption) {
      parts.push(`El usuario envió una imagen con este mensaje: «${caption}»`)
      parts.push(`Contenido de la imagen (para responder a su pregunta): ${description.trim()}`)
      parts.push('Responde directamente a lo que pregunta o comenta el usuario sobre la imagen.')
    } else {
      parts.push(`El usuario envió una imagen.`)
      parts.push(`Contenido de la imagen: ${description.trim()}`)
    }

    return {
      text: parts.join('\n\n'),
      source: 'image',
      rawCaption: caption || undefined,
    }
  }

  if (parsed.text) {
    return { text: parsed.text, source: 'text' }
  }

  throw new Error('Tipo de multimedia no soportado')
}
