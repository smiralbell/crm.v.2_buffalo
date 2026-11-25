import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import {
  AlertTriangle,
  Bot,
  Database,
  Focus,
  ListTodo,
  MessageCircle,
  Monitor,
  Plug,
  Route,
  Send,
  Server,
  Users,
  Workflow,
  X,
  BellRing,
  type LucideIcon,
} from 'lucide-react'
import styles from '@/components/retencion/WatchSystemMap.module.css'

/**
 * Esquema de cómo funciona el agente de IA del CRM: canales, quién escribe,
 * los dos agentes, sus herramientas, el MCP del CRM y los MCP de los clientes.
 * Mismo lienzo que los flujos de Retención → Sistema.
 */

type NodeId =
  | 'whatsapp'
  | 'telegram'
  | 'router'
  | 'socios'
  | 'equipo'
  | 'crmdb'
  | 'tareas'
  | 'retencion'
  | 'avisos'
  | 'mcpclientes'
  | 'respuesta'
  | 'claude'
  | 'mcpcrm'
  | 'flujos'

type DiagramNode = {
  id: NodeId
  label: string
  sub: string
  x: number
  y: number
  icon: LucideIcon
  /** Color del icono según el tipo de caja */
  tone: 'canal' | 'agente' | 'herramienta' | 'mcp' | 'salida'
  title: string
  text: string
  points: string[]
}

const TONE: Record<DiagramNode['tone'], { bg: string; fg: string; label: string }> = {
  canal: { bg: '#eef2ff', fg: '#4338ca', label: 'Canal' },
  agente: { bg: '#ecfdf5', fg: '#047857', label: 'Agente de IA' },
  herramienta: { bg: '#f4f5f7', fg: '#111827', label: 'Herramienta' },
  mcp: { bg: '#fff7ed', fg: '#c2410c', label: 'MCP' },
  salida: { bg: '#f0f9ff', fg: '#0369a1', label: 'Salida' },
}

