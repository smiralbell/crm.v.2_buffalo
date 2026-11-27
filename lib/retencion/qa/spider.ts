import { createHash } from 'crypto'
import { query } from '@/lib/db'
import { collectCrmKnowledge } from '@/lib/retencion/knowledge/collect-crm'
import { connectionForRow } from '@/lib/retencion/mcp/api'
import { callMcpTool, inspectMcp } from '@/lib/retencion/mcp/client'
import { listMcpServers } from '@/lib/retencion/mcp/store'
import {
  EXTRACT_SYSTEM_PROMPT,
  SYNTH_SYSTEM_PROMPT,
  buildBrain,
  chunkSources,
  extractJson,
  mergeFacts,
  normalizeFacts,
  synthInput,
  type SourceBlock,
} from './brain-format'
import { charsToTokens, estimateCost, modelPricing, qaChat, qaModel, type ChatUsage } from './llm'
import { makeRepoReader, mapLimit, selectRepoFiles, visibleTree } from './repo-reader'
import {
  addInbox,
  claimSpiderRun,
  finishSpider,
  getBrainRow,
  listNormas,
  markSpiderStopped,
  saveSpiderProgress,
  type BrainDoc,
} from './store'
import { computeProgress, initialPhases, type BrainEstimate, type BrainFacts, type BrainPhase, type BrainPhaseId, type BrainUsage } from './types'

/**
 * La araña: recorre CRM, repositorio y MCP del proyecto, lee TODO por trozos con un
 * modelo barato y construye el cerebro sin perder detalle. Guarda el progreso (0–100)
 * por fases y el coste real de la IA.
 */

/** Trozo de fuentes por llamada (~40.000 tokens): cabe de sobra y no se pierde nada. */
export const CHUNK_CHARS = 140_000
/** Tope de lectura del repositorio: cubre de sobra un proyecto como PREICO entero. */
const REPO_MAX_CHARS = 2_500_000
const EXTRACT_PARALLEL = 3
const MCP_CALL_CHARS = 40_000
const MCP_MAX_CALLS = 30
/** Primera pasada: herramientas de descripción del sistema que no piden argumentos. */
const DISCOVERY = /(resumen|summary|estado|status|listar_agentes|agentes|ver_agente_voz|listar_docs|ver_guia|guia|herramientas|tools|descripcion)/i
/** Segunda pasada (con un argumento): solo herramientas de configuración, nunca de clientes. */
const DETAIL_TOOLS = /(agente|agent|prompt|herramient|tool|descripcion|guia|voz)/i
const PERSONAL = /(lead|conversaci|llamada|call|ticket|cliente|contact|correo|email|cita|buscar|search|log)/i

/** Se lanza cuando se pide parar el rastreo; nunca se trata como un error. */
export class SpiderStopped extends Error {
  constructor(public phases: BrainPhase[]) {
    super('Rastreo parado')
  }
}

/** En los `catch` de cada fase: una parada se deja pasar hacia arriba. */
function rethrowStop(e: unknown): void {
  if (e instanceof SpiderStopped) throw e
}

class Progress {
  phases: BrainPhase[] = initialPhases()
  current: BrainPhaseId | null = null
  fraction = 0
  private last = 0
  constructor(private proyectoId: string) {}

  async start(id: BrainPhaseId, detail: string) {
    this.current = id
    this.fraction = 0
    this.set(id, { status: 'running', detail })
    await this.flush(true)
  }
  async step(fraction: number, detail?: string) {
    this.fraction = fraction
    if (detail && this.current) this.set(this.current, { detail })
    await this.flush(false)
  }
  async end(id: BrainPhaseId, status: 'done' | 'skipped' | 'error', detail: string) {
    this.set(id, { status, detail })
    if (this.current === id) this.current = null
    await this.flush(true)
  }
  private set(id: BrainPhaseId, patch: Partial<BrainPhase>) {
    this.phases = this.phases.map((p) => (p.id === id ? { ...p, ...patch } : p))
  }
  async flush(force: boolean) {
    const now = Date.now()
    if (!force && now - this.last < 700) return
    this.last = now
    const stop = await saveSpiderProgress(this.proyectoId, computeProgress(this.phases, this.current, this.fraction), this.phases)
    if (stop) {
      if (this.current) this.set(this.current, { status: 'error', detail: 'Parado' })
      throw new SpiderStopped(this.phases)
    }
  }
}

