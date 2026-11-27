import { query } from '@/lib/db'
import { upgradeBrain } from './brain-format'
import {
  DEFAULT_FLOW1,
  TOUR_STEPS,
  initialPhases,
  type Brain,
  type BrainPhase,
  type BrainPublic,
  type BrainStatus,
  type BrainUsage,
  type Flow1Config,
  type ReportConfig,
  type ReportKind,
  type ReportOutput,
  type ReportRun,
  type WhatsappConfig,
  type Flow1Public,
  type InboxItem,
  type InboxOrigen,
  type Norma,
  type Propuesta,
  type TourStep,
} from './types'

/**
 * Tablas de calidad (retención). Se crean solas la primera vez, como el resto del módulo.
 * El SQL equivalente está en prisma/CREATE_RETENCION_QA.sql.
 */
let ensured: Promise<void> | null = null

export function ensureQaTables(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS retencion_qa_brain (
          proyecto_id         UUID PRIMARY KEY,
          status              TEXT NOT NULL DEFAULT 'idle',
          progress            INT NOT NULL DEFAULT 0,
          phases              JSONB NOT NULL DEFAULT '[]'::jsonb,
          brain               JSONB,
          version             INT NOT NULL DEFAULT 0,
          error               TEXT,
          repo_source         TEXT,
          repo_branch         TEXT,
          retell_key_enc      TEXT,
          tour_step           TEXT NOT NULL DEFAULT 'bienvenida',
          flow1               JSONB,
          flow1_configured    BOOLEAN NOT NULL DEFAULT FALSE,
          last_ticket_scan_at TIMESTAMPTZ,
          last_repo_sha       TEXT,
          last_repo_scan_at   TIMESTAMPTZ,
          started_at          TIMESTAMPTZ,
          finished_at         TIMESTAMPTZ,
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`)
      await query(`
        CREATE TABLE IF NOT EXISTS retencion_qa_rules (
          id           BIGSERIAL PRIMARY KEY,
          proyecto_id  UUID NOT NULL,
          code         TEXT NOT NULL,
          regla        TEXT NOT NULL,
          area         TEXT,
          canal        TEXT,
          gravedad     TEXT NOT NULL DEFAULT 'media',
          estado       TEXT NOT NULL DEFAULT 'activa',
          origen_tipo  TEXT NOT NULL,
          origen_ref   TEXT,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`)
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS retencion_qa_rules_code ON retencion_qa_rules (proyecto_id, code)`)
      await query(`
        CREATE TABLE IF NOT EXISTS retencion_qa_inbox (
          id           BIGSERIAL PRIMARY KEY,
          proyecto_id  UUID NOT NULL,
          origen       TEXT NOT NULL,
          origen_ref   TEXT,
          titulo       TEXT NOT NULL,
          texto        TEXT NOT NULL,
          propuesta    JSONB NOT NULL,
          estado       TEXT NOT NULL DEFAULT 'pendiente',
          rule_id      BIGINT,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          decided_at   TIMESTAMPTZ
        )`)
      await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS retencion_qa_inbox_ref ON retencion_qa_inbox (proyecto_id, origen, origen_ref) WHERE origen_ref IS NOT NULL`
      )
      await query(`CREATE INDEX IF NOT EXISTS retencion_qa_inbox_proyecto ON retencion_qa_inbox (proyecto_id, created_at DESC)`)
      await query(`ALTER TABLE retencion_qa_brain ADD COLUMN IF NOT EXISTS usage JSONB`)
      await query(`ALTER TABLE retencion_qa_brain ADD COLUMN IF NOT EXISTS facts JSONB`)
      // Todo lo que se leyó en el último rastreo, entero, para los siguientes flujos.
      await query(`
        CREATE TABLE IF NOT EXISTS retencion_qa_docs (
          id           BIGSERIAL PRIMARY KEY,
          proyecto_id  UUID NOT NULL,
          version      INT NOT NULL,
          fuente       TEXT NOT NULL,
          ruta         TEXT NOT NULL,
          contenido    TEXT NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`)
      await query(`CREATE INDEX IF NOT EXISTS retencion_qa_docs_proyecto ON retencion_qa_docs (proyecto_id, version)`)
      await query(`ALTER TABLE retencion_qa_brain ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT FALSE`)
      // Flujos de informe (conversaciones reales y mejoras): configuración y ejecuciones.
      await query(`
        CREATE TABLE IF NOT EXISTS retencion_qa_report_config (
          proyecto_id    UUID NOT NULL,
          kind           TEXT NOT NULL,
          enabled        BOOLEAN NOT NULL DEFAULT FALSE,
          every_minutes  INT NOT NULL DEFAULT 0,
          whatsapp       JSONB NOT NULL DEFAULT '{}'::jsonb,
          last_run_at    TIMESTAMPTZ,
          next_run_at    TIMESTAMPTZ,
          PRIMARY KEY (proyecto_id, kind)
        )`)
      await query(`
        CREATE TABLE IF NOT EXISTS retencion_qa_report_runs (
          id           BIGSERIAL PRIMARY KEY,
          proyecto_id  UUID NOT NULL,
          kind         TEXT NOT NULL,
          trigger      TEXT NOT NULL,
          status       TEXT NOT NULL DEFAULT 'running',
          output       JSONB,
          error        TEXT,
          usage        JSONB,
          whatsapp     JSONB,
          started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at  TIMESTAMPTZ
        )`)
      await query(`CREATE INDEX IF NOT EXISTS retencion_qa_report_runs_proyecto ON retencion_qa_report_runs (proyecto_id, kind, started_at DESC)`)
    })().catch((e) => {
      ensured = null
      throw e
    })
  }
  return ensured
}

type BrainRow = {
  proyecto_id: string
  status: BrainStatus
  progress: number
  phases: BrainPhase[] | null
  brain: unknown
  usage: BrainUsage | null
  version: number
  error: string | null
  repo_source: string | null
  repo_branch: string | null
  retell_key_enc: string | null
  tour_step: string
  flow1: Partial<Flow1Config> | null
  flow1_configured: boolean
  last_ticket_scan_at: Date | null
  last_repo_sha: string | null
  last_repo_scan_at: Date | null
  started_at: Date | null
  finished_at: Date | null
  updated_at: Date
}

/** Un rastreo que lleva este tiempo sin avanzar se da por interrumpido (reinicio del servidor). */
const STALE_MS = 10 * 60 * 1000

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null)

export async function getBrainRow(proyectoId: string): Promise<BrainRow> {
  await ensureQaTables()
  await query(`INSERT INTO retencion_qa_brain (proyecto_id) VALUES ($1) ON CONFLICT (proyecto_id) DO NOTHING`, [proyectoId])
  const { rows } = await query<BrainRow>(`SELECT * FROM retencion_qa_brain WHERE proyecto_id = $1`, [proyectoId])
  const row = rows[0]
  if (row.status === 'running' && Date.now() - new Date(row.updated_at).getTime() > STALE_MS) {
    await query(
      `UPDATE retencion_qa_brain SET status = 'error', error = $2, updated_at = NOW() WHERE proyecto_id = $1`,
      [proyectoId, 'El rastreo se interrumpió (probablemente se reinició el servidor). Vuelve a lanzarlo.']
    )
    row.status = 'error'
    row.error = 'El rastreo se interrumpió (probablemente se reinició el servidor). Vuelve a lanzarlo.'
  }
  return row
}

function tourOf(v: string): TourStep {
  return (TOUR_STEPS as string[]).includes(v) ? (v as TourStep) : 'bienvenida'
}

export function toBrainPublic(row: BrainRow, docsCount = 0): BrainPublic {
  return {
    status: row.status,
    progress: row.progress,
    // Los rastreos antiguos tenían una fase de Retell: se quita.
    phases: row.phases && row.phases.length ? row.phases.filter((p) => (p.id as string) !== 'retell') : initialPhases(),
    brain: upgradeBrain(row.brain),
    version: row.version,
    error: row.error,
    repo_source: row.repo_source,
    repo_branch: row.repo_branch,
    tour_step: tourOf(row.tour_step),
    started_at: iso(row.started_at),
    finished_at: iso(row.finished_at),
    usage: row.usage,
    docs_count: docsCount,
  }
}

export async function getBrainPublic(proyectoId: string): Promise<BrainPublic> {
  const row = await getBrainRow(proyectoId)
  const { rows } = await query<{ n: string }>(
    `SELECT COUNT(*) AS n FROM retencion_qa_docs WHERE proyecto_id = $1 AND version = $2`,
    [proyectoId, row.version]
  )
  return toBrainPublic(row, Number(rows[0]?.n || 0))
}

export async function saveBrainSources(
  proyectoId: string,
  input: { repo_source?: string | null; repo_branch?: string | null }
): Promise<void> {
  await getBrainRow(proyectoId)
  if (input.repo_source !== undefined) {
    await query(`UPDATE retencion_qa_brain SET repo_source = $2, updated_at = NOW() WHERE proyecto_id = $1`, [
      proyectoId,
      input.repo_source?.trim() || null,
    ])
  }
  if (input.repo_branch !== undefined) {
    await query(`UPDATE retencion_qa_brain SET repo_branch = $2, updated_at = NOW() WHERE proyecto_id = $1`, [
      proyectoId,
      input.repo_branch?.trim() || null,
    ])
  }
}

export async function setTourStep(proyectoId: string, step: TourStep): Promise<void> {
  await getBrainRow(proyectoId)
  await query(`UPDATE retencion_qa_brain SET tour_step = $2 WHERE proyecto_id = $1`, [proyectoId, step])
}

/** Marca el inicio de un rastreo. Devuelve false si ya hay uno en marcha. */
export async function claimSpiderRun(proyectoId: string): Promise<boolean> {
  await getBrainRow(proyectoId)
  const { rowCount } = await query(
    `UPDATE retencion_qa_brain
       SET status = 'running', progress = 0, phases = $2::jsonb, error = NULL, cancel_requested = FALSE,
           started_at = NOW(), finished_at = NULL, updated_at = NOW()
     WHERE proyecto_id = $1 AND status <> 'running'`,
    [proyectoId, JSON.stringify(initialPhases())]
  )
  return rowCount > 0
}

/** Pide parar el rastreo en marcha. La araña lo ve en su siguiente paso (en segundos). */
export async function requestSpiderStop(proyectoId: string): Promise<boolean> {
  await getBrainRow(proyectoId)
  const { rowCount } = await query(
    `UPDATE retencion_qa_brain SET cancel_requested = TRUE WHERE proyecto_id = $1 AND status = 'running'`,
    [proyectoId]
  )
  return rowCount > 0
}

/** Guarda el progreso y devuelve si se ha pedido parar. */
export async function saveSpiderProgress(proyectoId: string, progress: number, phases: BrainPhase[]): Promise<boolean> {
  const { rows } = await query<{ cancel_requested: boolean }>(
    `UPDATE retencion_qa_brain SET progress = $2, phases = $3::jsonb, updated_at = NOW() WHERE proyecto_id = $1 RETURNING cancel_requested`,
    [proyectoId, progress, JSON.stringify(phases)]
  )
  return Boolean(rows[0]?.cancel_requested)
}

/** Rastreo parado a mano: el cerebro anterior se queda como estaba. */
export async function markSpiderStopped(proyectoId: string, phases: BrainPhase[]): Promise<void> {
  await query(
    `UPDATE retencion_qa_brain
        SET status = 'stopped', phases = $2::jsonb, error = NULL, cancel_requested = FALSE, finished_at = NOW(), updated_at = NOW()
      WHERE proyecto_id = $1`,
    [proyectoId, JSON.stringify(phases)]
  )
}

export async function finishSpider(
  proyectoId: string,
  result:
    | { ok: true; brain: Brain; facts: unknown; phases: BrainPhase[]; usage: BrainUsage; docs: BrainDoc[] }
    | { ok: false; error: string; phases: BrainPhase[]; usage?: BrainUsage }
): Promise<void> {
  if (result.ok) {
    const { rows } = await query<{ version: number }>(
      `UPDATE retencion_qa_brain
         SET status = 'done', progress = 100, phases = $2::jsonb, brain = $3::jsonb, facts = $4::jsonb, usage = $5::jsonb,
             version = version + 1, finished_at = NOW(), updated_at = NOW(),
             tour_step = CASE WHEN tour_step IN ('bienvenida','fuentes','rastreo') THEN 'cerebro' ELSE tour_step END
       WHERE proyecto_id = $1
       RETURNING version`,
      [proyectoId, JSON.stringify(result.phases), JSON.stringify(result.brain), JSON.stringify(result.facts), JSON.stringify(result.usage)]
    )
    await saveBrainDocs(proyectoId, rows[0]?.version ?? 1, result.docs)
  } else {
    await query(
      `UPDATE retencion_qa_brain SET status = 'error', phases = $2::jsonb, error = $3, usage = COALESCE($4::jsonb, usage), finished_at = NOW(), updated_at = NOW() WHERE proyecto_id = $1`,
      [proyectoId, JSON.stringify(result.phases), result.error.slice(0, 2000), result.usage ? JSON.stringify(result.usage) : null]
    )
  }
}

export type BrainDoc = { fuente: string; ruta: string; contenido: string }

/** Guarda lo leído en este rastreo y quita lo de versiones anteriores (solo vale la última). */
async function saveBrainDocs(proyectoId: string, version: number, docs: BrainDoc[]): Promise<void> {
  for (let i = 0; i < docs.length; i += 50) {
    const batch = docs.slice(i, i + 50)
    const values: unknown[] = []
    const tuples = batch.map((d, j) => {
      values.push(proyectoId, version, d.fuente, d.ruta, d.contenido)
      const b = j * 5
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`
    })
    await query(`INSERT INTO retencion_qa_docs (proyecto_id, version, fuente, ruta, contenido) VALUES ${tuples.join(', ')}`, values)
  }
  await query(`DELETE FROM retencion_qa_docs WHERE proyecto_id = $1 AND version <> $2`, [proyectoId, version])
}