const NODES: DiagramNode[] = [
  {
    id: 'whatsapp', label: 'WhatsApp', sub: 'Evolution API', x: -660, y: -130, icon: MessageCircle, tone: 'canal',
    title: 'WhatsApp',
    text: 'Socios y equipo escriben al número del agente. Evolution API avisa al CRM de cada mensaje.',
    points: [
      'Entiende texto, notas de voz (se transcriben), fotos (se describen) y archivos de texto.',
      'Solo chats privados: en grupos no contesta.',
      'El aviso llega al CRM por /api/webhooks/whatsapp con un secreto.',
    ],
  },
  {
    id: 'telegram', label: 'Telegram', sub: 'bot de los socios', x: -660, y: 40, icon: Send, tone: 'canal',
    title: 'Telegram',
    text: 'El mismo agente de los socios, por Telegram. El equipo solo usa WhatsApp.',
    points: ['Mismo historial, herramientas y avisos que por WhatsApp.', 'Borrados con botones de confirmación.'],
  },
  {
    id: 'router', label: '¿Quién escribe?', sub: 'se decide por el móvil', x: -370, y: -45, icon: Route, tone: 'herramienta',
    title: '¿Quién escribe?',
    text: 'La identidad sale siempre del número de móvil. La IA nunca decide quién es nadie.',
    points: [
      'Móvil de socio (WHATSAPP_AGENT_NUMBERS) → agente de socios.',
      'Móvil en la ficha de Usuarios de un developer o PM → agente del equipo.',
      'Cualquier otro número → no contesta.',
      'Si en el chat alguien dice ser otra persona, no cambia nada.',
    ],
  },
  {
    id: 'socios', label: 'Agente de socios', sub: 'todo el CRM', x: -80, y: -140, icon: Bot, tone: 'agente',
    title: 'Agente de socios',
    text: 'Ve y gestiona todo el CRM: leads, proyectos, finanzas, tareas del equipo, retención y avisos.',
    points: [
      'Modelo de IA por OpenRouter, con herramientas: no inventa datos, los consulta.',
      'Reúne el contexto de una persona (leads, correos, reuniones) antes de responder.',
      'Borrar pide confirmación y todo lo que hace se puede deshacer escribiendo «deshacer».',
      'Recuerda cómo quiere que le hable cada socio (instrucciones personales).',
    ],
  },
  {
    id: 'equipo', label: 'Agente del equipo', sub: 'developers y PM', x: -80, y: 70, icon: Users, tone: 'agente',
    title: 'Agente del equipo',
    text: 'Cada developer o PM habla con su propio agente, que solo ve lo suyo.',
    points: [
      'Sus tareas (sueltas y de sus proyectos) con subtareas: crear, mover, cambiar.',
      'Retención de sus proyectos en producción: incidencias, vigilancia y el MCP del cliente.',
      'Tickets: los lee todos de sus proyectos, solo responde los que tiene asignados.',
      'Nunca ve leads, clientes, finanzas, precios ni la configuración del CRM.',
    ],
  },
  {
    id: 'crmdb', label: 'Base de datos', sub: 'Postgres del CRM', x: 220, y: -250, icon: Database, tone: 'herramienta',
    title: 'Base de datos del CRM',
    text: 'Donde vive todo: leads, contactos, proyectos, facturas, tareas, retención.',
    points: [
      'El agente de socios consulta y cambia datos; los borrados pasan por doble confirmación.',
      'El agente del equipo no accede a la base de datos directamente, solo a sus herramientas.',
      'El MCP del CRM (abajo) también trabaja sobre esta base de datos.',
    ],
  },
  {
    id: 'tareas', label: 'Tareas', sub: 'del equipo y de los socios', x: 220, y: -100, icon: ListTodo, tone: 'herramienta',
    title: 'Tareas',
    text: 'Las mismas tareas que se ven en el módulo Tareas del CRM.',
    points: [
      'Los socios pueden poner tareas a cualquiera del equipo y a ellos mismos.',
      'Cada persona del equipo gestiona las suyas.',
      'Al asignar o mover una tarea, avisa por WhatsApp a quien corresponda.',
    ],
  },
  {
    id: 'retencion', label: 'Retención', sub: 'incidencias, vigilancia, tickets', x: 220, y: 50, icon: AlertTriangle, tone: 'herramienta',
    title: 'Retención',
    text: 'Lo que pasa con los proyectos en producción de cada cliente.',
    points: [
      'Incidencias que mandan los sistemas de los clientes.',
      'Informes de vigilancia del sistema y flujos de Sistema.',
      'Tickets de los clientes.',
    ],
  },
  {
    id: 'avisos', label: 'Avisos y memoria', sub: 'recordatorios e instrucciones', x: 220, y: 200, icon: BellRing, tone: 'herramienta',
    title: 'Avisos y memoria',
    text: 'Lo que el agente recuerda y lo que manda sin que se lo pidas en ese momento.',
    points: [
      'Avisos programados: «cada lunes a las 9 mis tareas».',
      'Avisos automáticos: tareas que vencen, incidencias, tickets asignados.',
      'Historial de cada conversación e instrucciones personales de cada uno.',
    ],
  },
  {
    id: 'mcpclientes', label: 'MCP de los clientes', sub: 'solo lectura', x: 520, y: 50, icon: Plug, tone: 'mcp',
    title: 'MCP de los clientes',
    text: 'El servidor de consulta de cada cliente: sus llamadas, leads, costes, conversaciones…',
    points: [
      'Se conecta en Retención → proyecto → MCP.',
      'Solo se usa si todas sus herramientas son de lectura (se comprueba al conectar y antes de cada uso).',
      'Lo usan los dos agentes, los flujos de Sistema y el informe del sistema.',
    ],
  },
  {
    id: 'respuesta', label: 'Respuesta', sub: 'texto, documentos, avisos', x: 520, y: -150, icon: Send, tone: 'salida',
    title: 'Respuesta',
    text: 'El agente contesta por el mismo canal por el que le escribieron.',
    points: [
      'Respuestas cortas en texto plano.',
      'Listados largos y exportaciones como documento adjunto.',
      'Los flujos de Sistema pueden mandar su informe en PDF con el estilo Buffalo.',
    ],
  },
  {
    id: 'claude', label: 'Claude Code / Cursor', sub: 'en el ordenador', x: -660, y: 380, icon: Monitor, tone: 'canal',
    title: 'Claude Code o Cursor',
    text: 'Developers y socios pueden trabajar con el CRM desde su ordenador con Claude.',
    points: ['No pasa por WhatsApp ni por el agente: se conecta al MCP del CRM.'],
  },
  {
    id: 'mcpcrm', label: 'MCP del CRM', sub: 'mcp/buffalo-crm', x: -370, y: 380, icon: Server, tone: 'mcp',
    title: 'MCP del CRM',
    text: 'Servidor MCP propio del CRM para usarlo desde Claude Code o Cursor.',
    points: [
      'Leer, escribir y borrar en la base de datos del CRM.',
      'Borrar o SQL destructivo exigen doble confirmación con un código que caduca a los 10 minutos.',
      'Se arranca en local con npm run mcp:crm.',
    ],
  },
  {
    id: 'flujos', label: 'Flujos de Sistema', sub: 'Retención → Sistema', x: 220, y: 380, icon: Workflow, tone: 'herramienta',
    title: 'Flujos de Sistema',
    text: 'Agentes programados por proyecto: un prompt, herramientas y salida en JSON.',
    points: [
      'Usan el MCP del cliente, las incidencias y los tickets.',
      'Se ejecutan a mano o cada cierto tiempo.',
      'Pueden mandar el resultado en PDF por WhatsApp.',
    ],
  },
]

