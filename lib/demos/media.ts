export type DemoMediaKind =
  | 'image'
  | 'audio'
  | 'sticker'
  | 'video'
  | 'gif'
  | 'document'
  | 'unsupported'

export type DemoMediaInfo = {
  kind: DemoMediaKind
  readable: boolean
  caption: string
  /** Clave Baileys: imageMessage, audioMessage… */
  messageKey: string
  /** Objeto crudo del webhook para decrypt-media */
  mediaObject: Record<string, unknown>
}

const MEDIA_KEYS: Array<{ key: string; kind: DemoMediaKind }> = [
  { key: 'imageMessage', kind: 'image' },
  { key: 'audioMessage', kind: 'audio' },
  { key: 'pttMessage', kind: 'audio' },
  { key: 'stickerMessage', kind: 'sticker' },
  { key: 'videoMessage', kind: 'video' },
  { key: 'documentMessage', kind: 'document' },
]

const UNSUPPORTED_LABELS: Record<DemoMediaKind, string> = {
  image: 'imagen',
  audio: 'audio',
  sticker: 'sticker',
  video: 'vídeo',
  gif: 'GIF o animación',
  document: 'documento',
  unsupported: 'archivo',
}

export function unsupportedMediaLabel(kind: DemoMediaKind): string {
  return UNSUPPORTED_LABELS[kind] || 'archivo'
}

export function unwrapWhatsAppMessage(
  message: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!message || typeof message !== 'object') return undefined

  const viewOnce = message.viewOnceMessage as Record<string, unknown> | undefined
  if (viewOnce?.message && typeof viewOnce.message === 'object') {
    return unwrapWhatsAppMessage(viewOnce.message as Record<string, unknown>)
  }

  const viewOnceV2 = message.viewOnceMessageV2 as Record<string, unknown> | undefined
  if (viewOnceV2?.message && typeof viewOnceV2.message === 'object') {
    return unwrapWhatsAppMessage(viewOnceV2.message as Record<string, unknown>)
  }

  const ephemeral = message.ephemeralMessage as Record<string, unknown> | undefined
  if (ephemeral?.message && typeof ephemeral.message === 'object') {
    return unwrapWhatsAppMessage(ephemeral.message as Record<string, unknown>)
  }

  const docCaption = message.documentWithCaptionMessage as Record<string, unknown> | undefined
  if (docCaption?.message && typeof docCaption.message === 'object') {
    return docCaption.message as Record<string, unknown>
  }

  return message
}

function readCaption(mediaObject: Record<string, unknown>): string {
  const caption = mediaObject.caption
  return typeof caption === 'string' ? caption.trim() : ''
}

function classifyDocument(
  mediaObject: Record<string, unknown>
): DemoMediaKind {
  const mime = String(mediaObject.mimetype || mediaObject.mimeType || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  return 'document'
}

function classifyVideo(
  mediaObject: Record<string, unknown>
): DemoMediaKind {
  if (mediaObject.gifPlayback === true || mediaObject.gifAttribution) return 'gif'
  const mime = String(mediaObject.mimetype || '').toLowerCase()
  if (mime.includes('gif')) return 'gif'
  return 'video'
}

export function findMediaInMessage(
  message: Record<string, unknown> | undefined
): DemoMediaInfo | null {
  const inner = unwrapWhatsAppMessage(message)
  if (!inner) return null

  for (const { key, kind: baseKind } of MEDIA_KEYS) {
    const raw = inner[key]
    if (!raw || typeof raw !== 'object') continue

    const mediaObject = raw as Record<string, unknown>
    let kind = baseKind
    if (key === 'documentMessage') kind = classifyDocument(mediaObject)
    if (key === 'videoMessage') kind = classifyVideo(mediaObject)

    const readable = kind === 'image' || kind === 'audio'

    return {
      kind,
      readable,
      caption: readCaption(mediaObject),
      messageKey: key,
      mediaObject,
    }
  }

  return null
}

export function buildUnsupportedMediaUserText(
  kind: DemoMediaKind,
  caption: string
): string {
  const label = unsupportedMediaLabel(kind)
  const lines = [
    `[El usuario envió un ${label} que no puedo analizar automáticamente.]`,
    'Explícale con naturalidad que por ahora solo puedo leer mensajes de texto, notas de voz e imágenes (fotos).',
  ]

  if (kind === 'sticker') {
    lines[1] =
      'Explícale que no puedes ver stickers; si quiere que entiendas algo, que te lo escriba por texto o envíe una foto.'
  } else if (kind === 'gif') {
    lines[1] =
      'Explícale que no puedes ver GIFs ni animaciones; si quiere que entiendas algo, que te lo escriba o envíe una captura/imagen.'
  } else if (kind === 'video') {
    lines[1] =
      'Explícale que no puedes ver vídeos; si quiere que entiendas algo, que te lo resuma por texto o envíe una imagen.'
  } else if (kind === 'document') {
    lines[1] =
      'Explícale que no puedes abrir documentos adjuntos (PDF, Word, etc.); si es una foto, que la envíe como imagen.'
  }

  if (caption) {
    lines.push(`[Texto que acompañaba el ${label}]: ${caption}`)
    lines.push('Responde también a lo que dice en ese texto.')
  }

  return lines.join('\n')
}

export function normalizeVisionMimetype(mimetype: string): string {
  const m = mimetype.toLowerCase().split(';')[0].trim()
  if (!m || m === 'application/octet-stream') return 'image/jpeg'
  if (m === 'image/jpg') return 'image/jpeg'
  if (m.startsWith('image/')) return m
  if (m === 'application/pdf') return 'image/jpeg'
  return m
}