/** Documentos leídos en el último rastreo (sin el contenido). */
export async function listBrainDocs(proyectoId: string): Promise<{ fuente: string; ruta: string; chars: number }[]> {
  await ensureQaTables()
  const { rows } = await query<{ fuente: string; ruta: string; chars: number }>(
    `SELECT d.fuente, d.ruta, LENGTH(d.contenido) AS chars
       FROM retencion_qa_docs d JOIN retencion_qa_brain b ON b.proyecto_id = d.proyecto_id AND b.version = d.version
      WHERE d.proyecto_id = $1
      ORDER BY d.fuente, d.ruta`,
    [proyectoId]
  )
  return rows.map((r) => ({ ...r, chars: Number(r.chars) }))
}

/* ───────────── Flujo 1 · configuración ───────────── */

/** Móviles limpios: solo dígitos, con prefijo de país, sin repetir. */
export function cleanPhones(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const x of list) {
    const d = String(x ?? '').replace(/\D/g, '')
    if (d.length >= 9 && d.length <= 15 && !out.includes(d)) out.push(d)
  }
  return out.slice(0, 20)
}

export function whatsappOf(v: unknown): WhatsappConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return { enabled: o.enabled === true, to: cleanPhones(o.to) }
}

export function flow1Of(row: { flow1: Partial<Flow1Config> | null }): Flow1Config {
  const f = (row.flow1 || {}) as Partial<Flow1Config>
  const every = Number(f.repo_every_minutes)
  return {
    manual: f.manual !== false,
    tareas: f.tareas === true,
    repo: f.repo === true,
    repo_every_minutes: Number.isFinite(every) && every >= 15 ? Math.min(every, 10080) : DEFAULT_FLOW1.repo_every_minutes,
    whatsapp: whatsappOf(f.whatsapp),
  }
}

