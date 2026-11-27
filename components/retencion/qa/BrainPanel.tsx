import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Brain as BrainIcon,
  Building2,
  Check,
  ChevronDown,
  FileText,
  GitBranch,
  Loader2,
  Lock,
  Play,
  Plug,
  Radar,
  RotateCw,
  Save,
  Square,
  X,
} from 'lucide-react'
import ws from '@/components/retencion/WatchSystemMap.module.css'
import s from './qa.module.css'
import { FanWire, FlowNode, LineWire, ProgressRing, timeAgo, type NodeState } from './FlowBits'
import type { Brain, BrainEstimate, BrainPhase, BrainPhaseId, BrainPublic, GithubRepo } from '@/lib/retencion/qa/types'

export type BrainSources = {
  repo_default: string | null
  mcp_connected: string[]
  mcp_total: number
  local_repos: boolean
  github: boolean
}

export type BrainData = { brain: BrainPublic; sources: BrainSources }
export type BrainSheet = 'crm' | 'repo' | 'mcp' | 'arana' | 'cerebro' | null

const PHASE_LABEL: Record<BrainPhaseId, string> = { crm: 'CRM', repo: 'Repositorio', mcp: 'MCP', ia: 'Cerebro' }

export function usd(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v < 0.01 ? v.toFixed(4) : v.toFixed(2)} $`.replace('.', ',')
}

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n))

function stateOf(p: BrainPhase | undefined): NodeState {
  if (!p) return 'idle'
  if (p.status === 'running') return 'running'
  if (p.status === 'done') return 'done'
  if (p.status === 'error') return 'error'
  if (p.status === 'skipped') return 'dim'
  return 'idle'
}

export default function BrainPanel({
  proyectoId,
  data,
  isAdmin,
  sheet,
  onSheet,
  onStart,
  onStop,
  onSaved,
  onGoMcp,
  onGoInbox,
  onTutorial,
}: {
  proyectoId: string
  data: BrainData | null
  isAdmin: boolean
  sheet: BrainSheet
  onSheet: (s: BrainSheet) => void
  onStart: () => Promise<void>
  onStop: () => Promise<void>
  onSaved: (d: BrainData) => void
  onGoMcp: () => void
  onGoInbox: () => void
  onTutorial: () => void
}) {
  const b = data?.brain
  const running = b?.status === 'running'
  const phase = (id: BrainPhaseId) => b?.phases.find((p) => p.id === id)
  const current = b?.phases.find((p) => p.status === 'running')
  const brain = b?.brain

  const [repo, setRepo] = useState('')
  const [branch, setBranch] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)
  const [estimate, setEstimate] = useState<BrainEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)

  useEffect(() => {
    setRepo(b?.repo_source || data?.sources.repo_default || '')
    setBranch(b?.repo_branch || '')
    // Solo al cambiar de proyecto o al cargar por primera vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, Boolean(data)])

  useEffect(() => {
    setMsg('')
    setErr('')
    if (sheet === 'arana' && !running) {
      setEstimating(true)
      fetch(`/api/retencion/proyectos/${proyectoId}/cerebro?estimate=1`)
        .then(async (r) => (r.ok ? ((await r.json()) as { estimate: BrainEstimate }).estimate : null))
        .then(setEstimate)
        .catch(() => setEstimate(null))
        .finally(() => setEstimating(false))
    }
  }, [sheet, proyectoId, running, b?.repo_source])

  const patch = async (body: Record<string, unknown>) => {
    setSaving(true)
    setErr('')
    setMsg('')
    try {
      const res = await fetch(`/api/retencion/proyectos/${proyectoId}/cerebro`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'No se pudo guardar')
      onSaved(d as BrainData)
      setMsg('Guardado')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  const start = async () => {
    setStarting(true)
    setErr('')
    try {
      await onStart()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setStarting(false)
    }
  }

  const repoNow = b?.repo_source || data?.sources.repo_default
  const repoSub =
    phase('repo')?.status === 'pending' || !phase('repo')?.detail ? (repoNow ? repoNow.replace(/^https?:\/\/github\.com\//, '') : 'Elige uno') : phase('repo')!.detail
  const mcpSub =
    phase('mcp')?.detail && phase('mcp')?.status !== 'pending' ? phase('mcp')!.detail : `${data?.sources.mcp_connected.length ?? 0} conectados`

  const progress = b?.progress ?? 0

  return (
    <div className={`${s.canvas} rounded-[28px]`}>
      {running && (
        <div className={s.track}>
          <div className={s.trackFill} style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className={s.topbar}>
        <span className={s.pill}>
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Rastreando · {progress}%
            </>
          ) : brain ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Cerebro v{b?.version} · {timeAgo(b?.finished_at ?? null)}
              {b?.usage && <span className="text-gray-400">· {usd(b.usage.cost_usd)}</span>}
            </>
          ) : b?.status === 'stopped' ? (
            <>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Rastreo parado{brain ? ` · sigue el cerebro v${b.version}` : ''}
            </>
          ) : b?.status === 'error' ? (
            <>
              <span className="h-2 w-2 rounded-full bg-red-500" />
              El último rastreo falló
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-gray-300" />
              Sin cerebro todavía
            </>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" className={s.btn} onClick={onTutorial}>
            Tutorial
          </button>
          {isAdmin && running && (
            <button type="button" className={s.btn} onClick={() => void onStop()}>
              <Square className="h-3 w-3" />
              Parar
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              data-tour="lanzar"
              className={`${s.btn} ${s.btnDark}`}
              onClick={() => (brain ? void start() : onSheet('arana'))}
              disabled={running || starting}
            >
              {running || starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : brain ? <RotateCw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {running ? `Rastreando · ${progress}%` : brain ? 'Volver a rastrear' : 'Lanzar rastreo'}
            </button>
          )}
        </div>
      </div>

      <div className={s.scroll}>
        <div className={s.map}>
          <div className={s.col} data-tour="fuentes">
            <FlowNode icon={Building2} title="CRM" sub={phase('crm')?.detail || 'Automático'} state={stateOf(phase('crm'))} selected={sheet === 'crm'} onClick={() => onSheet(sheet === 'crm' ? null : 'crm')} />
            <FlowNode icon={GitBranch} title="Repositorio" sub={repoSub} state={stateOf(phase('repo'))} selected={sheet === 'repo'} onClick={() => onSheet(sheet === 'repo' ? null : 'repo')} tour="repo" />
            <FlowNode icon={Plug} title="MCP" sub={mcpSub} state={stateOf(phase('mcp'))} selected={sheet === 'mcp'} onClick={() => onSheet(sheet === 'mcp' ? null : 'mcp')} />
          </div>
          <FanWire count={3} lit={(['crm', 'repo', 'mcp'] as BrainPhaseId[]).map((id) => phase(id)?.status === 'done')} />
          <FlowNode
            icon={Radar}
            title="Araña"
            sub={running ? (current ? PHASE_LABEL[current.id] : 'Preparando') : b?.status === 'error' ? 'Con error' : 'Rastreador'}
            state={running ? 'running' : b?.status === 'error' ? 'error' : brain ? 'done' : 'idle'}
            selected={sheet === 'arana'}
            big
            onClick={() => onSheet(sheet === 'arana' ? null : 'arana')}
          >
            {running || brain ? <ProgressRing value={running ? progress : 100} done={!running} /> : undefined}
          </FlowNode>
          <LineWire lit={Boolean(brain) && !running} />
          <FlowNode
            icon={BrainIcon}
            title="Cerebro"
            sub={brain ? `${brain.entradas.length} entradas · ${brain.agentes.length} agentes` : 'Pendiente'}
            state={running ? 'idle' : brain ? 'done' : 'dim'}
            selected={sheet === 'cerebro'}
            onClick={() => onSheet(sheet === 'cerebro' ? null : 'cerebro')}
            tour="cerebro"
          />
        </div>
      </div>

      {running && current && (
        <div className={s.footer}>
          <span className={s.pill}>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
            <span className="max-w-[60vw] truncate">{current.detail || PHASE_LABEL[current.id]}</span>
          </span>
        </div>
      )}

      {sheet && (
        <aside className={`${ws.sheet} ${sheet === 'cerebro' ? ws.sheetWide : ''}`} data-sheet>
          <div className={ws.sheetHead}>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">
                {sheet === 'cerebro' ? `Versión ${b?.version ?? 0}` : sheet === 'arana' ? 'Rastreador' : 'Fuente'}
              </p>
              <h3 className="mt-0.5 text-lg font-semibold text-gray-900">
                {{ crm: 'CRM', repo: 'Repositorio', mcp: 'MCP', arana: 'Araña', cerebro: 'Cerebro' }[sheet]}
              </h3>
            </div>
            <button type="button" className={ws.hudBtn} onClick={() => onSheet(null)} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={ws.sheetBody}>
            {sheet === 'crm' && (
              <p className="text-sm text-gray-600">Proyecto, cliente, producto contratado, onboarding, tareas y tickets. Se lee solo en cada rastreo.</p>
            )}

            {sheet === 'repo' && (
              <RepoPicker
                sources={data?.sources}
                isAdmin={isAdmin}
                repo={repo}
                branch={branch}
                saving={saving}
                onRepo={setRepo}
                onBranch={setBranch}
                onSave={() => void patch({ repo_source: repo, repo_branch: branch })}
              />
            )}

            {sheet === 'mcp' && (
              <>
                <p className="text-sm text-gray-600">
                  Los conectores de la pestaña MCP. La araña lee sus herramientas y consulta las que describen el sistema: agentes, prompts, voz y documentación. Nunca lee datos de clientes.
                </p>
                {data?.sources.mcp_connected.length ? (
                  <div className={s.list}>
                    {data.sources.mcp_connected.map((n) => (
                      <div key={n} className={s.li}>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          {n}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Ninguno conectado.</p>
                )}
                <button type="button" className={ws.hudBtn} onClick={onGoMcp}>
                  Abrir MCP
                </button>
              </>
            )}

            {sheet === 'arana' && (
              <>
                {!running && (
                  <div className="rounded-[20px] bg-gray-50 px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">Coste estimado</p>
                    {estimating ? (
                      <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando…
                      </p>
                    ) : estimate ? (
                      <>
                        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-gray-900">≈ {usd(estimate.cost_usd)}</p>
                        <p className="text-[13px] text-gray-500">
                          {estimate.files} archivos · {estimate.chunks} trozos · {k(estimate.tokens_in)} tokens · {estimate.model}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-gray-500">No se pudo calcular.</p>
                    )}
                  </div>
                )}
                {b?.usage && (
                  <p className="text-[13px] text-gray-500">
                    Último rastreo: <b className="text-gray-800">{usd(b.usage.cost_usd)}</b> · {k(b.usage.tokens_in + b.usage.tokens_out)} tokens · {b.usage.calls} llamadas · {b.usage.model}
                  </p>
                )}
                <div className={s.list}>
                  {(b?.phases || []).map((p) => (
                    <div key={p.id} className={s.li}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{PHASE_LABEL[p.id] || p.id}</span>
                        <span className={`${s.tag} ${p.status === 'done' ? s.tagGreen : p.status === 'error' ? s.tagRed : p.status === 'running' ? s.tagAmber : ''}`}>
                          {{ pending: 'Pendiente', running: 'En curso', done: 'Hecho', skipped: 'Saltado', error: 'Error' }[p.status]}
                        </span>
                      </span>
                      {p.detail && <span className={s.liSub}>{p.detail}</span>}
                    </div>
                  ))}
                </div>
                {b?.error && <p className="text-sm text-red-700">{b.error}</p>}
                {isAdmin &&
                  (running ? (
                    <button
                      type="button"
                      onClick={() => void onStop()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900"
                    >
                      <Square className="h-3.5 w-3.5" />
                      Parar el rastreo · {progress}%
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => void start()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      {brain ? 'Volver a rastrear' : 'Lanzar rastreo'}
                    </button>
                  ))}
                {b?.status === 'stopped' && <p className="text-[13px] text-amber-700">Lo paraste. El cerebro anterior sigue como estaba.</p>}
              </>
            )}

            {sheet === 'cerebro' &&
              (brain ? (
                <BrainView proyectoId={proyectoId} brain={brain} docsCount={b?.docs_count ?? 0} onGoInbox={onGoInbox} />
              ) : (
                <p className="text-sm text-gray-500">Lanza el rastreo para construirlo.</p>
              ))}

            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
            {err && <p className="text-sm text-red-700">{err}</p>}
          </div>
        </aside>
      )}
    </div>
  )
}

/* ───────────── Repositorio: desplegable de GitHub ───────────── */

function RepoPicker({
  sources,
  isAdmin,
  repo,
  branch,
  saving,
  onRepo,
  onBranch,
  onSave,
}: {
  sources: BrainSources | undefined
  isAdmin: boolean
  repo: string
  branch: string
  saving: boolean
  onRepo: (v: string) => void
  onBranch: (v: string) => void
  onSave: () => void
}) {
  const [repos, setRepos] = useState<GithubRepo[] | null>(null)
  const [branches, setBranches] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const [manual, setManual] = useState(false)
  const github = Boolean(sources?.github)
  const selected = repo.replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '')

  useEffect(() => {
    if (!github || !isAdmin) return
    fetch('/api/retencion/github')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Error con GitHub')
        setRepos(d.repos as GithubRepo[])
      })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : 'Error con GitHub'))
  }, [github, isAdmin])

  useEffect(() => {
    if (!github || !selected.includes('/') || !repos?.some((r) => r.full_name === selected)) {
      setBranches([])
      return
    }
    fetch(`/api/retencion/github?repo=${encodeURIComponent(selected)}`)
      .then(async (r) => (r.ok ? ((await r.json()) as { branches: string[] }).branches : []))
      .then(setBranches)
      .catch(() => setBranches([]))
  }, [github, selected, repos])

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return (repos || []).filter((r) => !q || r.full_name.toLowerCase().includes(q)).slice(0, 60)
  }, [repos, filter])

  const usingPicker = github && !manual

  return (
    <>
      <p className="text-sm text-gray-600">Código, documentación y prompts del sistema. Se lee todo y solo se lee.</p>

      {usingPicker ? (
        <>
          <div className={ws.field}>
            <label>Repositorio de GitHub</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={repos ? `Buscar entre ${repos.length}…` : 'Cargando…'} disabled={!isAdmin} />
          </div>
          {loadErr && <p className="text-sm text-red-700">{loadErr}</p>}
          {!repos && !loadErr && (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando repositorios…
            </p>
          )}
          {repos && (
            <div className={`${s.list} max-h-64 overflow-auto`}>
              {shown.map((r) => {
                const on = r.full_name === selected
                return (
                  <button
                    key={r.full_name}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => {
                      onRepo(r.full_name)
                      onBranch('')
                    }}
                    className={`${s.li} text-left ${on ? 'bg-white' : 'hover:bg-white'}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 font-medium">
                        {r.private && <Lock className="h-3 w-3 shrink-0 text-gray-400" />}
                        <span className="truncate">{r.full_name}</span>
                      </span>
                      {on ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <span className="text-[11px] text-gray-400">{timeAgo(r.pushed_at)}</span>}
                    </span>
                    {r.description && <span className={`${s.liSub} truncate`}>{r.description}</span>}
                  </button>
                )
              })}
              {!shown.length && <div className={s.li}>Ninguno coincide.</div>}
            </div>
          )}
          {branches.length > 0 && (
            <div className={ws.field}>
              <label>Rama</label>
              <select value={branch} onChange={(e) => onBranch(e.target.value)} disabled={!isAdmin}>
                <option value="">La principal ({repos?.find((r) => r.full_name === selected)?.default_branch})</option>
                {branches.map((br) => (
                  <option key={br} value={br}>
                    {br}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      ) : (
        <>
          {!github && (
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              Para elegir de una lista, añade <b>GITHUB_TOKEN</b> (de solo lectura) en las variables del CRM.
            </p>
          )}
          <div className={ws.field}>
            <label>{sources?.local_repos ? 'GitHub o carpeta' : 'GitHub'}</label>
            <input
              value={repo}
              disabled={!isAdmin}
              onChange={(e) => onRepo(e.target.value)}
              placeholder={sources?.local_repos ? 'org/repo o C:\\ruta\\al\\proyecto' : 'org/repo'}
            />
          </div>
          <div className={ws.field}>
            <label>Rama</label>
            <input value={branch} disabled={!isAdmin} onChange={(e) => onBranch(e.target.value)} placeholder="La principal" />
          </div>
        </>
      )}

      {isAdmin && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={saving || !repo.trim()}
            onClick={onSave}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {github && sources?.local_repos && (
            <button type="button" className={ws.hudBtn} onClick={() => setManual((v) => !v)}>
              {manual ? 'Elegir de GitHub' : 'Carpeta local'}
            </button>
          )}
        </div>
      )}
    </>
  )
}

