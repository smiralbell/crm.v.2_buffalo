/**
 * Calidad de los agentes (retención): el cerebro de cada proyecto y el flujo de cambios.
 * Tipos compartidos entre servidor y pantalla (sin imports de servidor).
 */

export type BrainPhaseId = 'crm' | 'repo' | 'mcp' | 'retell' | 'ia'
export type PhaseStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'

export type BrainPhase = {
  id: BrainPhaseId
  status: PhaseStatus
  /** Qué está haciendo ahora o qué encontró. */
  detail: string
}

export const BRAIN_PHASES: { id: BrainPhaseId; label: string; weight: number }[] = [
  { id: 'crm', label: 'CRM', weight: 10 },
  { id: 'repo', label: 'Repositorio', weight: 35 },
  { id: 'mcp', label: 'MCP', weight: 20 },
  { id: 'retell', label: 'Retell', weight: 10 },
  { id: 'ia', label: 'Cerebro', weight: 25 },
]

export function initialPhases(): BrainPhase[] {
  return BRAIN_PHASES.map((p) => ({ id: p.id, status: 'pending', detail: '' }))
}

/**
 * Progreso total (0–100): suma el peso de las fases terminadas (o saltadas) y la
 * parte hecha de la fase en curso (`fraction` entre 0 y 1).
 */
export function computeProgress(phases: BrainPhase[], current: BrainPhaseId | null, fraction: number): number {
  let total = 0
  for (const def of BRAIN_PHASES) {
    const ph = phases.find((p) => p.id === def.id)
    if (!ph) continue
    if (ph.status === 'done' || ph.status === 'skipped' || ph.status === 'error') total += def.weight
    else if (def.id === current) total += def.weight * Math.min(1, Math.max(0, fraction))
  }
  return Math.min(100, Math.round(total))
}

export type BrainStatus = 'idle' | 'running' | 'done' | 'error'

/** Pasos del tutorial guiado. */
export type TourStep = 'bienvenida' | 'fuentes' | 'rastreo' | 'cerebro' | 'flujo1' | 'hecho'
export const TOUR_STEPS: TourStep[] = ['bienvenida', 'fuentes', 'rastreo', 'cerebro', 'flujo1', 'hecho']

export type Disparador = 'cliente' | 'sistema' | 'modo'

export type Brain = {
  resumen: string
  identidad: { negocio: string; asistente: string; tono: string; horario: string }
  objetivos: string[]
  entradas: { nombre: string; disparador: Disparador; canal: string; descripcion: string; fuente: string }[]
  agentes: { nombre: string; rol: string; canal: string; modelo: string; herramientas: string[]; fuente: string }[]
  herramientas: { nombre: string; que_hace: string; efecto_real: boolean; destino: string; fuente: string }[]
  modelos: { proveedor: string; modelo: string; uso: string }[]
  voces: { proveedor: string; voz: string; uso: string }[]
  integraciones: { nombre: string; uso: string }[]
  modos: { nombre: string; efecto: string }[]
  conocimiento: string[]
  normas_propuestas: { regla: string; area: string; canal: string; gravedad: Gravedad; origen: string }[]
  huecos: string[]
}

export type Gravedad = 'alta' | 'media' | 'baja'

export type BrainPublic = {
  status: BrainStatus
  progress: number
  phases: BrainPhase[]
  brain: Brain | null
  version: number
  error: string | null
  repo_source: string | null
  repo_branch: string | null
  retell_configured: boolean
  tour_step: TourStep
  started_at: string | null
  finished_at: string | null
}

/** Flujo 1 · pruebas de cambios: de dónde llegan los cambios. */
export type Flow1Config = {
  manual: boolean
  tickets: boolean
  repo: boolean
  repo_every_minutes: number
}

export const DEFAULT_FLOW1: Flow1Config = { manual: true, tickets: false, repo: false, repo_every_minutes: 1440 }

export type InboxOrigen = 'cerebro' | 'manual' | 'ticket' | 'repo'
export type Accion = 'nueva' | 'modificar' | 'ya_existe' | 'no_es_norma'

export type Propuesta = {
  accion: Accion
  regla: string
  area: string
  canal: string
  gravedad: Gravedad
  motivo: string
  /** Norma existente a la que se refiere (modificar o ya_existe). */
  norma: string | null
  /** Norma con la que choca, si la hay. */
  conflicto: string | null
}

export type InboxItem = {
  id: string
  origen: InboxOrigen
  origen_ref: string | null
  titulo: string
  texto: string
  propuesta: Propuesta
  estado: 'pendiente' | 'aprobada' | 'descartada'
  created_at: string
}

export type Norma = {
  id: string
  code: string
  regla: string
  area: string | null
  canal: string | null
  gravedad: Gravedad
  estado: 'activa' | 'sustituida'
  origen_tipo: InboxOrigen
  origen_ref: string | null
  created_at: string
}

export type Flow1Public = {
  config: Flow1Config
  configured: boolean
  last_ticket_scan_at: string | null
  last_repo_scan_at: string | null
  last_repo_sha: string | null
  normas: Norma[]
  inbox: InboxItem[]
}