export async function saveFlow1Config(proyectoId: string, config: Flow1Config): Promise<void> {
  const row = await getBrainRow(proyectoId)
  const before = flow1Of(row)
  const clean: Flow1Config = { ...config, whatsapp: whatsappOf(config.whatsapp) }
  await query(
    `UPDATE retencion_qa_brain
       SET flow1 = $2::jsonb, flow1_configured = TRUE,
           last_ticket_scan_at = CASE WHEN $3 THEN NOW() ELSE last_ticket_scan_at END,
           tour_step = CASE WHEN tour_step = 'flujo1' THEN 'hecho' ELSE tour_step END
     WHERE proyecto_id = $1`,
    // Al activar las tareas se empieza desde ahora: lo hecho antes ya lo recoge el cerebro.
    [proyectoId, JSON.stringify(clean), clean.tareas && !before.tareas]
  )
}

/** Última tarea revisada (la columna se llama así por la primera versión, que miraba tickets). */
export async function markTaskScan(proyectoId: string, at: Date): Promise<void> {
  await query(`UPDATE retencion_qa_brain SET last_ticket_scan_at = $2 WHERE proyecto_id = $1`, [proyectoId, at])
}

export async function markRepoScan(proyectoId: string, sha: string | null): Promise<void> {
  await query(
    `UPDATE retencion_qa_brain SET last_repo_scan_at = NOW(), last_repo_sha = COALESCE($2, last_repo_sha) WHERE proyecto_id = $1`,
    [proyectoId, sha]
  )
}

