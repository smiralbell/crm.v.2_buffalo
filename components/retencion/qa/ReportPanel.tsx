import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Brain as BrainIcon, Clock, FileText, Loader2, MessageCircle, Play, Plug, Sparkles, X } from 'lucide-react'
import ws from '@/components/retencion/WatchSystemMap.module.css'
import s from './qa.module.css'
import { FlowNode, LineWire, timeAgo } from './FlowBits'
import { usd } from './BrainPanel'
import WhatsappEditor from './WhatsappEditor'
import type { ReportConfig, ReportItem, ReportKind, ReportRun, WhatsappConfig } from '@/lib/retencion/qa/types'

type Data = { config: ReportConfig; runs: ReportRun[]; mcp_connected: string[]; normas_activas: number }
type Sheet = 'disparador' | 'mcp' | 'normas' | 'ia' | 'informe' | 'whatsapp' | null

const EVERY: { v: number; t: string }[] = [
  { v: 0, t: 'Solo a mano' },
  { v: 1440, t: 'Cada día' },
  { v: 10080, t: 'Cada semana' },
  { v: 43200, t: 'Cada mes' },
]

const COPY: Record<ReportKind, { title: string; what: string; items: string; ia: string; wa: string }> = {
  real: {
    title: 'Conversaciones reales',
    what: 'Revisa las conversaciones y llamadas reales del periodo y comprueba si el agente cumplió cada norma.',
    items: 'Incumplimientos',
    ia: 'Lee las conversaciones enteras por el MCP (hasta 40 por informe, primero las que acabaron mal) y las contrasta norma por norma.',
    wa: 'Al terminar cada informe, llega el PDF con el estilo de Buffalo y el resumen en el mensaje.',
  },
  mejoras: {
    title: 'Mejoras',
    what: 'Busca dónde se pierden leads, qué preguntas no sabe responder el agente y qué fricciones hay, y propone mejoras para superar las expectativas del cliente.',
    items: 'Mejoras propuestas',
    ia: 'Lee las conversaciones del periodo por el MCP, agrupa patrones y propone mejoras con impacto y esfuerzo. Las que son reglas de comportamiento entran en la bandeja del flujo de cambios.',
    wa: 'Al terminar cada informe, llega el PDF con las mejoras y el resumen en el mensaje.',
  },
}

