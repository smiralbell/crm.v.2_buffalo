import type { CrmRole } from '@/lib/auth'

/**
 * Quién puede ver precios de clientes: valor de leads/pipeline, setup,
 * mensualidad, facturas, propuestas y contratos.
 * Developers y project managers nunca los ven (los costes de marketing sí).
 */
export function canSeeClientPrices(role: CrmRole | null | undefined): boolean {
  return role === 'admin' || role === 'comercial'
}

/** Línea de texto que habla de dinero (€, setup, mensualidad, importes…). */
export function isPriceLine(line: string): boolean {
  const l = line.toLowerCase()
  return (
    l.includes('€') ||
    /\beur\b/.test(l) ||
    l.includes('setup') ||
    l.includes('mensualidad') ||
    l.includes('precio') ||
    l.includes('tarifa') ||
    l.includes('factur') ||
    l.includes('mrr') ||
    l.includes('iva') ||
    l.includes('importe') ||
    l.includes('presupuesto') ||
    /\d+[.,]\d{2}\b/.test(l)
  )
}

/** Quita las líneas con precios de un texto libre. */
export function stripPriceLines(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .split('\n')
    .filter((line) => !isPriceLine(line))
    .join('\n')
    .trim()
}

/**
 * Al guardar un texto que el usuario vio sin precios, conserva las líneas con
 * precio que ya había guardadas (si no, se perderían al guardar).
 */
export function mergeHiddenPriceLines(
  stored: string | null | undefined,
  incoming: string | null | undefined
): string {
  const next = (incoming || '').trim()
  const hidden = (stored || '')
    .split('\n')
    .filter((line) => isPriceLine(line) && !next.includes(line.trim()))
  if (!hidden.length) return next
  return [next, ...hidden].filter(Boolean).join('\n').trim()
}