export async function listFlow1Projects(): Promise<BrainRow[]> {
  await ensureQaTables()
  const { rows } = await query<BrainRow>(`SELECT * FROM retencion_qa_brain WHERE flow1_configured = TRUE`)
  return rows
}

/* ───────────── Normas y bandeja ───────────── */

type RuleRow = {
  id: string
  code: string
  regla: string
  area: string | null
  canal: string | null
  gravedad: string
  estado: string
  origen_tipo: string
  origen_ref: string | null
  created_at: Date
}

function toNorma(r: RuleRow): Norma {
  return {
    id: String(r.id),
    code: r.code,
    regla: r.regla,
    area: r.area,
    canal: r.canal,
    gravedad: r.gravedad === 'alta' || r.gravedad === 'baja' ? r.gravedad : 'media',
    estado: r.estado === 'sustituida' ? 'sustituida' : 'activa',
    origen_tipo: r.origen_tipo as InboxOrigen,
    origen_ref: r.origen_ref,
    created_at: new Date(r.created_at).toISOString(),
  }
}

export async function listNormas(proyectoId: string): Promise<Norma[]> {
  await ensureQaTables()
  const { rows } = await query<RuleRow>(
    `SELECT * FROM retencion_qa_rules WHERE proyecto_id = $1 ORDER BY estado ASC, code ASC`,
    [proyectoId]
  )
  return rows.map(toNorma)
}