export default function ReportPanel({
  proyectoId,
  kind,
  isAdmin,
  brainReady,
  onGoCerebro,
  onGoCambios,
}: {
  proyectoId: string
  kind: ReportKind
  isAdmin: boolean
  brainReady: boolean
  onGoCerebro: () => void
  onGoCambios: () => void
}) {
  const api = `/api/retencion/proyectos/${proyectoId}/calidad-informes?kind=${kind}`
  const copy = COPY[kind]
  const [data, setData] = useState<Data | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [runId, setRunId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(api)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al cargar')
      setData(d as Data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }, [api])

  useEffect(() => {
    setData(null)
    setSheet(null)
    setRunId(null)
    void load()
  }, [load])

  const running = data?.runs.some((r) => r.status === 'running')
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => void load(), 3000)
    return () => clearInterval(t)
  }, [running, load])

  const call = async (key: string, method: 'POST' | 'PATCH', body: unknown) => {
    setBusy(key)
    setErr('')
    try {
      const res = await fetch(api, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error')
      setData(d as Data)
      return d as Data & { run_id?: string }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
      return null
    } finally {
      setBusy(null)
    }
  }

  const cfg = data?.config
  const save = (patch: Partial<{ enabled: boolean; every_minutes: number; whatsapp: WhatsappConfig }>) =>
    cfg && call('config', 'PATCH', { enabled: cfg.enabled, every_minutes: cfg.every_minutes, whatsapp: cfg.whatsapp, ...patch })

  const run = async () => {
    const d = await call('run', 'POST', { action: 'run' })
    if (d?.run_id) {
      setRunId(d.run_id)
      setSheet('informe')
    }
  }

  const last = data?.runs[0]
  const lastOk = data?.runs.find((r) => r.status === 'ok')
  const shown = data?.runs.find((r) => r.id === runId) || last
  const mcpOk = Boolean(data?.mcp_connected.length)
  const everyLabel = EVERY.find((e) => e.v === cfg?.every_minutes)?.t || 'Solo a mano'

  return (
    <div className={`${s.canvas} rounded-[28px]`}>
      <div className={s.topbar}>
        <span className={s.pill}>
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generando informe…
            </>
          ) : lastOk ? (
            <>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Último informe {timeAgo(lastOk.finished_at)}
              {lastOk.usage && <span className="text-gray-400">· {usd(lastOk.usage.cost_usd)}</span>}
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-gray-300" />
              Sin informes todavía
            </>
          )}
        </span>
        {isAdmin && (
          <button type="button" className={`${s.btn} ${s.btnDark}`} disabled={running || busy === 'run' || !mcpOk} onClick={() => void run()}>
            {running || busy === 'run' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Ejecutar ahora
          </button>
        )}
      </div>

      <div className={s.scroll}>
        <div className={`${s.map} ${s.map6}`}>
          <FlowNode
            icon={Clock}
            title="Disparador"
            sub={cfg?.enabled && cfg.every_minutes > 0 ? everyLabel : 'Solo a mano'}
            state={cfg?.enabled && cfg.every_minutes > 0 ? 'done' : 'idle'}
            selected={sheet === 'disparador'}
            onClick={() => setSheet(sheet === 'disparador' ? null : 'disparador')}
          />
          <LineWire lit={mcpOk} />
          <FlowNode
            icon={Plug}
            title="MCP"
            sub={mcpOk ? `${data?.mcp_connected.length} conectado${data?.mcp_connected.length === 1 ? '' : 's'}` : 'Sin conectar'}
            state={mcpOk ? 'done' : 'error'}
            selected={sheet === 'mcp'}
            onClick={() => setSheet(sheet === 'mcp' ? null : 'mcp')}
          />
          <LineWire lit={mcpOk} />
          <FlowNode
            icon={BrainIcon}
            title="Normas y cerebro"
            sub={`${data?.normas_activas ?? 0} normas`}
            state={brainReady ? 'done' : 'dim'}
            selected={sheet === 'normas'}
            onClick={() => setSheet(sheet === 'normas' ? null : 'normas')}
          />
          <LineWire lit={Boolean(lastOk)} />
          <FlowNode icon={Sparkles} title="IA" sub={running ? 'Leyendo…' : 'Análisis'} state={running ? 'running' : lastOk ? 'done' : 'idle'} selected={sheet === 'ia'} onClick={() => setSheet(sheet === 'ia' ? null : 'ia')} />
          <LineWire lit={Boolean(lastOk)} />
          <FlowNode
            icon={FileText}
            title="Informe"
            sub={lastOk?.output ? `${lastOk.output.items.length} ${copy.items.toLowerCase()}` : 'Pendiente'}
            state={last?.status === 'error' ? 'error' : lastOk ? 'done' : 'idle'}
            selected={sheet === 'informe'}
            onClick={() => setSheet(sheet === 'informe' ? null : 'informe')}
          />
          <LineWire lit={Boolean(cfg?.whatsapp.enabled)} />
          <FlowNode
            icon={MessageCircle}
            title="WhatsApp"
            sub={cfg?.whatsapp.enabled ? `${cfg.whatsapp.to.length} ${cfg.whatsapp.to.length === 1 ? 'móvil' : 'móviles'}` : 'Apagado'}
            state={cfg?.whatsapp.enabled ? 'done' : 'dim'}
            selected={sheet === 'whatsapp'}
            onClick={() => setSheet(sheet === 'whatsapp' ? null : 'whatsapp')}
          />
        </div>
      </div>

      {sheet && (
        <aside className={`${ws.sheet} ${sheet === 'informe' ? ws.sheetWide : ''}`} data-sheet>
          <div className={ws.sheetHead}>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">{copy.title}</p>
              <h3 className="mt-0.5 text-lg font-semibold text-gray-900">
                {{ disparador: 'Disparador', mcp: 'MCP', normas: 'Normas y cerebro', ia: 'IA', informe: 'Informe', whatsapp: 'Enviar por WhatsApp' }[sheet]}
              </h3>
            </div>
            <button type="button" className={ws.hudBtn} onClick={() => setSheet(null)} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={ws.sheetBody}>
            {sheet === 'disparador' && cfg && (
              <>
                <p className="text-sm text-gray-600">{copy.what}</p>
                <div className={ws.field}>
                  <label>Cuándo</label>
                  <select
                    value={cfg.enabled ? cfg.every_minutes : 0}
                    disabled={!isAdmin || busy === 'config'}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      void save({ enabled: v > 0, every_minutes: v })
                    }}
                  >
                    {EVERY.map((e) => (
                      <option key={e.v} value={e.v}>
                        {e.t}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-[13px] text-gray-500">
                  Cada informe mira desde el anterior (o el último periodo si es el primero).
                  {cfg.enabled && cfg.next_run_at ? ` Próximo: ${new Date(cfg.next_run_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}.` : ''}
                </p>
              </>
            )}

            {sheet === 'mcp' && (
              <>
                <p className="text-sm text-gray-600">Las conversaciones y llamadas se leen por los conectores MCP del proyecto, siempre en solo lectura.</p>
                {mcpOk ? (
                  <div className={s.list}>
                    {data?.mcp_connected.map((n) => (
                      <div key={n} className={s.li}>
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          {n}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-2xl bg-red-50 px-3 py-2 text-[13px] text-red-800">Sin MCP conectado no se pueden leer las conversaciones. Conéctalo en la pestaña MCP.</p>
                )}
              </>
            )}

            {sheet === 'normas' && (
              <>
                <p className="text-sm text-gray-600">
                  La IA recibe el cerebro (canales, agentes, herramientas, flujos y objetivos) y las {data?.normas_activas ?? 0} normas activas del flujo de cambios.
                </p>
                {!brainReady && (
                  <button type="button" className={ws.hudBtn} onClick={onGoCerebro}>
                    Construir el cerebro
                  </button>
                )}
                {(data?.normas_activas ?? 0) === 0 && (
                  <button type="button" className={ws.hudBtn} onClick={onGoCambios}>
                    Aprobar normas en la bandeja
                  </button>
                )}
              </>
            )}

            {sheet === 'ia' && (
              <>
                <p className="text-sm text-gray-600">{copy.ia}</p>
                <p className="text-[13px] text-gray-500">Nunca pone nombres, teléfonos, correos ni DNI en el informe: cita cada conversación por su id y su fecha.</p>
                {lastOk?.usage && (
                  <p className="text-[13px] text-gray-500">
                    Último: <b className="text-gray-800">{usd(lastOk.usage.cost_usd)}</b> · {lastOk.usage.calls} llamadas · {lastOk.usage.model}
                  </p>
                )}
              </>
            )}

            {sheet === 'informe' && (
              <>
                {data?.runs.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {data.runs.slice(0, 8).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRunId(r.id)}
                        className={`${s.tag} ${shown?.id === r.id ? 'bg-gray-900 text-white' : ''} ${r.status === 'error' ? s.tagRed : ''}`}
                      >
                        {new Date(r.started_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {r.status === 'running' ? ' · en curso' : ''}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Todavía no hay informes. Pulsa «Ejecutar ahora».</p>
                )}
                {shown && <RunView run={shown} kind={kind} itemsTitle={copy.items} onGoCambios={onGoCambios} />}
              </>
            )}

            {sheet === 'whatsapp' && cfg && (
              <WhatsappEditor value={cfg.whatsapp} isAdmin={isAdmin} saving={busy === 'config'} hint={copy.wa} onSave={(w) => void save({ whatsapp: w })} />
            )}

            {err && <p className="text-sm text-red-700">{err}</p>}
          </div>
        </aside>
      )}
    </div>
  )
}

function ItemList({ items, kind }: { items: ReportItem[]; kind: ReportKind }) {
  return (
    <div className={s.list}>
      {items.map((it, i) => (
        <div key={i} className={s.li}>
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{it.titulo}</span>
            <span className="flex shrink-0 gap-1">
              {it.norma && <span className={s.tag}>{it.norma}</span>}
              {kind === 'mejoras' && it.impacto && <span className={`${s.tag} ${it.impacto === 'alta' ? s.tagGreen : ''}`}>impacto {it.impacto}</span>}
              {kind === 'mejoras' && it.esfuerzo && <span className={s.tag}>esfuerzo {it.esfuerzo}</span>}
              {kind === 'real' && <span className={`${s.tag} ${it.gravedad === 'alta' ? s.tagRed : it.gravedad === 'media' ? s.tagAmber : ''}`}>{it.gravedad}</span>}
            </span>
          </span>
          {it.detalle && <span className="whitespace-pre-wrap text-[13px] leading-relaxed text-gray-700">{it.detalle}</span>}
          {it.norma_propuesta && <span className={s.liSub}>Norma propuesta (en la bandeja): {it.norma_propuesta}</span>}
          {it.conversaciones.length > 0 && <span className={s.src}>{it.conversaciones.join(' · ')}</span>}
        </div>
      ))}
    </div>
  )
}

function RunView({ run, kind, itemsTitle, onGoCambios }: { run: ReportRun; kind: ReportKind; itemsTitle: string; onGoCambios: () => void }) {
  if (run.status === 'running') {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> La IA está leyendo las conversaciones. Tarda unos minutos.
      </p>
    )
  }
  if (run.status === 'error') return <p className="text-sm text-red-700">{run.error || 'El informe falló.'}</p>
  const o = run.output
  if (!o) return null
  return (
    <>
      <p className="text-[12px] text-gray-400">
        {o.periodo}
        {run.usage ? ` · ${usd(run.usage.cost_usd)}` : ''}
        {run.whatsapp ? ` · WhatsApp: ${run.whatsapp.sent} enviado${run.whatsapp.sent === 1 ? '' : 's'}` : ''}
      </p>
      {run.whatsapp?.errors.length ? <p className="text-[13px] text-red-700">{run.whatsapp.errors.join(' · ')}</p> : null}
      <p className="text-sm leading-relaxed text-gray-700">{o.resumen}</p>
      {Object.keys(o.metricas).length > 0 && (
        <div className={s.stats}>
          {Object.entries(o.metricas)
            .slice(0, 8)
            .map(([k, v]) => (
              <div key={k} className={s.stat}>
                <strong>{v}</strong>
                <span>{k.replace(/_/g, ' ')}</span>
              </div>
            ))}
        </div>
      )}
      <p className={s.secTitle}>
        {itemsTitle} · {o.items.length}
      </p>
      {o.items.length ? <ItemList items={o.items} kind={kind} /> : <p className="text-sm text-gray-500">Ninguno.</p>}
      {kind === 'mejoras' && o.items.some((i) => i.norma_propuesta) && (
        <button type="button" className={ws.hudBtn} onClick={onGoCambios}>
          Ver las normas propuestas en la bandeja
        </button>
      )}
      {o.dudosas.length > 0 && (
        <>
          <p className={s.secTitle}>Casos dudosos · {o.dudosas.length}</p>
          <ItemList items={o.dudosas} kind={kind} />
        </>
      )}
      {o.bien.length > 0 && (
        <>
          <p className={s.secTitle}>Lo que funciona</p>
          <div className={s.list}>
            {o.bien.map((b, i) => (
              <div key={i} className={s.li}>
                {b}
              </div>
            ))}
          </div>
        </>
      )}
      {o.limites.length > 0 && (
        <>
          <p className={s.secTitle}>Límites</p>
          <div className={s.list}>
            {o.limites.map((b, i) => (
              <div key={i} className={s.li}>
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  {b}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
