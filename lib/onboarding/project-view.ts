import { parseConfiguradorConfig } from '@/lib/engranaje5/map-config'
import type { ConfiguradorConfig } from '@/lib/engranaje5/types'
import { sanitizeProjectTitle } from '@/lib/onboarding/format-project-summary'

export interface ProjectViewData {
  cfg: ConfiguradorConfig | null
  setupTotal: number
  maintMonthly: number | null
  maintLabel: string | null
  pay1: number
  pay2: number
  ref: string | null
  services: string[]
  /** Nombre comercial del proyecto (title o resumen de paquetes) */
  projectName: string | null
  /** Definición / brief del proyecto */
  projectDefinition: string | null
  /** Contexto bruto (auditoría, reuniones, notas) */
  projectContext: string | null
  scopeItems: string[]
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

  const scopeItems = (cfg?.scope_items || []).map((s) => String(s).trim()).filter(Boolean)

  const rawTitle = (cfg?.title || '').trim() || null
  let projectName = sanitizeProjectTitle(rawTitle)
  if (!projectName && services.length) {
    projectName = cfg?.pack ? 'Pack Voz + Chat' : services.join(' · ')
  }

  let projectDefinition = (cfg?.description || '').trim() || null
  // Si la "definición" es en realidad la ficha web, no la uses como brief
  if (
    projectDefinition &&
    /QUI[EÉ]NES SON|Ficha\s*web|[┌│]/.test(projectDefinition)
  ) {
    // Se deja: pickProjectSummaryText la limpia; no la borramos del todo
    // porque puede llevar el brief pegado detrás.
  }
  if (!projectDefinition && scopeItems.length) {
    projectDefinition = scopeItems.join('\n')
  }
  if (!projectDefinition && notas) {
    const cleaned = notas
      .split('\n')
      .map((l) => l.replace(/^[•\-\s—]+/, '').trim())
      .filter((l) => l && !l.toLowerCase().startsWith('total setup') && !l.startsWith('audit_status:'))
      .slice(0, 8)
      .join('\n')
    if (cleaned && !/QUI[EÉ]NES SON|Ficha\s*web|[┌│]/.test(cleaned)) {
      projectDefinition = cleaned
    }
  }

  const projectContext = (cfg?.project_context || '').trim() || null

  return {
    cfg,
    setupTotal,
    maintMonthly,
    maintLabel,
    pay1,
    pay2,
    ref: cfg?.ref ?? null,
    services,
    projectName,
    projectDefinition,
    projectContext,
    scopeItems,
  }
}

export { fmt }