type InboxRow = {
  id: string
  origen: string
  origen_ref: string | null
  titulo: string
  texto: string
  propuesta: Propuesta
  estado: string
  created_at: Date
}

function toInbox(r: InboxRow): InboxItem {
  return {
    id: String(r.id),
    origen: r.origen as InboxOrigen,
    origen_ref: r.origen_ref,
    titulo: r.titulo,
    texto: r.texto,
    propuesta: r.propuesta,
    estado: r.estado === 'aprobada' || r.estado === 'descartada' ? r.estado : 'pendiente',
    created_at: new Date(r.created_at).toISOString(),
  }
}

export async function listInbox(proyectoId: string): Promise<InboxItem[]> {
  await ensureQaTables()
  const { rows } = await query<InboxRow>(
    `SELECT * FROM retencion_qa_inbox WHERE proyecto_id = $1
     ORDER BY (estado = 'pendiente') DESC, created_at DESC LIMIT 200`,
    [proyectoId]
  )
  return rows.map(toInbox)
}

/** Añade una entrada a la bandeja. Si ya existe (mismo origen y referencia) no la duplica. */
export async function addInbox(
  proyectoId: string,
  item: { origen: InboxOrigen; origen_ref: string | null; titulo: string; texto: string; propuesta: Propuesta }
): Promise<InboxItem | null> {
  await ensureQaTables()
  const { rows } = await query<InboxRow>(
    `INSERT INTO retencion_qa_inbox (proyecto_id, origen, origen_ref, titulo, texto, propuesta)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [proyectoId, item.origen, item.origen_ref, item.titulo.slice(0, 300), item.texto.slice(0, 8000), JSON.stringify(item.propuesta)]
  )
  return rows[0] ? toInbox(rows[0]) : null
}

export async function inboxRefExists(proyectoId: string, origen: InboxOrigen, ref: string): Promise<boolean> {
  await ensureQaTables()
  const { rows } = await query(
    `SELECT 1 FROM retencion_qa_inbox WHERE proyecto_id = $1 AND origen = $2 AND origen_ref = $3 LIMIT 1`,
    [proyectoId, origen, ref]
  )
  return rows.length > 0
}

/** Prefijo de los códigos de norma: primera palabra del proyecto, en mayúsculas y sin acentos. */
export function codePrefix(name: string): string {
  const word = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)[0]
  return (word || 'NORMA').toUpperCase().slice(0, 10)
}

export function nextCode(prefix: string, existing: string[]): string {
  let max = 0
  for (const c of existing) {
    const m = c.match(/-(\d+)$/)
    if (m && c.startsWith(`${prefix}-`)) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

/**
 * Decide una entrada de la bandeja. Aprobar una propuesta «nueva» crea la norma;
 * «modificar» crea la versión nueva y deja la anterior como sustituida.
 */
export async function decideInbox(
  proyectoId: string,
  proyectoName: string,
  inboxId: string,
  decision: 'aprobar' | 'descartar',
  override?: { regla?: string }
): Promise<{ item: InboxItem; norma: Norma | null }> {
  await ensureQaTables()
  const { rows } = await query<InboxRow>(
    `SELECT * FROM retencion_qa_inbox WHERE id = $1 AND proyecto_id = $2`,
    [inboxId, proyectoId]
  )
  const row = rows[0]
  if (!row) throw new Error('Entrada no encontrada')
  if (row.estado !== 'pendiente') return { item: toInbox(row), norma: null }

  let norma: Norma | null = null
  const p = row.propuesta
  if (decision === 'aprobar' && (p.accion === 'nueva' || p.accion === 'modificar')) {
    const regla = (override?.regla || p.regla || '').trim()
    if (!regla) throw new Error('La propuesta no tiene texto de norma')
    const existing = await query<{ code: string }>(`SELECT code FROM retencion_qa_rules WHERE proyecto_id = $1`, [proyectoId])
    const code = nextCode(codePrefix(proyectoName), existing.rows.map((r) => r.code))
    if (p.accion === 'modificar' && p.norma) {
      await query(
        `UPDATE retencion_qa_rules SET estado = 'sustituida', updated_at = NOW() WHERE proyecto_id = $1 AND code = $2`,
        [proyectoId, p.norma]
      )
    }
    const ins = await query<RuleRow>(
      `INSERT INTO retencion_qa_rules (proyecto_id, code, regla, area, canal, gravedad, origen_tipo, origen_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [proyectoId, code, regla, p.area || null, p.canal || null, p.gravedad || 'media', row.origen, row.origen_ref]
    )
    norma = toNorma(ins.rows[0])
  }

  const upd = await query<InboxRow>(
    `UPDATE retencion_qa_inbox SET estado = $3, decided_at = NOW(), rule_id = $4 WHERE id = $1 AND proyecto_id = $2 RETURNING *`,
    [inboxId, proyectoId, decision === 'aprobar' ? 'aprobada' : 'descartada', norma ? norma.id : null]
  )
  return { item: toInbox(upd.rows[0]), norma }
}

