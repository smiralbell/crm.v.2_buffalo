import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Brain as BrainIcon, FlaskConical, GitBranch, Inbox, ListChecks, Loader2, PenLine, RefreshCw, Send, Settings2, Ticket, X } from 'lucide-react'
import ws from '@/components/retencion/WatchSystemMap.module.css'
import s from './qa.module.css'
import { FanWire, FlowNode, LineWire, timeAgo } from './FlowBits'
import Flow1ConfigForm, { REPO_EVERY } from './Flow1Config'
import type { Flow1Config, Flow1Public, InboxItem } from '@/lib/retencion/qa/types'

export type Flow1Sheet = 'manual' | 'tickets' | 'repo' | 'bandeja' | 'normas' | 'pruebas' | 'config' | null

const ORIGEN: Record<InboxItem['origen'], string> = { cerebro: 'Cerebro', manual: 'Manual', ticket: 'Ticket', repo: 'Repositorio' }
const ACCION: Record<InboxItem['propuesta']['accion'], { t: string; c: string }> = {
  nueva: { t: 'Norma nueva', c: s.tagGreen },
  modificar: { t: 'Modifica', c: s.tagAmber },
  ya_existe: { t: 'Ya existe', c: '' },
  no_es_norma: { t: 'No es norma', c: '' },
}

