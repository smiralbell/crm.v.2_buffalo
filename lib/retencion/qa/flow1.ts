import { query } from '@/lib/db'
import { CHANGE_SYSTEM_PROMPT, brainDigest, extractJson, normalizeCambios, upgradeBrain } from './brain-format'
import { qaChat } from './llm'
import { makeRepoReader } from './repo-reader'
import { defaultRepo } from './spider'
import {
  addInbox,
  flow1Of,
  getBrainRow,
  inboxRefExists,
  listFlow1Projects,
  listNormas,
  markRepoScan,
  markTaskScan,
} from './store'
import { sendQaText } from './notify'
import type { InboxItem, InboxOrigen } from './types'

/**
 * Flujo 1 · pruebas de cambios. Los cambios entran por tres vías (manual, tareas y
 * repositorio); la IA los convierte en propuestas de norma que esperan en la bandeja.
 */

/** Pasa un cambio por la IA y deja sus propuestas en la bandeja. */
export async function classifyChange(
  proyectoId: string,
  change: { origen: InboxOrigen; origen_ref: string | null; titulo: string; texto: string }
): Promise<InboxItem[]> {
  const [row, normas] = await Promise.all([getBrainRow(proyectoId), listNormas(proyectoId)])
  const activas = normas.filter((n) => n.estado === 'activa')
  const { text: out } = await qaChat(
    [
      { role: 'system', content: CHANGE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `SISTEMA:\n${brainDigest(upgradeBrain(row.brain))}`,
          `NORMAS ACTIVAS:\n${activas.length ? activas.map((n) => `- ${n.code}: ${n.regla}`).join('\n') : '(ninguna)'}`,
          `CAMBIO (${change.origen}):\n${change.titulo}\n\n${change.texto}`,
        ].join('\n\n'),
      },
    ],
    { model: process.env.QA_CHANGE_MODEL || undefined, json: true, maxTokens: 4000 }
  )
  const cambios = normalizeCambios(extractJson(out))
  const list = cambios.length ? cambios : normalizeCambios({ cambios: [{ accion: 'no_es_norma', motivo: 'La IA no encontró nada que cambie el comportamiento.' }] })
  const added: InboxItem[] = []
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    const item = await addInbox(proyectoId, {
      origen: change.origen,
      origen_ref: change.origen_ref ? (list.length > 1 ? `${change.origen_ref}#${i + 1}` : change.origen_ref) : null,
      titulo: c.titulo || change.titulo,
      texto: change.texto,
      propuesta: {
        accion: c.accion,
        regla: c.regla,
        area: c.area,
        canal: c.canal,
        gravedad: c.gravedad,
        motivo: c.motivo,
        norma: c.norma,
        conflicto: c.conflicto,
      },
    })
    if (item) added.push(item)
  }
  return added
}

type TaskRow = { id: string; title: string; description: string | null; priority: string; subtasks: unknown; done_at: Date }

/** Tareas del proyecto que han pasado a «Hecha» desde la última revisión (como mucho 10 cada vez). */
async function doneTasksSince(proyectoId: string, since: Date): Promise<TaskRow[]> {
  const sql = (col: string, sub: string) =>
    `SELECT id, title, description, priority, ${sub} AS subtasks, ${col} AS done_at FROM project_dev_tasks
      WHERE project_id = $1 AND status = 'done' AND ${col} > $2 ORDER BY ${col} ASC LIMIT 10`
  try {
    return (await query<TaskRow>(sql('status_changed_at', 'subtasks'), [proyectoId, since])).rows
  } catch {
    // Bases sin las columnas de tarjetas inteligentes o subtareas.
    return (await query<TaskRow>(sql('updated_at', 'NULL'), [proyectoId, since])).rows
  }
}

function subtasksText(v: unknown): string {
  if (!Array.isArray(v) || !v.length) return ''
  const lines = v
    .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>) : {}))
    .map((s) => `- ${String(s.title ?? s.text ?? s.nombre ?? '').trim()}${s.explanation ? `: ${String(s.explanation)}` : ''}`)
    .filter((l) => l.length > 2)
  return lines.length ? `\n\nSubtareas:\n${lines.join('\n')}` : ''
}

/**
 * Disparador de las tareas: cada tarea del proyecto que pasa a «Hecha» es un cambio
 * hecho en el sistema. El planificador lo mira cada minuto.
 */
export async function scanTareas(proyectoId: string): Promise<InboxItem[]> {
  const row = await getBrainRow(proyectoId)
  const since = row.last_ticket_scan_at || new Date()
  const added: InboxItem[] = []
  for (const t of await doneTasksSince(proyectoId, since)) {
    if (!(await inboxRefExists(proyectoId, 'tarea', t.id))) {
      added.push(
        ...(await classifyChange(proyectoId, {
          origen: 'tarea',
          origen_ref: t.id,
          titulo: t.title,
          texto: `Tarea terminada (prioridad ${t.priority}).\n\n${t.description || ''}${subtasksText(t.subtasks)}`.trim(),
        }))
      )
    }
    await markTaskScan(proyectoId, new Date(t.done_at))
  }
  return added
}