export async function getFlow1Public(proyectoId: string): Promise<Flow1Public> {
  const row = await getBrainRow(proyectoId)
  const [normas, inbox] = await Promise.all([listNormas(proyectoId), listInbox(proyectoId)])
  return {
    config: flow1Of(row),
    configured: row.flow1_configured,
    last_task_scan_at: iso(row.last_ticket_scan_at),
    last_repo_scan_at: iso(row.last_repo_scan_at),
    last_repo_sha: row.last_repo_sha,
    normas,
    inbox,
  }
}

/* ───────────── Flujos de informe ───────────── */

/** Cada cuánto puede ir un informe (minutos). 0 = solo a mano. */
export const REPORT_EVERY = [0, 1440, 10080, 43200] as const

type ReportConfigRow = {
  kind: ReportKind
  enabled: boolean
  every_minutes: number
  whatsapp: unknown
  last_run_at: Date | null
  next_run_at: Date | null
}

const DEFAULT_EVERY: Record<ReportKind, number> = { real: 1440, mejoras: 10080 }

function toReportConfig(kind: ReportKind, r: ReportConfigRow | undefined): ReportConfig {
  return {
    kind,
    enabled: r?.enabled ?? false,
    every_minutes: r ? r.every_minutes : DEFAULT_EVERY[kind],
    whatsapp: whatsappOf(r?.whatsapp),
    last_run_at: iso(r?.last_run_at ?? null),
    next_run_at: iso(r?.next_run_at ?? null),
  }
}

