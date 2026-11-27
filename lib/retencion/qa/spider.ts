import { createHash } from 'crypto'
import { query } from '@/lib/db'
import { openRouterChatCompletion, resolveModel } from '@/lib/openrouter'
import { collectCrmKnowledge } from '@/lib/retencion/knowledge/collect-crm'
import { connectionForRow } from '@/lib/retencion/mcp/api'
import { callMcpTool, inspectMcp } from '@/lib/retencion/mcp/client'
import { listMcpServers } from '@/lib/retencion/mcp/store'
import { BRAIN_SYSTEM_PROMPT, extractJson, normalizeBrain } from './brain-format'
import { clip, makeRepoReader, selectRepoFiles, visibleTree } from './repo-reader'
import {
  addInbox,
  claimSpiderRun,
  finishSpider,
  getBrainRow,
  getRetellKey,
  listNormas,
  saveSpiderProgress,
} from './store'
import { computeProgress, initialPhases, type BrainPhase, type BrainPhaseId } from './types'

/**
 * La araña: recorre CRM, repositorio, MCP y Retell del proyecto y construye su cerebro.
 * Va guardando el progreso (0–100) por fases para que la pantalla lo enseñe en vivo.
 */

const REPO_BUDGET = 300_000
const MCP_CALL_CHARS = 8_000
const DISCOVERY = /(resumen|summary|estado|status|listar_agentes|agentes|ver_agente_voz|listar_docs|ver_guia|guia|herramientas|tools|descripcion)/i

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
    await saveSpiderProgress(this.proyectoId, computeProgress(this.phases, this.current, this.fraction), this.phases)
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Lanza el rastreo en segundo plano. Devuelve false si ya había uno en marcha. */
export async function startSpider(proyectoId: string): Promise<boolean> {
  const ok = await claimSpiderRun(proyectoId)
  if (!ok) return false
  void runSpider(proyectoId).catch(async (e) => {
    console.warn('[retencion-qa] rastreo', errMsg(e))
    await finishSpider(proyectoId, { ok: false, error: errMsg(e), phases: initialPhases() }).catch(() => undefined)
  })
  return true
}

