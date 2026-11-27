import { query } from '@/lib/db'
import { decryptDbUrl, encryptDbUrl } from '@/lib/retencion/db-url-crypto'
import {
  DEFAULT_FLOW1,
  TOUR_STEPS,
  initialPhases,
  type Brain,
  type BrainPhase,
  type BrainPublic,
  type BrainStatus,
  type Flow1Config,
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
  brain: Brain | null
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

export function toBrainPublic(row: BrainRow): BrainPublic {
  return {
    status: row.status,
    progress: row.progress,
    phases: row.phases && row.phases.length ? row.phases : initialPhases(),
    brain: row.brain,
    version: row.version,
    error: row.error,
    repo_source: row.repo_source,
    repo_branch: row.repo_branch,
    retell_configured: Boolean(row.retell_key_enc),
    tour_step: tourOf(row.tour_step),
    started_at: iso(row.started_at),
    finished_at: iso(row.finished_at),
  }
}

export async function getBrainPublic(proyectoId: string): Promise<BrainPublic> {
  return toBrainPublic(await getBrainRow(proyectoId))
}

export async function saveBrainSources(
  proyectoId: string,
  input: { repo_source?: string | null; repo_branch?: string | null; retell_api_key?: string | null; clear_retell?: boolean }
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
  if (input.clear_retell) {
    await query(`UPDATE retencion_qa_brain SET retell_key_enc = NULL, updated_at = NOW() WHERE proyecto_id = $1`, [proyectoId])
  } else if (input.retell_api_key && input.retell_api_key.trim()) {
    await query(`UPDATE retencion_qa_brain SET retell_key_enc = $2, updated_at = NOW() WHERE proyecto_id = $1`, [
      proyectoId,
      encryptDbUrl(input.retell_api_key.trim()),
    ])
  }
}

export async function getRetellKey(proyectoId: string): Promise<string | null> {
  const row = await getBrainRow(proyectoId)
  return row.retell_key_enc ? decryptDbUrl(row.retell_key_enc) : null
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
       SET status = 'running', progress = 0, phases = $2::jsonb, error = NULL, started_at = NOW(), finished_at = NULL, updated_at = NOW()
     WHERE proyecto_id = $1 AND status <> 'running'`,
    [proyectoId, JSON.stringify(initialPhases())]
  )
  return rowCount > 0
}

export async function saveSpiderProgress(proyectoId: string, progress: number, phases: BrainPhase[]): Promise<void> {
  await query(
    `UPDATE retencion_qa_brain SET progress = $2, phases = $3::jsonb, updated_at = NOW() WHERE proyecto_id = $1`,
    [proyectoId, progress, JSON.stringify(phases)]
  )
}

export async function finishSpider(
  proyectoId: string,
  result: { ok: true; brain: Brain; phases: BrainPhase[] } | { ok: false; error: string; phases: BrainPhase[] }
): Promise<void> {
  if (result.ok) {
    await query(
      `UPDATE retencion_qa_brain
         SET status = 'done', progress = 100, phases = $2::jsonb, brain = $3::jsonb, version = version + 1,
             finished_at = NOW(), updated_at = NOW(),
             tour_step = CASE WHEN tour_step IN ('bienvenida','fuentes','rastreo') THEN 'cerebro' ELSE tour_step END
       WHERE proyecto_id = $1`,
      [proyectoId, JSON.stringify(result.phases), JSON.stringify(result.brain)]
    )
  } else {
    await query(
      `UPDATE retencion_qa_brain SET status = 'error', phases = $2::jsonb, error = $3, finished_at = NOW(), updated_at = NOW() WHERE proyecto_id = $1`,
      [proyectoId, JSON.stringify(result.phases), result.error.slice(0, 2000)]
    )
  }
}

/* ───────────── Flujo 1 · configuración ───────────── */

export function flow1Of(row: { flow1: Partial<Flow1Config> | null }): Flow1Config {
  const f = row.flow1 || {}
  const every = Number(f.repo_every_minutes)
  return {
    manual: f.manual !== false,
    tickets: f.tickets === true,
    repo: f.repo === true,
    repo_every_minutes: Number.isFinite(every) && every >= 15 ? Math.min(every, 10080) : DEFAULT_FLOW1.repo_every_minutes,
  }
}

export async function saveFlow1Config(proyectoId: string, config: Flow1Config): Promise<void> {
  const row = await getBrainRow(proyectoId)
  const before = flow1Of(row)
  await query(
    `UPDATE retencion_qa_brain
       SET flow1 = $2::jsonb, flow1_configured = TRUE,
           last_ticket_scan_at = CASE WHEN $3 THEN NOW() ELSE last_ticket_scan_at END,
           tour_step = CASE WHEN tour_step = 'flujo1' THEN 'hecho' ELSE tour_step END
     WHERE proyecto_id = $1`,
    // Al activar los tickets se empieza desde ahora: los anteriores ya los resume el cerebro.
    [proyectoId, JSON.stringify(config), config.tickets && !before.tickets]
  )
}

export async function markTicketScan(proyectoId: string, at: Date): Promise<void> {
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
    last_ticket_scan_at: iso(row.last_ticket_scan_at),
    last_repo_scan_at: iso(row.last_repo_scan_at),
    last_repo_sha: row.last_repo_sha,
    normas,
    inbox,
  }
}