export default function Flow1Panel({
  proyectoId,
  isAdmin,
  brainReady,
  repoSource,
  sheet,
  onSheet,
  onGoCerebro,
  reloadKey,
}: {
  proyectoId: string
  isAdmin: boolean
  brainReady: boolean
  repoSource: string | null
  sheet: Flow1Sheet
  onSheet: (s: Flow1Sheet) => void
  onGoCerebro: () => void
  reloadKey: number
}) {
  const [flow, setFlow] = useState<Flow1Public | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [texto, setTexto] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [showDone, setShowDone] = useState(false)

  const api = `/api/retencion/proyectos/${proyectoId}/flujo-cambios`

  const load = useCallback(async () => {
    try {
      const res = await fetch(api)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error al cargar')
      setFlow(d.flow as Flow1Public)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    }
  }, [api])

  useEffect(() => {
    void load()
  }, [load, reloadKey])

  useEffect(() => {
    setErr('')
    setMsg('')
  }, [sheet])

  const call = async (key: string, method: 'POST' | 'PATCH', body: unknown, ok?: (d: Record<string, unknown>) => string) => {
    setBusy(key)
    setErr('')
    setMsg('')
    try {
      const res = await fetch(api, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Error')
      if (d.flow) setFlow(d.flow as Flow1Public)
      if (ok) setMsg(ok(d))
      return d as Record<string, unknown>
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
      return null
    } finally {
      setBusy(null)
    }
  }

  const saveConfig = (c: Flow1Config) => call('config', 'PATCH', c, () => 'Guardado')
  const toggle = (k: 'manual' | 'tickets' | 'repo') => flow && void saveConfig({ ...flow.config, [k]: !flow.config[k] })

  const cfg = flow?.config
  const pending = flow?.inbox.filter((i) => i.estado === 'pendiente') || []
  const decided = flow?.inbox.filter((i) => i.estado !== 'pendiente') || []
  const activas = flow?.normas.filter((n) => n.estado === 'activa') || []

  return (
    <div className={`${s.canvas} rounded-[28px]`}>
      <div className={s.topbar}>
        <span className={s.pill}>
          <span className={`h-2 w-2 rounded-full ${pending.length ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          {pending.length} pendientes · {activas.length} normas
        </span>
        <div className="flex items-center gap-2">
          {isAdmin && (cfg?.tickets || cfg?.repo) && (
            <button
              type="button"
              className={s.btn}
              disabled={busy === 'scan'}
              onClick={() =>
                void call('scan', 'POST', { action: 'scan_now' }, (d) => {
                  const sc = (d.scan || {}) as { tickets?: number; repo?: string }
                  return [sc.tickets != null ? `Tickets: ${sc.tickets} propuestas` : '', sc.repo ? `Repositorio: ${sc.repo}` : ''].filter(Boolean).join(' · ') || 'Revisado'
                }).then(() => onSheet('bandeja'))
              }
            >
              {busy === 'scan' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Revisar ahora
            </button>
          )}
          {isAdmin && (
            <button type="button" className={`${s.btn} ${s.btnDark}`} onClick={() => onSheet('config')}>
              <Settings2 className="h-3.5 w-3.5" />
              Configurar
            </button>
          )}
        </div>
      </div>

      <div className={s.scroll}>
        <div className={`${s.map} ${s.map4}`}>
          <div className={s.col}>
            <FlowNode icon={PenLine} title="Manual" sub={cfg?.manual ? 'Activo' : 'Apagado'} state={cfg?.manual ? 'done' : 'dim'} selected={sheet === 'manual'} onClick={() => onSheet(sheet === 'manual' ? null : 'manual')} />
            <FlowNode
              icon={Ticket}
              title="Tickets"
              sub={cfg?.tickets ? (flow?.last_ticket_scan_at ? `Revisado ${timeAgo(flow.last_ticket_scan_at)}` : 'Activo') : 'Apagado'}
              state={cfg?.tickets ? 'done' : 'dim'}
              selected={sheet === 'tickets'}
              onClick={() => onSheet(sheet === 'tickets' ? null : 'tickets')}
            />
            <FlowNode
              icon={GitBranch}
              title="Repositorio"
              sub={cfg?.repo ? REPO_EVERY.find((r) => r.v === cfg.repo_every_minutes)?.t || 'Activo' : 'Apagado'}
              state={cfg?.repo ? 'done' : 'dim'}
              selected={sheet === 'repo'}
              onClick={() => onSheet(sheet === 'repo' ? null : 'repo')}
            />
          </div>
          <FanWire count={3} lit={[Boolean(cfg?.manual), Boolean(cfg?.tickets), Boolean(cfg?.repo)]} />
          <FlowNode icon={Inbox} title="Bandeja" sub={pending.length ? `${pending.length} por revisar` : 'Al día'} badge={pending.length || null} selected={sheet === 'bandeja'} onClick={() => onSheet(sheet === 'bandeja' ? null : 'bandeja')} tour="bandeja" />
          <LineWire lit={activas.length > 0} />
          <FlowNode icon={ListChecks} title="Normas" sub={`${activas.length} activas`} state={activas.length ? 'done' : 'idle'} selected={sheet === 'normas'} onClick={() => onSheet(sheet === 'normas' ? null : 'normas')} />
          <LineWire />
          <FlowNode icon={FlaskConical} title="Pruebas" sub="Siguiente fase" state="dim" selected={sheet === 'pruebas'} onClick={() => onSheet(sheet === 'pruebas' ? null : 'pruebas')} />
        </div>
      </div>

      {!brainReady && (
        <div className={s.blocker}>
          <div className={s.card}>
            <span className={s.icon}>
              <BrainIcon className="h-[18px] w-[18px]" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Primero, el cerebro</h3>
              <p className="mt-1 text-sm text-gray-500">Para convertir cambios en normas, Buffalo tiene que entender antes cómo funciona el sistema.</p>
            </div>
            <button type="button" onClick={onGoCerebro} className="inline-flex h-10 items-center justify-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white">
              Ir al cerebro
            </button>
          </div>
        </div>
      )}

      {sheet && (
        <aside className={`${ws.sheet} ${sheet === 'bandeja' ? ws.sheetWide : ''}`} data-sheet>
          <div className={ws.sheetHead}>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-gray-400">
                {sheet === 'manual' || sheet === 'tickets' || sheet === 'repo' ? 'Entrada' : 'Flujo de cambios'}
              </p>
              <h3 className="mt-0.5 text-lg font-semibold text-gray-900">
                {{ manual: 'Manual', tickets: 'Tickets', repo: 'Repositorio', bandeja: 'Bandeja', normas: 'Normas', pruebas: 'Pruebas', config: 'De dónde llegan los cambios' }[sheet]}
              </h3>
            </div>
            <button type="button" className={ws.hudBtn} onClick={() => onSheet(null)} aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={ws.sheetBody}>
            {sheet === 'config' && cfg && <Flow1ConfigForm initial={cfg} saving={busy === 'config'} onSave={(c) => void saveConfig(c)} />}

            {(sheet === 'manual' || sheet === 'tickets' || sheet === 'repo') && cfg && (
              <label className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-800">
                {cfg[sheet] ? 'Activo' : 'Apagado'}
                <input type="checkbox" className="h-4 w-4" checked={cfg[sheet]} disabled={!isAdmin || busy === 'config'} onChange={() => toggle(sheet)} />
              </label>
            )}

            {sheet === 'manual' && (
              <>
                <p className="text-sm text-gray-600">Describe la mejora que se ha hecho o que se va a hacer. La IA la convierte en norma y la deja en la bandeja.</p>
                <div className={ws.field}>
                  <label>Mejora</label>
                  <textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    disabled={!isAdmin || !cfg?.manual}
                    style={{ minHeight: 140 }}
                    placeholder="Ej.: fuera de horario, la IA ya no promete que una persona escribirá esa misma noche."
                  />
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    disabled={busy === 'manual' || texto.trim().length < 5 || !cfg?.manual}
                    onClick={() =>
                      void call('manual', 'POST', { action: 'manual', texto }, (d) => `${(d.items as unknown[] | undefined)?.length ?? 0} propuestas en la bandeja`).then((d) => {
                        if (d) {
                          setTexto('')
                          onSheet('bandeja')
                        }
                      })
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy === 'manual' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    {busy === 'manual' ? 'Analizando…' : 'Enviar'}
                  </button>
                )}
              </>
            )}

            {sheet === 'tickets' && (
              <p className="text-sm text-gray-600">
                Cada ticket nuevo de este proyecto se analiza en menos de un minuto. Si cambia el comportamiento del agente, se propone como norma.
                {flow?.last_ticket_scan_at ? ` Última revisión: ${timeAgo(flow.last_ticket_scan_at)}.` : ''}
              </p>
            )}

            {sheet === 'repo' && cfg && (
              <>
                <p className="text-sm text-gray-600">
                  Revisa los commits nuevos de {repoSource || 'el repositorio del cerebro'} y propone las normas que cambian. La primera vez solo toma la referencia.
                </p>
                <div className={ws.field}>
                  <label>Frecuencia</label>
                  <select
                    value={cfg.repo_every_minutes}
                    disabled={!isAdmin}
                    onChange={(e) => void saveConfig({ ...cfg, repo_every_minutes: Number(e.target.value) })}
                  >
                    {REPO_EVERY.map((r) => (
                      <option key={r.v} value={r.v}>
                        {r.t}
                      </option>
                    ))}
                  </select>
                </div>
                {flow?.last_repo_scan_at && (
                  <p className="text-xs text-gray-400">
                    Última revisión {timeAgo(flow.last_repo_scan_at)}
                    {flow.last_repo_sha ? ` · ${flow.last_repo_sha.slice(0, 7)}` : ''}
                  </p>
                )}
              </>
            )}

            {sheet === 'bandeja' && (
              <>
                {!pending.length && <p className="text-sm text-gray-500">Nada por revisar.</p>}
                {pending.map((it) => {
                  const p = it.propuesta
                  const editable = p.accion === 'nueva' || p.accion === 'modificar'
                  return (
                    <div key={it.id} className={`${s.inboxCard} ${p.conflicto ? s.conflict : ''}`}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={s.tag}>{ORIGEN[it.origen]}</span>
                        <span className={`${s.tag} ${ACCION[p.accion].c}`}>
                          {ACCION[p.accion].t}
                          {p.norma ? ` ${p.norma}` : ''}
                        </span>
                        {editable && <span className={`${s.tag} ${p.gravedad === 'alta' ? s.tagRed : ''}`}>{p.gravedad}</span>}
                        <span className="ml-auto text-[11px] text-gray-400">{timeAgo(it.created_at)}</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">{it.titulo}</p>
                      {editable ? (
                        <textarea
                          className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"
                          rows={2}
                          disabled={!isAdmin}
                          value={edits[it.id] ?? p.regla}
                          onChange={(e) => setEdits((m) => ({ ...m, [it.id]: e.target.value }))}
                        />
                      ) : null}
                      {p.conflicto && (
                        <p className="flex items-start gap-1.5 text-[13px] text-red-700">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Choca con {p.conflicto}
                        </p>
                      )}
                      {p.motivo && <p className="text-[12px] text-gray-500">{p.motivo}</p>}
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy === it.id}
                            onClick={() => void call(it.id, 'POST', { action: 'decide', id: it.id, decision: 'aprobar', regla: edits[it.id] })}
                            className="inline-flex h-9 items-center justify-center rounded-full bg-gray-900 px-4 text-[13px] font-medium text-white disabled:opacity-50"
                          >
                            {editable ? 'Aprobar' : 'Entendido'}
                          </button>
                          <button type="button" disabled={busy === it.id} onClick={() => void call(it.id, 'POST', { action: 'decide', id: it.id, decision: 'descartar' })} className={ws.hudBtn}>
                            Descartar
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {decided.length > 0 && (
                  <button type="button" className="self-start text-[13px] text-gray-500 underline-offset-2 hover:underline" onClick={() => setShowDone((v) => !v)}>
                    {showDone ? 'Ocultar decididas' : `Ver decididas (${decided.length})`}
                  </button>
                )}
                {showDone && (
                  <div className={s.list}>
                    {decided.map((it) => (
                      <div key={it.id} className={s.li}>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">{it.titulo}</span>
                          <span className={`${s.tag} ${it.estado === 'aprobada' ? s.tagGreen : ''}`}>{it.estado}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {sheet === 'normas' && (
              <>
                {!flow?.normas.length && <p className="text-sm text-gray-500">Aún no hay normas. Se crean al aprobar propuestas de la bandeja.</p>}
                {flow?.normas.length ? (
                  <div className={s.list}>
                    {flow.normas.map((n) => (
                      <div key={n.id} className={s.li} style={n.estado === 'sustituida' ? { opacity: 0.5 } : undefined}>
                        <span className="flex items-center justify-between gap-2">
                          <span className={s.src}>{n.code}</span>
                          <span className="flex gap-1">
                            {n.estado === 'sustituida' && <span className={s.tag}>sustituida</span>}
                            <span className={`${s.tag} ${n.gravedad === 'alta' ? s.tagRed : ''}`}>{n.gravedad}</span>
                          </span>
                        </span>
                        <span>{n.regla}</span>
                        <span className={s.liSub}>
                          {[n.area, n.canal, ORIGEN[n.origen_tipo]].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}

            {sheet === 'pruebas' && (
              <p className="text-sm text-gray-600">
                Siguiente fase: cada norma tendrá sus casos de prueba y se probará con un cliente simulado (texto) o con las pruebas de Retell (voz) antes de desplegar.
              </p>
            )}

            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
            {err && <p className="text-sm text-red-700">{err}</p>}
          </div>
        </aside>
      )}
    </div>
  )
}