async function runSpider(proyectoId: string): Promise<void> {
  const pr = new Progress(proyectoId)
  const row = await getBrainRow(proyectoId)
  const sources: string[] = []

  const proj = await query<{ name: string }>(`SELECT name FROM proyectos WHERE id = $1`, [proyectoId])
  const projectName = proj.rows[0]?.name || 'Proyecto'

  /* 1 · CRM */
  await pr.start('crm', 'Leyendo el proyecto en el CRM')
  try {
    const crm = await collectCrmKnowledge(proyectoId)
    sources.push(`### CRM (proyecto, cliente, onboarding, tickets)\n${clip(JSON.stringify(crm, null, 1), 25_000)}`)
    await pr.end('crm', 'done', `${crm.sources_ok.length} fuentes del CRM`)
  } catch (e) {
    await pr.end('crm', 'error', errMsg(e))
  }

  /* 2 · Repositorio */
  const repoSource = row.repo_source || (await defaultRepo(proyectoId))
  if (!repoSource) {
    await pr.end('repo', 'skipped', 'Sin repositorio')
  } else {
    await pr.start('repo', `Abriendo ${repoSource}`)
    try {
      const reader = await makeRepoReader(repoSource, row.repo_branch)
      const all = await reader.listFiles()
      const picked = selectRepoFiles(all)
      const parts: string[] = [`Árbol (${all.length} archivos):\n${visibleTree(all).join('\n')}`]
      let used = parts[0].length
      let read = 0
      for (let i = 0; i < picked.length && used < REPO_BUDGET; i++) {
        await pr.step(i / picked.length, `Leyendo ${picked[i]}`)
        const text = await reader.readFile(picked[i])
        if (!text) continue
        const block = `\n--- ${picked[i]} ---\n${text}`
        if (used + block.length > REPO_BUDGET) continue
        parts.push(block)
        used += block.length
        read++
      }
      sources.push(`### REPOSITORIO ${reader.label}\n${parts.join('\n')}`)
      await pr.end('repo', 'done', `${read} archivos leídos de ${all.length}`)
    } catch (e) {
      await pr.end('repo', 'error', errMsg(e))
    }
  }

  /* 3 · MCP */
  const servers = (await listMcpServers(proyectoId)).filter((s) => s.estado === 'conectado')
  if (!servers.length) {
    await pr.end('mcp', 'skipped', 'Sin conectores MCP conectados')
  } else {
    await pr.start('mcp', `Conectando con ${servers.length} MCP`)
    const parts: string[] = []
    let calls = 0
    for (let i = 0; i < servers.length; i++) {
      const s = servers[i]
      try {
        await pr.step(i / servers.length, `Listando herramientas de ${s.nombre}`)
        const conn = connectionForRow(s)
        const info = await inspectMcp(conn)
        parts.push(
          `MCP «${s.nombre}» (${info.serverName || s.url}) · herramientas:\n` +
            info.tools.map((t) => `- ${t.name}: ${(t.description || '').slice(0, 300)}`).join('\n')
        )
        const discovery = info.tools
          .filter((t) => DISCOVERY.test(t.name))
          .filter((t) => {
            const req = (t.inputSchema as { required?: unknown } | undefined)?.required
            return !Array.isArray(req) || req.length === 0
          })
          .slice(0, 5)
        for (const t of discovery) {
          await pr.step((i + 0.5) / servers.length, `${s.nombre} · ${t.name}`)
          const r = await callMcpTool(conn, t.name, {})
          if (r.ok) {
            parts.push(`MCP «${s.nombre}» · ${t.name}():\n${clip(r.resultado, MCP_CALL_CHARS)}`)
            calls++
          }
        }
      } catch (e) {
        parts.push(`MCP «${s.nombre}»: no se pudo leer (${errMsg(e)})`)
      }
    }
    sources.push(`### MCP\n${parts.join('\n\n')}`)
    await pr.end('mcp', 'done', `${servers.length} MCP · ${calls} consultas`)
  }

  /* 4 · Retell */
  const retellKey = await getRetellKey(proyectoId).catch(() => null)
  if (!retellKey) {
    await pr.end('retell', 'skipped', 'Sin clave de Retell')
  } else {
    await pr.start('retell', 'Leyendo agentes de voz')
    try {
      const text = await readRetell(retellKey, (f, d) => pr.step(f, d))
      sources.push(`### RETELL\n${text.body}`)
      await pr.end('retell', 'done', `${text.agents} agentes de voz`)
    } catch (e) {
      await pr.end('retell', 'error', errMsg(e))
    }
  }

  /* 5 · Cerebro (IA) */
  await pr.start('ia', 'Construyendo el cerebro')
  const normas = await listNormas(proyectoId)
  const activas = normas.filter((n) => n.estado === 'activa')
  const userMsg = [
    `Proyecto: ${projectName}`,
    activas.length
      ? `Normas que YA existen (no las repitas):\n${activas.map((n) => `- ${n.code}: ${n.regla}`).join('\n')}`
      : 'Todavía no hay normas registradas.',
    ...sources,
  ].join('\n\n')

  let creep: ReturnType<typeof setInterval> | null = setInterval(() => {
    void pr.step(pr.fraction + (0.92 - pr.fraction) * 0.12, 'La IA está estructurando el sistema')
  }, 2500)
  try {
    const out = await openRouterChatCompletion(
      [
        { role: 'system', content: BRAIN_SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      { model: process.env.QA_BRAIN_MODEL || resolveModel('heavy'), json: true, maxTokens: 12_000, temperature: 0.2 }
    )
    clearInterval(creep)
    creep = null
    const brain = normalizeBrain(extractJson(out))
    await pr.step(0.95, 'Guardando normas propuestas')
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
    await pr.end('ia', 'done', `${brain.entradas.length} entradas · ${brain.agentes.length} agentes · ${nuevas} normas propuestas`)
    await finishSpider(proyectoId, { ok: true, brain, phases: pr.phases })
  } catch (e) {
    if (creep) clearInterval(creep)
    await pr.end('ia', 'error', errMsg(e))
    await finishSpider(proyectoId, { ok: false, error: `La IA no pudo construir el cerebro: ${errMsg(e)}`, phases: pr.phases })
  }
}

/** Repositorio apuntado en Gestión de proyecto, si lo hay. */
export async function defaultRepo(proyectoId: string): Promise<string | null> {
  try {
    const { rows } = await query<{ repo_url: string | null }>(
      `SELECT repo_url FROM project_dev_onboarding WHERE project_id = $1`,
      [proyectoId]
    )
    return rows[0]?.repo_url?.trim() || null
  } catch {
    return null
  }
}

type RetellAgent = {
  agent_id: string
  agent_name?: string
  voice_id?: string
  language?: string
  response_engine?: { type?: string; llm_id?: string; conversation_flow_id?: string }
  webhook_url?: string
}

async function readRetell(
  key: string,
  onStep: (fraction: number, detail: string) => Promise<void>
): Promise<{ body: string; agents: number }> {
  const get = async <T>(p: string): Promise<T> => {
    const res = await fetch(`https://api.retellai.com${p}`, { headers: { Authorization: `Bearer ${key}` } })
    if (!res.ok) throw new Error(`Retell ${res.status}: ${(await res.text()).slice(0, 200)}`)
    return (await res.json()) as T
  }
  const list = await get<RetellAgent[]>('/list-agents')
  // La API devuelve una fila por versión: nos quedamos con la última de cada agente.
  const byId: Record<string, RetellAgent> = {}
  for (const a of list) byId[a.agent_id] = a
  const agents = Object.keys(byId).map((k) => byId[k]).slice(0, 12)
  const parts: string[] = []
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i]
    await onStep(i / agents.length, `Agente ${a.agent_name || a.agent_id}`)
    const head = `Agente «${a.agent_name || a.agent_id}» · voz ${a.voice_id || '?'} · idioma ${a.language || '?'} · motor ${a.response_engine?.type || '?'}${
      a.webhook_url ? ` · webhook ${hostOf(a.webhook_url)}` : ''
    }`
    if (a.response_engine?.type === 'retell-llm' && a.response_engine.llm_id) {
      try {
        const llm = await get<{
          model?: string
          general_prompt?: string
          begin_message?: string
          general_tools?: { name?: string; type?: string; description?: string; url?: string }[]
        }>(`/get-retell-llm/${encodeURIComponent(a.response_engine.llm_id)}`)
        const tools = (llm.general_tools || [])
          .map((t) => `- ${t.name} (${t.type}${t.url ? ` → ${hostOf(t.url)}` : ''}): ${(t.description || '').slice(0, 200)}`)
          .join('\n')
        parts.push(
          `${head} · modelo ${llm.model || '?'}\nSaludo: ${llm.begin_message || ''}\nHerramientas:\n${tools}\nPrompt:\n${clip(llm.general_prompt || '', 12_000)}`
        )
        continue
      } catch (e) {
        parts.push(`${head}\n(no se pudo leer su LLM: ${errMsg(e)})`)
        continue
      }
    }
    parts.push(head)
  }
  return { body: parts.join('\n\n'), agents: agents.length }
}

function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname}`
  } catch {
    return 'url'
  }
}