class UsageMeter {
  u: BrainUsage
  constructor(model: string) {
    this.u = { model, tokens_in: 0, tokens_out: 0, cost_usd: 0, calls: 0 }
  }
  add(x: ChatUsage) {
    this.u.tokens_in += x.tokens_in
    this.u.tokens_out += x.tokens_out
    this.u.calls++
    this.u.cost_usd = this.u.cost_usd == null || x.cost_usd == null ? null : this.u.cost_usd + x.cost_usd
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Lanza el rastreo en segundo plano. Devuelve false si ya había uno en marcha. */
export async function startSpider(proyectoId: string): Promise<boolean> {
  const ok = await claimSpiderRun(proyectoId)
  if (!ok) return false
  void runSpider(proyectoId).catch(async (e) => {
    if (e instanceof SpiderStopped) {
      await markSpiderStopped(proyectoId, e.phases).catch(() => undefined)
      return
    }
    console.warn('[retencion-qa] rastreo', errMsg(e))
    await finishSpider(proyectoId, { ok: false, error: errMsg(e), phases: initialPhases() }).catch(() => undefined)
  })
  return true
}

/** Repositorio apuntado en Gestión de proyecto, si lo hay. */
export async function defaultRepo(proyectoId: string): Promise<string | null> {
  try {
    const { rows } = await query<{ repo_url: string | null }>(`SELECT repo_url FROM project_dev_onboarding WHERE project_id = $1`, [proyectoId])
    return rows[0]?.repo_url?.trim() || null
  } catch {
    return null
  }
}

/* ───────────── fuentes ───────────── */

type Collected = { blocks: SourceBlock[]; docs: BrainDoc[] }

async function collectRepo(
  source: string,
  branch: string | null,
  onStep: (fraction: number, detail: string) => Promise<void>
): Promise<Collected & { read: number; total: number; label: string }> {
  const reader = await makeRepoReader(source, branch)
  const all = await reader.listFiles()
  const picked: typeof all = []
  let budget = 0
  for (const f of selectRepoFiles(all)) {
    if (budget + f.size > REPO_MAX_CHARS) continue
    picked.push(f)
    budget += f.size
  }
  const tree = visibleTree(all.map((f) => f.path)).join('\n')
  const blocks: SourceBlock[] = [{ label: `${reader.label} · árbol de archivos`, text: tree }]
  const docs: BrainDoc[] = []
  let done = 0
  const texts = await mapLimit(picked, 8, async (f) => {
    const text = await reader.readFile(f.path)
    done++
    await onStep(done / Math.max(1, picked.length), `Leyendo ${f.path}`)
    return text
  })
  picked.forEach((f, i) => {
    const text = texts[i]
    if (!text) return
    blocks.push({ label: `${reader.label}/${f.path}`, text })
    docs.push({ fuente: 'repositorio', ruta: f.path, contenido: text })
  })
  return { blocks, docs, read: docs.length, total: all.length, label: reader.label }
}

/** Valores para el único argumento de una herramienta, sacados de lo que ya devolvieron otras. */
export function argCandidates(param: string, outputs: string[], max = 15): string[] {
  const keys = [param, `${param}_id`, 'id', 'nombre', 'name', 'agent_id']
  const found: string[] = []
  for (const out of outputs) {
    for (const k of keys) {
      const re = new RegExp(`"${k}"\\s*:\\s*"([^"\\n]{1,120})"`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(out)) && found.length < max) {
        if (!found.includes(m[1])) found.push(m[1])
      }
    }
  }
  return found.slice(0, max)
}

async function collectMcp(
  proyectoId: string,
  onStep: (fraction: number, detail: string) => Promise<void>
): Promise<(Collected & { servers: number; calls: number }) | null> {
  const servers = (await listMcpServers(proyectoId)).filter((s) => s.estado === 'conectado')
  if (!servers.length) return null
  const blocks: SourceBlock[] = []
  const docs: BrainDoc[] = []
  let calls = 0
  for (let i = 0; i < servers.length; i++) {
    const s = servers[i]
    const conn = connectionForRow(s)
    try {
      await onStep(i / servers.length, `Listando herramientas de ${s.nombre}`)
      const info = await inspectMcp(conn)
      const listing = info.tools.map((t) => `- ${t.name}: ${t.description || ''}`).join('\n')
      blocks.push({ label: `MCP ${s.nombre} · herramientas`, text: listing })
      docs.push({ fuente: 'mcp', ruta: `${s.nombre} · herramientas`, contenido: listing })

      const required = (t: (typeof info.tools)[number]) => {
        const r = (t.inputSchema as { required?: unknown } | undefined)?.required
        return Array.isArray(r) ? (r as string[]) : []
      }
      const outputs: string[] = []
      const run = async (name: string, args: Record<string, unknown>) => {
        if (calls >= MCP_MAX_CALLS * (i + 1)) return
        const label = `${name}(${Object.values(args).join(', ')})`
        await onStep((i + 0.5) / servers.length, `${s.nombre} · ${label}`)
        const r = await callMcpTool(conn, name, args)
        calls++
        if (!r.ok || r.esError) return
        const text = r.resultado.slice(0, MCP_CALL_CHARS)
        outputs.push(text)
        blocks.push({ label: `MCP ${s.nombre} · ${label}`, text })
        docs.push({ fuente: 'mcp', ruta: `${s.nombre} · ${label}`, contenido: text })
      }
      // 1) Descripción del sistema sin argumentos.
      for (const t of info.tools.filter((t) => DISCOVERY.test(t.name) && !PERSONAL.test(t.name) && required(t).length === 0).slice(0, 8)) {
        await run(t.name, {})
      }
      // 2) Detalle de cada agente, prompt o herramienta, con los identificadores de la primera pasada.
      for (const t of info.tools.filter((t) => DETAIL_TOOLS.test(t.name) && !PERSONAL.test(t.name) && required(t).length === 1)) {
        const param = required(t)[0]
        for (const v of argCandidates(param, outputs)) await run(t.name, { [param]: v })
      }
    } catch (e) {
      rethrowStop(e)
      blocks.push({ label: `MCP ${s.nombre}`, text: `No se pudo leer: ${errMsg(e)}` })
    }
  }
  return { blocks, docs, servers: servers.length, calls }
}

/* ───────────── rastreo ───────────── */

async function runSpider(proyectoId: string): Promise<void> {
  const pr = new Progress(proyectoId)
  const model = qaModel()
  const meter = new UsageMeter(model)
  const row = await getBrainRow(proyectoId)
  const blocks: SourceBlock[] = []
  const docs: BrainDoc[] = []

  const proj = await query<{ name: string }>(`SELECT name FROM proyectos WHERE id = $1`, [proyectoId])
  const projectName = proj.rows[0]?.name || 'Proyecto'

  /* 1 · CRM */
  await pr.start('crm', 'Leyendo el proyecto en el CRM')
  try {
    const crm = JSON.stringify(await collectCrmKnowledge(proyectoId), null, 1)
    blocks.push({ label: 'CRM · proyecto, cliente, onboarding, tareas y tickets', text: crm })
    docs.push({ fuente: 'crm', ruta: 'proyecto', contenido: crm })
    await pr.end('crm', 'done', 'Proyecto, cliente, onboarding y tickets')
  } catch (e) {
    rethrowStop(e)
    await pr.end('crm', 'error', errMsg(e))
  }

  /* 2 · Repositorio */
  const repoSource = row.repo_source || (await defaultRepo(proyectoId))
  if (!repoSource) {
    await pr.end('repo', 'skipped', 'Sin repositorio')
  } else {
    await pr.start('repo', `Abriendo ${repoSource}`)
    try {
      const r = await collectRepo(repoSource, row.repo_branch, (f, d) => pr.step(f, d))
      blocks.push(...r.blocks)
      docs.push(...r.docs)
      await pr.end('repo', 'done', `${r.read} archivos leídos de ${r.total}`)
    } catch (e) {
      rethrowStop(e)
      await pr.end('repo', 'error', errMsg(e))
    }
  }

  /* 3 · MCP */
  await pr.start('mcp', 'Conectando con los MCP')
  try {
    const m = await collectMcp(proyectoId, (f, d) => pr.step(f, d))
    if (!m) await pr.end('mcp', 'skipped', 'Sin conectores MCP conectados')
    else {
      blocks.push(...m.blocks)
      docs.push(...m.docs)
      await pr.end('mcp', 'done', `${m.servers} MCP · ${m.calls} consultas`)
    }
  } catch (e) {
    rethrowStop(e)
    await pr.end('mcp', 'error', errMsg(e))
  }

  /* 4 · IA: extraer por trozos y juntar */
  const chunks = chunkSources(blocks, CHUNK_CHARS)
  await pr.start('ia', `Leyendo ${chunks.length} trozos con ${model}`)
  try {
    if (!chunks.length) throw new Error('No hay nada que leer: conecta un repositorio o un MCP.')
    let done = 0
    const failed: number[] = []
    const factsList = await mapLimit(chunks, EXTRACT_PARALLEL, async (chunk, i): Promise<BrainFacts | null> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const out = await qaChat(
            [
              { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
              { role: 'user', content: `Proyecto: ${projectName}\nTrozo ${i + 1} de ${chunks.length}\n\n${chunk}` },
            ],
            { json: true, maxTokens: 16_000 }
          )
          meter.add(out.usage)
          const facts = normalizeFacts(extractJson(out.text))
          done++
          await pr.step((done / chunks.length) * 0.85, `Trozo ${done} de ${chunks.length} · ${facts.normas_propuestas.length} normas`)
          return facts
        } catch (e) {
          rethrowStop(e)
          if (attempt === 1) {
            console.warn('[retencion-qa] trozo', i + 1, errMsg(e))
            failed.push(i + 1)
          }
        }
      }
      return null
    })
    const ok = factsList.filter((f): f is BrainFacts => Boolean(f))
    if (!ok.length) throw new Error('La IA no pudo leer ningún trozo')
    const facts = mergeFacts(ok)

