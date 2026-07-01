/** Quita markdown (negritas, cursivas, etc.) para WhatsApp plano */
export function stripMarkdownForWhatsApp(text: string): string {
  let s = text.trim()

  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  s = s.replace(/__([^_]+)__/g, '$1')
  s = s.replace(/`([^`]+)`/g, '$1')
  s = s.replace(/~~([^~]+)~~/g, '$1')
  s = s.replace(/\*([^*\n]+)\*/g, '$1')
  s = s.replace(/_([^_\n]+)_/g, '$1')
  s = s.replace(/^\s*#{1,6}\s+/gm, '')
  s = s.replace(/^\s*[-*]\s+/gm, '')
  s = s.replace(/\*/g, '')
  s = s.replace(/_{2,}/g, '')

  return s.trim()
}

/**
 * Divide la respuesta en mensajes separados (un mensaje de WhatsApp por línea).
 * Líneas vacías se ignoran.
 */
export function splitReplyIntoWhatsAppMessages(raw: string): string[] {
  const cleaned = stripMarkdownForWhatsApp(raw)
  if (!cleaned) return []

  const parts = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return parts.length > 0 ? parts : [cleaned]
}

export function joinWhatsAppMessages(parts: string[]): string {
  return parts.join('\n')
}
