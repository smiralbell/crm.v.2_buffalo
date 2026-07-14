/** Presentación comercial Buffalo (Canva) por defecto. */
export const DEFAULT_PRESENTATION_URL = 'https://canva.link/0v3qubnyqvfmv5x'

/** @deprecated Usar DEFAULT_PRESENTATION_URL */
export const BUFFALO_PRESENTATION_URL = DEFAULT_PRESENTATION_URL

export function resolvePresentationUrl(url?: string | null): string {
  const trimmed = url?.trim()
  return trimmed || DEFAULT_PRESENTATION_URL
}

export function presentationMessageLines(url?: string | null): string[] {
  const resolved = resolvePresentationUrl(url)
  return ['', 'Te dejo nuestra presentación aquí:', resolved]
}

export function isValidPresentationUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return true
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