    await pr.step(0.9, 'Juntando y escribiendo el resumen')
    const normas = (await listNormas(proyectoId)).filter((n) => n.estado === 'activa')
    const synth = await qaChat(
      [
        { role: 'system', content: SYNTH_SYSTEM_PROMPT },
        { role: 'user', content: synthInput(projectName, facts, normas.map((n) => `- ${n.code}: ${n.regla}`)) },
      ],
      { json: true, maxTokens: 16_000 }
    )
    meter.add(synth.usage)
    let synthJson: unknown = {}
    try {
      synthJson = extractJson(synth.text)
    } catch {
      // Sin el paso de juntar, el cerebro sigue completo: solo falta el resumen.
    }
    const brain = buildBrain(facts, synthJson)
    if (failed.length) brain.huecos.unshift(`No se pudieron leer los trozos ${failed.join(', ')} de ${chunks.length}: vuelve a rastrear.`)

    await pr.step(0.97, 'Guardando normas propuestas')
    let nuevas = 0
    for (const n of brain.normas_propuestas) {
      const ref = createHash('sha1').update(n.regla.toLowerCase().replace(/\s+/g, ' ')).digest('hex').slice(0, 16)
      const added = await addInbox(proyectoId, {
        origen: 'cerebro',
        origen_ref: ref,
        titulo: n.regla.slice(0, 140),
        texto: `Detectada por el cerebro en ${n.origen || 'las fuentes del proyecto'}.`,
        propuesta: {
          accion: 'nueva',
          regla: n.regla,
          area: n.area,
          canal: n.canal,
          gravedad: n.gravedad,
          motivo: n.origen ? `Fuente: ${n.origen}` : 'Deducida de las fuentes',
          norma: null,
          conflicto: null,
        },
      })
      if (added) nuevas++
    }
    await pr.end('ia', 'done', `${chunks.length} trozos · ${brain.entradas.length} entradas · ${nuevas} normas nuevas`)
    await finishSpider(proyectoId, { ok: true, brain, facts, phases: pr.phases, usage: meter.u, docs })
  } catch (e) {
    rethrowStop(e)
    await pr.end('ia', 'error', errMsg(e))
    await finishSpider(proyectoId, { ok: false, error: `La IA no pudo construir el cerebro: ${errMsg(e)}`, phases: pr.phases, usage: meter.u })
  }
}

