import { useEffect, useState } from 'react'
import { AlertTriangle, Brain as BrainIcon, Building2, Check, GitBranch, Loader2, PhoneCall, Play, Plug, Radar, RotateCw, Save, X } from 'lucide-react'
import ws from '@/components/retencion/WatchSystemMap.module.css'
import s from './qa.module.css'
import { FanWire, FlowNode, LineWire, ProgressRing, timeAgo, type NodeState } from './FlowBits'
import type { BrainPhase, BrainPhaseId, BrainPublic } from '@/lib/retencion/qa/types'

export type BrainSources = {
  repo_default: string | null
  mcp_connected: string[]
  mcp_total: number
  local_repos: boolean
}

export type BrainData = { brain: BrainPublic; sources: BrainSources }
export type BrainSheet = 'crm' | 'repo' | 'mcp' | 'retell' | 'arana' | 'cerebro' | null

const PHASE_LABEL: Record<BrainPhaseId, string> = { crm: 'CRM', repo: 'Repositorio', mcp: 'MCP', retell: 'Retell', ia: 'Cerebro' }

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
  const [retellKey, setRetellKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    setRepo(b?.repo_source || data?.sources.repo_default || '')
    setBranch(b?.repo_branch || '')
    // Solo al cambiar de proyecto o al cargar por primera vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, Boolean(data)])

  useEffect(() => {
    setMsg('')
    setErr('')
  }, [sheet])

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

  const repoSub =
    phase('repo')?.status === 'pending' || !phase('repo')?.detail
      ? b?.repo_source || data?.sources.repo_default
        ? 'Conectado'
        : 'Sin conectar'
      : phase('repo')!.detail
  const mcpSub =
    phase('mcp')?.detail && phase('mcp')?.status !== 'pending'
      ? phase('mcp')!.detail
      : `${data?.sources.mcp_connected.length ?? 0} conectados`
  const retellSub =
    phase('retell')?.detail && phase('retell')?.status !== 'pending'
      ? phase('retell')!.detail
      : b?.retell_configured
        ? 'Clave guardada'
        : 'Opcional'

  const brainState: NodeState = running ? 'idle' : brain ? 'done' : 'dim'
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
          {isAdmin && (
            <button
              type="button"
              data-tour="lanzar"
              className={`${s.btn} ${s.btnDark}`}
              onClick={() => void start()}
              disabled={running || starting}
            >
              {running || starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : brain ? <RotateCw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {running ? 'Rastreando…' : brain ? 'Volver a rastrear' : 'Lanzar rastreo'}
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
            <FlowNode icon={PhoneCall} title="Retell" sub={retellSub} state={stateOf(phase('retell'))} selected={sheet === 'retell'} onClick={() => onSheet(sheet === 'retell' ? null : 'retell')} />
          </div>
          <FanWire count={4} lit={(['crm', 'repo', 'mcp', 'retell'] as BrainPhaseId[]).map((id) => phase(id)?.status === 'done')} />
          <FlowNode
            icon={Radar}
            title="Araña"
            sub={running ? current ? PHASE_LABEL[current.id] : 'Preparando' : b?.status === 'error' ? 'Con error' : 'Rastreador'}
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
            state={brainState}
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
                {{ crm: 'CRM', repo: 'Repositorio', mcp: 'MCP', retell: 'Retell', arana: 'Araña', cerebro: 'Cerebro' }[sheet]}
              </h3>
            </div>
            <button type="button" className={ws.hudBtn} onClick={() => onSheet(null)} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={ws.sheetBody}>
            {sheet === 'crm' && (
              <p className="text-sm text-gray-600">
                Proyecto, cliente, producto contratado, onboarding, tareas y tickets. Se lee solo en cada rastreo.
              </p>
            )}

            {sheet === 'repo' && (
              <>
                <p className="text-sm text-gray-600">Código, documentación y prompts del sistema. Solo se lee.</p>
                <div className={ws.field}>
                  <label>GitHub o carpeta</label>
                  <input
                    value={repo}
                    disabled={!isAdmin}
                    onChange={(e) => setRepo(e.target.value)}
                    placeholder={data?.sources.local_repos ? 'https://github.com/org/repo o C:\\ruta\\al\\proyecto' : 'https://github.com/org/repo'}
                  />
                </div>
                <div className={ws.field}>
                  <label>Rama</label>
                  <input value={branch} disabled={!isAdmin} onChange={(e) => setBranch(e.target.value)} placeholder="La principal" />
                </div>
                <p className="text-xs text-gray-400">Si el repositorio es privado, el CRM necesita GITHUB_TOKEN.</p>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void patch({ repo_source: repo, repo_branch: branch })}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                )}
              </>
            )}

            {sheet === 'mcp' && (
              <>
                <p className="text-sm text-gray-600">Los conectores de la pestaña MCP. La araña lista sus herramientas y consulta las de resumen y agentes.</p>
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

            {sheet === 'retell' && (
              <>
                <p className="text-sm text-gray-600">Agentes de voz, sus prompts, herramientas y voces. Opcional.</p>
                <div className={ws.field}>
                  <label>Clave de API de Retell</label>
                  <input
                    type="password"
                    value={retellKey}
                    disabled={!isAdmin}
                    onChange={(e) => setRetellKey(e.target.value)}
                    placeholder={b?.retell_configured ? '•••••••• guardada' : 'key_…'}
                    autoComplete="off"
                  />
                </div>
                {isAdmin && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={saving || !retellKey.trim()}
                      onClick={() => void patch({ retell_api_key: retellKey }).then(() => setRetellKey(''))}
                      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      Guardar
                    </button>
                    {b?.retell_configured && (
                      <button type="button" disabled={saving} onClick={() => void patch({ clear_retell: true })} className={ws.hudBtn}>
                        Quitar
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {sheet === 'arana' && (
              <>
                <div className={s.list}>
                  {(b?.phases || []).map((p) => (
                    <div key={p.id} className={s.li}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{PHASE_LABEL[p.id]}</span>
                        <span
                          className={`${s.tag} ${p.status === 'done' ? s.tagGreen : p.status === 'error' ? s.tagRed : p.status === 'running' ? s.tagAmber : ''}`}
                        >
                          {{ pending: 'Pendiente', running: 'En curso', done: 'Hecho', skipped: 'Saltado', error: 'Error' }[p.status]}
                        </span>
                      </span>
                      {p.detail && <span className={s.liSub}>{p.detail}</span>}
                    </div>
                  ))}
                </div>
                {b?.error && <p className="text-sm text-red-700">{b.error}</p>}
                {isAdmin && (
                  <button
                    type="button"
                    disabled={running || starting}
                    onClick={() => void start()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {running ? `Rastreando · ${progress}%` : brain ? 'Volver a rastrear' : 'Lanzar rastreo'}
                  </button>
                )}
              </>
            )}

            {sheet === 'cerebro' && (brain ? <BrainView brain={brain} onGoInbox={onGoInbox} /> : <p className="text-sm text-gray-500">Lanza el rastreo para construirlo.</p>)}

            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
            {err && <p className="text-sm text-red-700">{err}</p>}
          </div>
        </aside>
      )}
    </div>
  )
}

function BrainView({ brain, onGoInbox }: { brain: NonNullable<BrainPublic['brain']>; onGoInbox: () => void }) {
  const groups: { k: 'cliente' | 'sistema' | 'modo'; t: string }[] = [
    { k: 'cliente', t: 'Las inicia el cliente' },
    { k: 'sistema', t: 'Las inicia el sistema' },
    { k: 'modo', t: 'Modos' },
  ]
  return (
    <>
      <p className="text-sm leading-relaxed text-gray-700">{brain.resumen}</p>
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

      <p className={s.secTitle}>Identidad</p>
      <div className={s.list}>
        {[
          ['Negocio', brain.identidad.negocio],
          ['Asistente', brain.identidad.asistente],
          ['Tono', brain.identidad.tono],
          ['Horario', brain.identidad.horario],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className={s.li}>
              <span className={s.liSub}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
      </div>

      {groups.map((g) => {
        const list = brain.entradas.filter((e) => e.disparador === g.k)
        if (!list.length) return null
        return (
          <div key={g.k} className="flex flex-col gap-2">
            <p className={s.secTitle}>Entradas · {g.t}</p>
            <div className={s.list}>
              {list.map((e, i) => (
                <div key={i} className={s.li}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{e.nombre}</span>
                    <span className={s.tag}>{e.canal}</span>
                  </span>
                  {e.descripcion && <span className={s.liSub}>{e.descripcion}</span>}
                  {e.fuente && <span className={s.src}>{e.fuente}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {brain.agentes.length > 0 && (
        <>
          <p className={s.secTitle}>Agentes</p>
          <div className={s.list}>
            {brain.agentes.map((a, i) => (
              <div key={i} className={s.li}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.nombre}</span>
                  <span className="flex gap-1">
                    {a.canal && <span className={s.tag}>{a.canal}</span>}
                    {a.modelo && <span className={s.tag}>{a.modelo}</span>}
                  </span>
                </span>
                <span className={s.liSub}>{a.rol}</span>
                {a.herramientas.length > 0 && <span className={s.src}>{a.herramientas.join(' · ')}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {brain.herramientas.length > 0 && (
        <>
          <p className={s.secTitle}>Herramientas</p>
          <div className={s.list}>
            {brain.herramientas.map((h, i) => (
              <div key={i} className={s.li}>
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{h.nombre}</span>
                  {h.efecto_real && <span className={`${s.tag} ${s.tagRed}`}>Efecto real</span>}
                </span>
                <span className={s.liSub}>
                  {h.que_hace}
                  {h.destino ? ` → ${h.destino}` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {(brain.modelos.length > 0 || brain.voces.length > 0) && (
        <>
          <p className={s.secTitle}>Modelos y voces</p>
          <div className={s.list}>
            {brain.modelos.map((m, i) => (
              <div key={`m${i}`} className={s.li}>
                <span className="font-medium">{m.proveedor ? `${m.proveedor} · ` : ''}{m.modelo}</span>
                {m.uso && <span className={s.liSub}>{m.uso}</span>}
              </div>
            ))}
            {brain.voces.map((v, i) => (
              <div key={`v${i}`} className={s.li}>
                <span className="font-medium">Voz · {v.proveedor ? `${v.proveedor} · ` : ''}{v.voz}</span>
                {v.uso && <span className={s.liSub}>{v.uso}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {brain.integraciones.length > 0 && (
        <>
          <p className={s.secTitle}>Integraciones</p>
          <div className={s.list}>
            {brain.integraciones.map((x, i) => (
              <div key={i} className={s.li}>
                <span className="font-medium">{x.nombre}</span>
                <span className={s.liSub}>{x.uso}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {brain.conocimiento.length > 0 && (
        <>
          <p className={s.secTitle}>Conocimiento</p>
          <div className={s.list}>
            {brain.conocimiento.map((x, i) => (
              <div key={i} className={s.li}>{x}</div>
            ))}
          </div>
        </>
      )}

      {brain.huecos.length > 0 && (
        <>
          <p className={s.secTitle}>Lo que no ha podido saber</p>
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
        </>
      )}
    </>
  )
}
