/**
 * Calidad de los agentes (retención): el cerebro de cada proyecto y el flujo de cambios.
 * Tipos compartidos entre servidor y pantalla (sin imports de servidor).
 */

export type BrainPhaseId = 'crm' | 'repo' | 'mcp' | 'ia'
export type PhaseStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error'

export type BrainPhase = {
  id: BrainPhaseId
  status: PhaseStatus
  /** Qué está haciendo ahora o qué encontró. */
  detail: string
}

/** La IA pesa más: lee todo por trozos y luego lo junta. */
export const BRAIN_PHASES: { id: BrainPhaseId; label: string; weight: number }[] = [
  { id: 'crm', label: 'CRM', weight: 5 },
  { id: 'repo', label: 'Repositorio', weight: 30 },
  { id: 'mcp', label: 'MCP', weight: 15 },
  { id: 'ia', label: 'Cerebro', weight: 50 },
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

export type BrainStatus = 'idle' | 'running' | 'done' | 'error' | 'stopped'

/** Pasos del tutorial guiado. */
export type TourStep = 'bienvenida' | 'fuentes' | 'rastreo' | 'cerebro' | 'flujo1' | 'hecho'
export const TOUR_STEPS: TourStep[] = ['bienvenida', 'fuentes', 'rastreo', 'cerebro', 'flujo1', 'hecho']

export type Disparador = 'cliente' | 'sistema' | 'modo'
export type Gravedad = 'alta' | 'media' | 'baja'

/**
 * Todo lo que lleva `detalle` se guarda completo: el resumen es solo la primera vista,
 * nunca sustituye a la información del sistema.
 */
export type BrainItemBase = { nombre: string; detalle: string; fuentes: string[] }

export type BrainEntrada = BrainItemBase & { disparador: Disparador; canal: string }
export type BrainAgente = BrainItemBase & { rol: string; canal: string; modelo: string; herramientas: string[] }
export type BrainHerramienta = BrainItemBase & { que_hace: string; efecto_real: boolean; destino: string }
export type BrainFlujo = BrainItemBase & { pasos: string[] }
export type BrainModelo = BrainItemBase & { tipo: 'llm' | 'voz' | 'otro'; proveedor: string; uso: string }
export type BrainIntegracion = BrainItemBase & { uso: string }
export type BrainModo = BrainItemBase & { efecto: string }
export type BrainConocimiento = BrainItemBase

export type BrainNorma = { regla: string; area: string; canal: string; gravedad: Gravedad; origen: string }

export type Brain = {
  resumen: string
  identidad: { negocio: string; asistente: string; tono: string; horario: string; contacto: string }
  objetivos: string[]
  entradas: BrainEntrada[]
  agentes: BrainAgente[]
  herramientas: BrainHerramienta[]
  flujos: BrainFlujo[]
  modelos: BrainModelo[]
  integraciones: BrainIntegracion[]
  modos: BrainModo[]
  conocimiento: BrainConocimiento[]
  normas_propuestas: BrainNorma[]
  huecos: string[]
}

/** Lo que la IA saca de cada trozo de las fuentes, antes de juntarlo. */
export type BrainFacts = Omit<Brain, 'resumen' | 'identidad' | 'objetivos' | 'huecos'> & {
  identidad: string[]
  objetivos: string[]
}

export type BrainUsage = { model: string; tokens_in: number; tokens_out: number; cost_usd: number | null; calls: number }

export type BrainPublic = {
  status: BrainStatus
  progress: number
  phases: BrainPhase[]
  brain: Brain | null
  version: number
  error: string | null
  repo_source: string | null
  repo_branch: string | null
  tour_step: TourStep
  started_at: string | null
  finished_at: string | null
  usage: BrainUsage | null
  docs_count: number
}

export type BrainEstimate = {
  model: string
  chars: number
  files: number
  chunks: number
  tokens_in: number
  tokens_out: number
  cost_usd: number | null
}

export type GithubRepo = { full_name: string; private: boolean; default_branch: string; pushed_at: string | null; description: string | null }

/** Nodo final «Enviar por WhatsApp» de un flujo. */
export type WhatsappConfig = { enabled: boolean; to: string[] }

/** Flujo 1 · pruebas de cambios: de dónde llegan los cambios y a quién se avisa. */
export type Flow1Config = {
  manual: boolean
  /** Cada tarea del proyecto que pasa a «Hecha» se analiza (se revisa cada minuto). */
  tareas: boolean
  repo: boolean
  repo_every_minutes: number
  whatsapp: WhatsappConfig
}

export const DEFAULT_FLOW1: Flow1Config = {
  manual: true,
  tareas: false,
  repo: false,
  repo_every_minutes: 1440,
  whatsapp: { enabled: false, to: [] },
}

/** «ticket» queda por las entradas antiguas; hoy entran tareas. «mejora» viene del flujo de mejoras. */
export type InboxOrigen = 'cerebro' | 'manual' | 'tarea' | 'ticket' | 'repo' | 'mejora'

/* ───────────── Flujos de informe: conversaciones reales y mejoras ───────────── */

export type ReportKind = 'real' | 'mejoras'

export type ReportConfig = {
  kind: ReportKind
  enabled: boolean
  /** 0 = solo a mano. */
  every_minutes: number
  whatsapp: WhatsappConfig
  last_run_at: string | null
  next_run_at: string | null
}

export type ReportRun = {
  id: string
  kind: ReportKind
  trigger: 'manual' | 'cron'
  status: 'running' | 'ok' | 'error' | 'stopped'
  output: ReportOutput | null
  error: string | null
  usage: BrainUsage | null
  whatsapp: { sent: number; errors: string[] } | null
  started_at: string
  finished_at: string | null
}

export type ReportItem = {
  titulo: string
  detalle: string
  norma: string | null
  conversaciones: string[]
  gravedad: Gravedad
  /** Mejoras: impacto y esfuerzo. */
  impacto?: Gravedad
  esfuerzo?: Gravedad
  /** Mejoras: norma que se propone añadir a la bandeja. */
  norma_propuesta?: string | null
}

export type ReportOutput = {
  resumen: string
  periodo: string
  metricas: Record<string, number | string>
  /** Conversaciones reales: incumplimientos · Mejoras: propuestas. */
  items: ReportItem[]
  dudosas: ReportItem[]
  bien: string[]
  limites: string[]
}
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
  last_task_scan_at: string | null
  last_repo_scan_at: string | null
  last_repo_sha: string | null
  normas: Norma[]
  inbox: InboxItem[]
}
