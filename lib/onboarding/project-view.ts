import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import type { ConfiguradorConfig } from '@/lib/engranaje5/types'

export interface ProjectViewData {
  cfg: ConfiguradorConfig | null
  setupTotal: number
  maintMonthly: number | null
  maintLabel: string | null
  pay1: number
  pay2: number
  ref: string | null
  services: string[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export function langLabel(price?: number): string {
  if (price === 700) return '5 idiomas'
  if (price === 400) return '3 idiomas'
  return '1 idioma'
}

export function buildProjectViewData(
  configuracion: string | null,
  valor: number | null,
  notas: string | null
): ProjectViewData {
  const cfg = parseConfiguradorConfig(configuracion)
  const setupTotal = valor ?? 0
  const pay1 = Math.ceil(setupTotal / 2)
  const pay2 = setupTotal - pay1

  let maintMonthly: number | null = null
  let maintLabel: string | null = null
  if (cfg?.monthly_fee_eur != null && Number(cfg.monthly_fee_eur) > 0) {
    maintMonthly = Math.round(Number(cfg.monthly_fee_eur))
    maintLabel = 'Mensualidad'
  } else if (cfg?.maint && setupTotal > 0) {
    const pct = cfg.maint === 'connect' ? 0.1 : 0.15
    maintMonthly = Math.round(setupTotal * pct)
    maintLabel = cfg.maint === 'connect' ? 'Buffalo Connect (10%)' : 'Buffalo Cloud (15%)'
  }

  const services: string[] = []
  if (cfg?.voz) services.push('Agente de Voz')
  if (cfg?.chat) services.push('Agente de Chat')
  if (cfg?.dash) services.push(`Dashboard${cfg.dash_tier ? ` · ${cfg.dash_tier}` : ''}`)
  if (cfg?.pack) services.push('Pack Voz + Chat (−10%)')

  if (!services.length && notas) {
    notas.split('\n').forEach((line) => {
      const t = line.replace(/^[•\-\s]+/, '').trim()
      if (t && !t.toLowerCase().startsWith('total setup')) services.push(t.split('\n')[0])
    })
  }

  return {
    cfg,
    setupTotal,
    maintMonthly,
    maintLabel,
    pay1,
    pay2,
    ref: cfg?.ref ?? null,
    services,
  }
}

export { fmt }