/* ───────────── Cerebro: resumen primero, todo el detalle debajo ───────────── */

type Section = {
  key: string
  title: string
  items: { nombre: string; tags: string[]; linea: string; detalle: string; extra?: string[]; fuentes: string[]; alerta?: boolean }[]
}

function sectionsOf(brain: Brain): Section[] {
  const dis = { cliente: 'Las inicia el cliente', sistema: 'Las inicia el sistema', modo: 'Modos' } as const
  return [
    ...(['cliente', 'sistema', 'modo'] as const).map((d) => ({
      key: `entradas-${d}`,
      title: `Entradas · ${dis[d]}`,
      items: brain.entradas.filter((e) => e.disparador === d).map((e) => ({ nombre: e.nombre, tags: [e.canal].filter(Boolean), linea: '', detalle: e.detalle, fuentes: e.fuentes })),
    })),
    {
      key: 'agentes',
      title: 'Agentes',
      items: brain.agentes.map((a) => ({ nombre: a.nombre, tags: [a.canal, a.modelo].filter(Boolean), linea: a.rol, detalle: a.detalle, extra: a.herramientas, fuentes: a.fuentes })),
    },
    {
      key: 'herramientas',
      title: 'Herramientas',
      items: brain.herramientas.map((h) => ({
        nombre: h.nombre,
        tags: h.efecto_real ? ['Efecto real'] : [],
        alerta: h.efecto_real,
        linea: `${h.que_hace}${h.destino ? ` → ${h.destino}` : ''}`,
        detalle: h.detalle,
        fuentes: h.fuentes,
      })),
    },
    { key: 'flujos', title: 'Flujos', items: brain.flujos.map((f) => ({ nombre: f.nombre, tags: [], linea: '', detalle: f.detalle, extra: f.pasos, fuentes: f.fuentes })) },
    {
      key: 'modelos',
      title: 'Modelos y voces',
      items: brain.modelos.map((m) => ({ nombre: m.nombre, tags: [m.tipo === 'voz' ? 'Voz' : m.tipo === 'llm' ? 'IA' : 'Otro', m.proveedor].filter(Boolean), linea: m.uso, detalle: m.detalle, fuentes: m.fuentes })),
    },
    { key: 'integraciones', title: 'Integraciones', items: brain.integraciones.map((i) => ({ nombre: i.nombre, tags: [], linea: i.uso, detalle: i.detalle, fuentes: i.fuentes })) },
    { key: 'modos', title: 'Modos', items: brain.modos.map((m) => ({ nombre: m.nombre, tags: [], linea: m.efecto, detalle: m.detalle, fuentes: m.fuentes })) },
    { key: 'conocimiento', title: 'Conocimiento', items: brain.conocimiento.map((c) => ({ nombre: c.nombre, tags: [], linea: '', detalle: c.detalle, fuentes: c.fuentes })) },
  ].filter((sec) => sec.items.length > 0)
}

