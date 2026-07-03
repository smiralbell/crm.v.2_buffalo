import { isPlatformLikeDescription } from './payment-concepts'
import type { IncomeInput } from './income-analytics'

export const INCOME_OTROS_LABEL = 'Otros / Plataformas'
export const INCOME_OTROS_KEY = '_otros_plataformas'

function clientFromFac(description: string): string | null {
  const m = description.trim().match(/^FAC\s+(.+?)\s+([\w-]+)$/i)
  return m ? m[1].trim() : null
}

function clientFromDescription(description: string): string {
  let d = description.trim()
  d = d.replace(
    /^(transferencia|transf\.?|abono|ingreso|recibo|pago|bizum|trf\.?)\s+(de|del|da|por|a favor de)?\s*/i,
    ''
  )
  d = d.replace(/\s+/g, ' ')
  d = d.split(/\s{2,}|\/| - |\*|\|/)[0]?.trim() ?? d
  if (d.length < 3) return 'Sin identificar'
  return d.slice(0, 80)
}

/** Cliente real vs plataforma/SaaS para gráficos de ingresos */
export function resolveIncomeClientLabel(row: IncomeInput): string {
  if (row.linked_client_name?.trim()) return row.linked_client_name.trim()
  if (isPlatformLikeDescription(row.description || '')) return INCOME_OTROS_LABEL
  const fac = clientFromFac(row.description || '')
  if (fac) return fac
  return clientFromDescription(row.description || 'Sin identificar')
}

export function isIncomeOtrosGroup(label: string): boolean {
  return label === INCOME_OTROS_LABEL
}