export async function getReportConfig(proyectoId: string, kind: ReportKind): Promise<ReportConfig> {
  await ensureQaTables()
  const { rows } = await query<ReportConfigRow>(
    `SELECT * FROM retencion_qa_report_config WHERE proyecto_id = $1 AND kind = $2`,
    [proyectoId, kind]
  )
  return toReportConfig(kind, rows[0])
}

export async function saveReportConfig(
  proyectoId: string,
  kind: ReportKind,
  input: { enabled: boolean; every_minutes: number; whatsapp: WhatsappConfig }
): Promise<ReportConfig> {
  await ensureQaTables()
  const every = (REPORT_EVERY as readonly number[]).includes(input.every_minutes) ? input.every_minutes : DEFAULT_EVERY[kind]
  // La siguiente ejecución cuenta desde la última (o desde ahora si nunca se ha ejecutado).
  await query(
    `INSERT INTO retencion_qa_report_config (proyecto_id, kind, enabled, every_minutes, whatsapp, next_run_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, CASE WHEN $3 AND $4 > 0 THEN NOW() + make_interval(mins => $4) END)
     ON CONFLICT (proyecto_id, kind) DO UPDATE
       SET enabled = EXCLUDED.enabled, every_minutes = EXCLUDED.every_minutes, whatsapp = EXCLUDED.whatsapp,
           next_run_at = CASE WHEN EXCLUDED.enabled AND EXCLUDED.every_minutes > 0
                              THEN COALESCE(retencion_qa_report_config.last_run_at, NOW()) + make_interval(mins => EXCLUDED.every_minutes)
                         END`,
    [proyectoId, kind, input.enabled, every, JSON.stringify(whatsappOf(input.whatsapp))]
  )
  return getReportConfig(proyectoId, kind)
}

/** Informes que tocan ahora. */
export async function listDueReports(): Promise<{ proyecto_id: string; kind: ReportKind }[]> {
  await ensureQaTables()
  const { rows } = await query<{ proyecto_id: string; kind: ReportKind }>(
    `SELECT proyecto_id, kind FROM retencion_qa_report_config
      WHERE enabled AND every_minutes > 0 AND next_run_at IS NOT NULL AND next_run_at <= NOW()`
  )
  return rows
}