const EDGES: [NodeId, NodeId][] = [
  ['whatsapp', 'router'],
  ['telegram', 'router'],
  ['router', 'socios'],
  ['router', 'equipo'],
  ['socios', 'crmdb'],
  ['socios', 'tareas'],
  ['socios', 'retencion'],
  ['socios', 'avisos'],
  ['equipo', 'tareas'],
  ['equipo', 'retencion'],
  ['equipo', 'avisos'],
  ['retencion', 'mcpclientes'],
  ['socios', 'respuesta'],
  ['claude', 'mcpcrm'],
  ['mcpcrm', 'crmdb'],
  ['flujos', 'mcpclientes'],
]

const LANES = [
  { label: 'Por WhatsApp y Telegram', y: -330 },
  { label: 'Desde el ordenador y automático', y: 300 },
]

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

function edgePath(a: DiagramNode, b: DiagramNode): string {
  const x1 = a.x + 98
  const x2 = b.x - 104
  const mid = (x1 + x2) / 2
  return `M ${x1} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${x2} ${b.y}`
}

export default function AgentDiagram() {
  const stageRef = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState({ x: 0, y: 0, scale: 0.7 })
  const pan = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const [selected, setSelected] = useState<NodeId | null>(null)
  const [recenter, setRecenter] = useState(0)

  useEffect(() => {
    const el = stageRef.current
    const w = el?.clientWidth || 1000
    const h = el?.clientHeight || 700
    setCam({ x: 0, y: -30, scale: clamp(Math.min((w - 48) / 1420, (h - 48) / 820), 0.35, 1) })
  }, [recenter])

  const related = (id: NodeId) =>
    selected === null || selected === id || EDGES.some(([a, b]) => (a === selected && b === id) || (b === selected && a === id))

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement
    if (t.closest('[data-hud]') || t.closest('[data-sheet]') || t.closest('[data-node]')) return
    pan.current = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y }
    setPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = pan.current
    if (!p) return
    setCam((c) => ({ ...c, x: p.camX + (e.clientX - p.x), y: p.camY + (e.clientY - p.y) }))
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    pan.current = null
    setPanning(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-sheet],[data-hud]')) return
    setCam((c) => ({ ...c, scale: clamp(c.scale * (e.deltaY > 0 ? 0.92 : 1.08), 0.35, 1.6) }))
  }

  const node = NODES.find((n) => n.id === selected) || null

  return (
    <div
      ref={stageRef}
      className={`${styles.stage} ${panning ? styles.stagePanning : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div className={styles.world} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})` }}>
        <div className={styles.grid} />
        {LANES.map((l) => (
          <div
            key={l.label}
            style={{ position: 'absolute', left: -760, top: l.y, width: 1520, borderTop: '1px dashed #d4d4d8', paddingTop: 10 }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
              {l.label}
            </span>
          </div>
        ))}
        <svg className={styles.wires} viewBox="-2400 -2400 4800 4800">
          <defs>
            <marker id="ad-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#111827" />
            </marker>
            <marker id="ad-arrow-dim" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#d4d4d8" />
            </marker>
          </defs>
          {EDGES.map(([from, to]) => {
            const a = NODES.find((n) => n.id === from)!
            const b = NODES.find((n) => n.id === to)!
            const lit = selected === null || selected === from || selected === to
            return (
              <path
                key={`${from}-${to}`}
                d={edgePath(a, b)}
                fill="none"
                stroke={lit ? '#111827' : '#e4e4e7'}
                strokeWidth={lit ? 1.8 : 1.2}
                strokeLinecap="round"
                markerEnd={lit ? 'url(#ad-arrow)' : 'url(#ad-arrow-dim)'}
              />
            )
          })}
        </svg>
        {NODES.map((n) => {
          const Icon = n.icon
          const tone = TONE[n.tone]
          return (
            <button
              key={n.id}
              type="button"
              data-node={n.id}
              onClick={() => setSelected(selected === n.id ? null : n.id)}
              className={`${styles.node} ${selected === n.id ? styles.selected : ''}`}
              style={{ transform: `translate(${n.x}px, ${n.y}px)`, opacity: related(n.id) ? 1 : 0.35 }}
            >
              <span className={styles.icon} style={{ background: tone.bg, color: tone.fg }}>
                <Icon className="h-4 w-4" />
              </span>
              <span className={styles.copy}>
                <span className={styles.title}>{n.label}</span>
                <span className={styles.sub}>{n.sub}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className={styles.hud} data-hud style={{ top: 16, left: 16 }}>
        <button type="button" className={styles.hudBtn} onClick={() => setRecenter((n) => n + 1)}>
          <Focus className="h-3.5 w-3.5" /> Recentrar
        </button>
        {(Object.keys(TONE) as DiagramNode['tone'][]).map((t) => (
          <span key={t} className={styles.hudBtn} style={{ pointerEvents: 'none' }}>
            <span style={{ width: 10, height: 10, borderRadius: 4, background: TONE[t].bg, border: `1.5px solid ${TONE[t].fg}` }} />
            {TONE[t].label}
          </span>
        ))}
      </div>

      {node && (
        <aside className={styles.sheet} data-sheet onPointerDown={(e) => e.stopPropagation()}>
          <div className={styles.sheetHead}>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{TONE[node.tone].label}</p>
              <h2 className="text-[15px] font-semibold text-gray-900">{node.title}</h2>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-gray-50 text-gray-500"
              onClick={() => setSelected(null)}
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className={styles.sheetBody}>
            <p className="text-sm leading-relaxed text-gray-700">{node.text}</p>
            <ul className="space-y-2">
              {node.points.map((p) => (
                <li key={p} className="flex gap-2 text-sm leading-relaxed text-gray-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  {p}
                </li>
              ))}
            </ul>
            <div className="border-t border-gray-100 pt-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Conectado con</p>
              <div className="flex flex-wrap gap-1.5">
                {EDGES.filter(([a, b]) => a === node.id || b === node.id).map(([a, b]) => {
                  const other = NODES.find((n) => n.id === (a === node.id ? b : a))!
                  return (
                    <button
                      key={other.id}
                      type="button"
                      onClick={() => setSelected(other.id)}
                      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200"
                    >
                      {other.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </aside>
      )}

      <p className={styles.hint}>Arrastra el lienzo · rueda para acercar · clic en una caja para ver qué hace</p>
    </div>
  )
}