function BrainView({ proyectoId, brain, docsCount, onGoInbox }: { proyectoId: string; brain: Brain; docsCount: number; onGoInbox: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [item, setItem] = useState<string | null>(null)
  const [docs, setDocs] = useState<{ fuente: string; ruta: string; chars: number }[] | null>(null)
  const sections = useMemo(() => sectionsOf(brain), [brain])

  const loadDocs = () =>
    fetch(`/api/retencion/proyectos/${proyectoId}/cerebro?docs=1`)
      .then(async (r) => (r.ok ? ((await r.json()) as { docs: typeof docs }).docs : []))
      .then((d) => setDocs(d || []))
      .catch(() => setDocs([]))

  return (
    <>
      <p className="text-sm leading-relaxed text-gray-700">{brain.resumen || 'Sin resumen.'}</p>
      <div className={s.stats}>
        <div className={s.stat}><strong>{brain.entradas.length}</strong><span>Entradas</span></div>
        <div className={s.stat}><strong>{brain.agentes.length}</strong><span>Agentes</span></div>
        <div className={s.stat}><strong>{brain.herramientas.length}</strong><span>Herramientas</span></div>
        <div className={s.stat}><strong>{brain.normas_propuestas.length}</strong><span>Normas</span></div>
      </div>
      {brain.normas_propuestas.length > 0 && (
        <button type="button" className={ws.hudBtn} onClick={onGoInbox}>
          <Check className="h-3.5 w-3.5" />
          Revisar normas propuestas en la bandeja
        </button>
      )}

      <div className={s.list}>
        {[
          ['Negocio', brain.identidad.negocio],
          ['Asistente', brain.identidad.asistente],
          ['Tono', brain.identidad.tono],
          ['Horario', brain.identidad.horario],
          ['Contacto', brain.identidad.contacto],
        ]
          .filter(([, v]) => v)
          .map(([label, v]) => (
            <div key={label} className={s.li}>
              <span className={s.liSub}>{label}</span>
              <span>{v}</span>
            </div>
          ))}
      </div>

      {brain.huecos.length > 0 && (
        <div className={s.list}>
          {brain.huecos.map((x, i) => (
            <div key={i} className={s.li}>
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {x}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className={s.secTitle}>Todo el sistema</p>
      {sections.map((sec) => {
        const isOpen = open[sec.key]
        return (
          <div key={sec.key} className={s.list}>
            <button type="button" className={`${s.li} text-left`} onClick={() => setOpen((o) => ({ ...o, [sec.key]: !o[sec.key] }))}>
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{sec.title}</span>
                <span className="flex items-center gap-2 text-[12px] text-gray-400">
                  {sec.items.length}
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </span>
            </button>
            {isOpen &&
              sec.items.map((it, i) => {
                const id = `${sec.key}-${i}`
                const expanded = item === id
                return (
                  <button key={id} type="button" className={`${s.li} text-left`} onClick={() => setItem(expanded ? null : id)}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium">{it.nombre}</span>
                      <span className="flex shrink-0 gap-1">
                        {it.tags.map((t) => (
                          <span key={t} className={`${s.tag} ${it.alerta && t === 'Efecto real' ? s.tagRed : ''}`}>
                            {t}
                          </span>
                        ))}
                      </span>
                    </span>
                    {it.linea && <span className={s.liSub}>{it.linea}</span>}
                    {expanded && (
                      <span className="mt-1 flex flex-col gap-1.5">
                        {it.detalle && <span className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{it.detalle}</span>}
                        {it.extra && it.extra.length > 0 && <span className={s.src}>{it.extra.join(' → ')}</span>}
                        {it.fuentes.length > 0 && <span className={s.src}>{it.fuentes.join(' · ')}</span>}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
        )
      })}

      <p className={s.secTitle}>Lo leído</p>
      {docs ? (
        <div className={`${s.list} max-h-72 overflow-auto`}>
          {docs.map((d, i) => (
            <div key={i} className={s.li}>
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0 text-gray-400" />
                  <span className="truncate">{d.ruta}</span>
                </span>
                <span className="shrink-0 text-[11px] text-gray-400">
                  {d.fuente} · {k(d.chars)} car.
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" className={ws.hudBtn} onClick={() => void loadDocs()}>
          <FileText className="h-3.5 w-3.5" />
          Ver los {docsCount} documentos guardados
        </button>
      )}
    </>
  )
}
