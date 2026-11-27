import { query } from '@/lib/db'
import { openRouterChatCompletion, resolveModel } from '@/lib/openrouter'
import { CHANGE_SYSTEM_PROMPT, brainDigest, extractJson, normalizeCambios } from './brain-format'
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
  markTicketScan,
} from './store'
import type { InboxItem, InboxOrigen } from './types'

/**
 * Flujo 1 · pruebas de cambios. Los cambios entran por tres vías (manual, tickets,
 * repositorio); la IA los convierte en propuestas de norma que esperan en la bandeja.
 */

/** Pasa un cambio por la IA y deja sus propuestas en la bandeja. */
export async function classifyChange(
  proyectoId: string,
  change: { origen: InboxOrigen; origen_ref: string | null; titulo: string; texto: string }
): Promise<InboxItem[]> {
  const [row, normas] = await Promise.all([getBrainRow(proyectoId), listNormas(proyectoId)])
  const activas = normas.filter((n) => n.estado === 'activa')
  const out = await openRouterChatCompletion(
    [
      { role: 'system', content: CHANGE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `SISTEMA:\n${brainDigest(row.brain)}`,
          `NORMAS ACTIVAS:\n${activas.length ? activas.map((n) => `- ${n.code}: ${n.regla}`).join('\n') : '(ninguna)'}`,
          `CAMBIO (${change.origen}):\n${change.titulo}\n\n${change.texto}`,
        ].join('\n\n'),
      },
    ],
    { model: process.env.QA_CHANGE_MODEL || resolveModel('heavy'), json: true, maxTokens: 3000, temperature: 0.1 }
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

type TicketRow = { id: string; title: string; description: string | null; priority: string; created_at: Date }

/** Tickets nuevos del proyecto desde la última pasada (como mucho 10 por vez). */
export async function scanTickets(proyectoId: string): Promise<number> {
  const row = await getBrainRow(proyectoId)
  const since = row.last_ticket_scan_at || new Date()
  const { rows } = await query<TicketRow>(
    `SELECT id, title, description, priority, created_at FROM tickets
     WHERE project_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 10`,
    [proyectoId, since]
  )
  let n = 0
  for (const t of rows) {
    if (!(await inboxRefExists(proyectoId, 'ticket', t.id))) {
      const items = await classifyChange(proyectoId, {
        origen: 'ticket',
        origen_ref: t.id,
        titulo: t.title,
        texto: `Prioridad: ${t.priority}\n\n${t.description || ''}`.trim(),
      })
      n += items.length
    }
    await markTicketScan(proyectoId, new Date(t.created_at))
  }
  return n
}

/**
 * Cambios del repositorio desde el último commit visto. La primera vez solo toma la
 * referencia: lo que ya existía lo cubre el cerebro.
 */
export async function scanRepo(proyectoId: string): Promise<{ added: number; baseline?: boolean; commits?: number }> {
  const row = await getBrainRow(proyectoId)
  const source = row.repo_source || (await defaultRepo(proyectoId))
  if (!source) throw new Error('El proyecto no tiene repositorio: añádelo en el cerebro.')
  const reader = await makeRepoReader(source, row.repo_branch)
  const head = await reader.head()
  if (!head) throw new Error('No se pudo leer el último commit')
  if (!row.last_repo_sha) {
    await markRepoScan(proyectoId, head)
    return { added: 0, baseline: true }
  }
  if (row.last_repo_sha === head) {
    await markRepoScan(proyectoId, null)
    return { added: 0, commits: 0 }
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
  return { added: items.length, commits: diff.commits.length }
}

declare global {
  // eslint-disable-next-line no-var
  var __buffaloQaRunning: boolean | undefined
}

/** Lo llama el planificador de retención cada minuto. */
export async function runDueQa(): Promise<void> {
  if (globalThis.__buffaloQaRunning) return
  globalThis.__buffaloQaRunning = true
  try {
    for (const row of await listFlow1Projects()) {
      const cfg = flow1Of(row)
      if (cfg.tickets) {
        await scanTickets(row.proyecto_id).catch((e) => console.warn('[retencion-qa] tickets', e instanceof Error ? e.message : e))
      }
      const due =
        !row.last_repo_scan_at || Date.now() - new Date(row.last_repo_scan_at).getTime() >= cfg.repo_every_minutes * 60_000
      if (cfg.repo && due) {
        await scanRepo(row.proyecto_id).catch(async (e) => {
          console.warn('[retencion-qa] repo', e instanceof Error ? e.message : e)
          await markRepoScan(row.proyecto_id, null).catch(() => undefined)
        })
      }
    }
  } finally {
    globalThis.__buffaloQaRunning = false
  }
}
