/** Quita markdown (negritas, cursivas, etc.) para WhatsApp plano */
export function stripMarkdownForWhatsApp(text: string): string {
  let s = text.replace(/\r\n/g, '\n').trim()

  for (let i = 0; i < 5; i++) {
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
    s = s.replace(/\*([^*]+)\*/g, '$1')
    s = s.replace(/__([^_]+)__/g, '$1')
    s = s.replace(/_([^_\n]+)_/g, '$1')
  }

  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/~~([^~]+)~~/g, '$1')
  s = s.replace(/^\s*#{1,6}\s+/gm, '')
  s = s.replace(/\*/g, '')
  s = s.replace(/_{2,}/g, '')

  return s.trim()
}

const SECTION_HEADER =
  /^(?:[📍🕐📞💰👥📋🏥🔹•·\-]|\s*(?:servicios|equipo|políticas|promoción|preguntas|ubicación|horario|contacto)\b)/i

function isBulletLine(line: string): boolean {
  return /^[·•\-–—]\s/.test(line) || /^\d+[.)]\s/.test(line)
}

function isSectionTitle(line: string): boolean {
  if (SECTION_HEADER.test(line)) return true
  if (line.length < 70 && /:\s*$/.test(line)) return true
  if (/^(servicios|equipo|políticas|promoción)/i.test(line)) return true
  return false
}

/** Inserta líneas en blanco antes de bloques que parecen secciones nuevas */
function insertParagraphBreaks(text: string): string {
  let s = text

  s = s.replace(/\s+(?=[📍📞🕐💰👥📋🏥])/g, '\n\n')
  s = s.replace(
    /\s+(?=(?:Servicios|Equipo|Políticas|Promoción|Preguntas|Ubicación|Horario|Contacto)(?:\s+y\s+\w+)?[^.\n]{0,40}:)/gi,
    '\n\n'
  )

  return s
}

/** Agrupa líneas en párrafos (cabecera + bullets = un mensaje) */
function groupLinesIntoParagraphMessages(lines: string[]): string[] {
  const messages: string[] = []
  let buffer: string[] = []

  const flush = () => {
    if (buffer.length > 0) {
      messages.push(buffer.join('\n'))
      buffer = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (buffer.length > 0 && isSectionTitle(line) && !isBulletLine(line)) {
      flush()
    }

    buffer.push(line)

    const next = lines[i + 1]
    if (next && isSectionTitle(next) && !isBulletLine(next)) {
      flush()
    }
  }

  flush()
  return messages
}

/** Parte un bloque largo sin saltos de línea usando heurísticas */
function splitBySectionHeuristics(text: string): string[] {
  const parts: string[] = []

  const chunks = text.split(
    /(?=\s*(?:📍|📞|🕐|💰|👥|📋|🏥)|\s+(?:Servicios|Equipo|Políticas|Promoción|Preguntas)\b)/gi
  )

  for (const chunk of chunks) {
    const t = chunk.trim()
    if (!t) continue
    if (t.length > 350) {
      const sentences = t.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¿¡📍📞🕐]|Servicios|Equipo|Políticas)/)
      let buf = ''
      for (const sent of sentences) {
        if (buf.length + sent.length > 280 && buf.length > 0) {
          parts.push(buf.trim())
          buf = sent
        } else {
          buf = buf ? `${buf} ${sent}` : sent
        }
      }
      if (buf.trim()) parts.push(buf.trim())
    } else {
      parts.push(t)
    }
  }

  return parts.filter((p) => p.length > 0)
}

/**
 * Divide la respuesta en varios mensajes de WhatsApp (un mensaje por párrafo/bloque).
 */
export function splitReplyIntoWhatsAppMessages(raw: string): string[] {
  const cleaned = stripMarkdownForWhatsApp(raw)
  if (!cleaned) return []

  const withBreaks = insertParagraphBreaks(cleaned)

  let parts = withBreaks
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  if (parts.length <= 1) {
    const lines = withBreaks
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length > 1) {
      parts = groupLinesIntoParagraphMessages(lines)
    }
  }

  if (parts.length <= 1 && parts[0] && parts[0].length > 120) {
    const heuristic = splitBySectionHeuristics(parts[0])
    if (heuristic.length > 1) parts = heuristic
  }

  return parts.length > 0 ? parts : [cleaned]
}

export function joinWhatsAppMessages(parts: string[]): string {
  return parts.join('\n\n')
}
