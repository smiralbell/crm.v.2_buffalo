/**
 * Normaliza el texto de mensajes del agente para mostrarlo en la UI
 * (quita basura invisible, espacios raros y saltos de línea excesivos).
 */
export function formatChatMessageText(raw: string): string {
  if (!raw) return ''

  let s = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // Zero-width spaces y similares
  s = s.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
  // BOM
  s = s.replace(/^\uFEFF/, '')

  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')

  s = s.trim()
  s = s.replace(/\n{4,}/g, '\n\n\n')
  s = s.replace(/[^\S\n]+/g, ' ')
  s = s.replace(/[ \t]*\n[ \t]*/g, '\n')

  return s.trim()
}