type ReportRunRow = {
  id: string
  kind: ReportKind
  trigger: 'manual' | 'cron'
  status: 'running' | 'ok' | 'error'
  output: ReportOutput | null
  error: string | null
  usage: BrainUsage | null
  whatsapp: { sent: number; errors: string[] } | null
  started_at: Date
  finished_at: Date | null
}

function toReportRun(r: ReportRunRow): ReportRun {
  return {
    id: String(r.id),
    kind: r.kind,
    trigger: r.trigger,
    status: r.status,
    output: r.output,
    error: r.error,
    usage: r.usage,
    whatsapp: r.whatsapp,
    started_at: new Date(r.started_at).toISOString(),
    finished_at: iso(r.finished_at),
  }
}

/** Empieza una ejecución. Devuelve null si ya hay una en marcha (de menos de 30 min). */
export async function startReportRun(proyectoId: string, kind: ReportKind, trigger: 'manual' | 'cron'): Promise<string | null> {
  await ensureQaTables()
  const busy = await query(
    `SELECT 1 FROM retencion_qa_report_runs
      WHERE proyecto_id = $1 AND kind = $2 AND status = 'running' AND started_at > NOW() - INTERVAL '30 minutes' LIMIT 1`,
    [proyectoId, kind]
  )
  if (busy.rows.length) return null
  const { rows } = await query<{ id: string }>(
    `INSERT INTO retencion_qa_report_runs (proyecto_id, kind, trigger) VALUES ($1, $2, $3) RETURNING id`,
    [proyectoId, kind, trigger]
  )
  await query(
    `UPDATE retencion_qa_report_config
        SET last_run_at = NOW(),
            next_run_at = CASE WHEN enabled AND every_minutes > 0 THEN NOW() + make_interval(mins => every_minutes) END
      WHERE proyecto_id = $1 AND kind = $2`,
    [proyectoId, kind]
  )
  return String(rows[0].id)
}

export async function finishReportRun(
  runId: string,
  result: { status: 'ok' | 'error'; output: ReportOutput | null; error: string | null; usage: BrainUsage | null; whatsapp: ReportRun['whatsapp'] }
): Promise<void> {
  await query(
    `UPDATE retencion_qa_report_runs
        SET status = $2, output = $3::jsonb, error = $4, usage = $5::jsonb, whatsapp = $6::jsonb, finished_at = NOW()
      WHERE id = $1`,
    [
      runId,
      result.status,
      result.output ? JSON.stringify(result.output) : null,
      result.error,
      result.usage ? JSON.stringify(result.usage) : null,
      result.whatsapp ? JSON.stringify(result.whatsapp) : null,
    ]
  )
}

export async function listReportRuns(proyectoId: string, kind: ReportKind, limit = 20): Promise<ReportRun[]> {
  await ensureQaTables()
  const { rows } = await query<ReportRunRow>(
    `SELECT * FROM retencion_qa_report_runs WHERE proyecto_id = $1 AND kind = $2 ORDER BY started_at DESC LIMIT $3`,
    [proyectoId, kind, limit]
  )
  return rows.map(toReportRun)
}

/** Fecha desde la que mira un informe: la última ejecución buena o, si no hay, su periodo. */
export async function reportSince(proyectoId: string, kind: ReportKind, fallbackMinutes: number): Promise<Date> {
  const { rows } = await query<{ started_at: Date }>(
    `SELECT started_at FROM retencion_qa_report_runs WHERE proyecto_id = $1 AND kind = $2 AND status = 'ok' ORDER BY started_at DESC LIMIT 1`,
    [proyectoId, kind]
  )
  return rows[0] ? new Date(rows[0].started_at) : new Date(Date.now() - fallbackMinutes * 60_000)
}