/** Aviso por WhatsApp de lo que ha entrado en la bandeja y hay que revisar. */
export async function notifyInbox(proyectoId: string, items: InboxItem[]): Promise<void> {
  const relevant = items.filter((i) => i.propuesta.accion === 'nueva' || i.propuesta.accion === 'modificar' || i.propuesta.conflicto)
  if (!relevant.length) return
  const row = await getBrainRow(proyectoId)
  const cfg = flow1Of(row)
  if (!cfg.whatsapp.enabled || !cfg.whatsapp.to.length) return
  const proj = await query<{ name: string }>(`SELECT name FROM proyectos WHERE id = $1`, [proyectoId])
  const base = (process.env.NEXT_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  const lines = relevant.slice(0, 8).map((i) => {
    const tag = i.propuesta.conflicto ? `⚠️ choca con ${i.propuesta.conflicto}` : i.propuesta.accion === 'modificar' ? `modifica ${i.propuesta.norma}` : 'nueva'
    return `• ${i.propuesta.regla || i.titulo} (${tag})`
  })
  const text = [
    `${proj.rows[0]?.name || 'Proyecto'} · ${relevant.length} ${relevant.length === 1 ? 'norma' : 'normas'} por revisar`,
    '',
    ...lines,
    relevant.length > 8 ? `…y ${relevant.length - 8} más` : '',
    base ? `\n${base}/retencion/proyectos/${proyectoId}?tab=sistema` : '',
  ]
    .filter((l) => l !== '')
    .join('\n')
  const r = await sendQaText(cfg.whatsapp, text)
  if (r.errors.length) console.warn('[retencion-qa] whatsapp', r.errors.join(' · '))
}

/**
 * Cambios del repositorio desde el último commit visto. La primera vez solo toma la
 * referencia: lo que ya existía lo cubre el cerebro.
 */
export async function scanRepo(proyectoId: string): Promise<{ added: InboxItem[]; baseline?: boolean; commits?: number }> {
  const row = await getBrainRow(proyectoId)
  const source = row.repo_source || (await defaultRepo(proyectoId))
  if (!source) throw new Error('El proyecto no tiene repositorio: añádelo en el cerebro.')
  const reader = await makeRepoReader(source, row.repo_branch)
  const head = await reader.head()
  if (!head) throw new Error('No se pudo leer el último commit')
  if (!row.last_repo_sha) {
    await markRepoScan(proyectoId, head)
    return { added: [], baseline: true }
  }
  if (row.last_repo_sha === head) {
    await markRepoScan(proyectoId, null)
    return { added: [], commits: 0 }
  }
  const diff = await reader.diffSince(row.last_repo_sha)
  let texto = `Commits:\n${diff.commits.map((c) => `- ${c.sha.slice(0, 7)} ${c.message}`).join('\n')}\n\nArchivos cambiados:\n`
  for (const f of diff.files) {
    if (texto.length > 60_000) {
      texto += `\n…y ${diff.files.length} archivos en total`
      break
    }
    texto += `\n--- ${f.path} ---\n${f.patch}\n`
  }
  const items = await classifyChange(proyectoId, {
    origen: 'repo',
    origen_ref: head,
    titulo: diff.commits.length === 1 ? diff.commits[0].message : `${diff.commits.length} commits nuevos`,
    texto,
  })
  await markRepoScan(proyectoId, head)
  return { added: items, commits: diff.commits.length }
}

declare global {
  // eslint-disable-next-line no-var
  var __buffaloQaRunning: boolean | undefined
}

const warn = (what: string) => (e: unknown) => {
  console.warn(`[retencion-qa] ${what}`, e instanceof Error ? e.message : e)
}

/**
 * Lo llama el planificador de retención cada minuto:
 *  - tareas que han pasado a «Hecha» (disparador, se ven en menos de un minuto),
 *  - repositorio cuando toca según su frecuencia,
 *  - informes (conversaciones reales y mejoras) cuando toca.
 */
export async function runDueQa(): Promise<void> {
  if (globalThis.__buffaloQaRunning) return
  globalThis.__buffaloQaRunning = true
  try {
    for (const row of await listFlow1Projects()) {
      const cfg = flow1Of(row)
      const added: InboxItem[] = []
      if (cfg.tareas) added.push(...(await scanTareas(row.proyecto_id).catch((e) => (warn('tareas')(e), [] as InboxItem[]))))
      const due = !row.last_repo_scan_at || Date.now() - new Date(row.last_repo_scan_at).getTime() >= cfg.repo_every_minutes * 60_000
      if (cfg.repo && due) {
        const r = await scanRepo(row.proyecto_id).catch(async (e) => {
          warn('repo')(e)
          await markRepoScan(row.proyecto_id, null).catch(() => undefined)
          return null
        })
        if (r) added.push(...r.added)
      }
      if (added.length) await notifyInbox(row.proyecto_id, added).catch(warn('whatsapp'))
    }
    const { runDueReports } = await import('./reports')
    await runDueReports().catch(warn('informes'))
  } finally {
    globalThis.__buffaloQaRunning = false
  }
}