/* ───────────── estimación ───────────── */

/**
 * Coste aproximado de un rastreo antes de lanzarlo: tamaño de lo que se leerá del
 * repositorio (sin leerlo), un margen para CRM y MCP, y el precio del modelo.
 */
export async function estimateSpider(proyectoId: string): Promise<BrainEstimate> {
  const row = await getBrainRow(proyectoId)
  const model = qaModel()
  let chars = 30_000 // CRM
  let files = 0
  const source = row.repo_source || (await defaultRepo(proyectoId))
  if (source) {
    try {
      const reader = await makeRepoReader(source, row.repo_branch)
      const all = await reader.listFiles()
      let budget = 0
      for (const f of selectRepoFiles(all)) {
        if (budget + f.size > REPO_MAX_CHARS) continue
        budget += f.size
        files++
      }
      chars += budget + all.length * 40
    } catch {
      // Sin acceso al repositorio todavía: se estima sin él.
    }
  }
  const mcp = (await listMcpServers(proyectoId)).filter((s) => s.estado === 'conectado').length
  chars += mcp * 120_000
  const chunks = Math.max(1, Math.ceil(chars / CHUNK_CHARS))
  const tokensIn = charsToTokens(chars) + chunks * 1_200 + 12_000
  const tokensOut = chunks * 5_000 + 6_000
  return {
    model,
    chars,
    files,
    chunks,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: estimateCost(await modelPricing(model), tokensIn, tokensOut),
  }
}
