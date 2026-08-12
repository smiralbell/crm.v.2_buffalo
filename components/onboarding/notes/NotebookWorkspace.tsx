'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Search,
  MessageCircleQuestion,
  CheckSquare,
  CalendarDays,
} from 'lucide-react'
import type {
  ProjectNote,
  ProjectResearch,
  ProjectResearchData,
  NoteType,
} from '@/lib/onboarding/notes/types'
import { TOPICS, type CopilotQuestion } from '@/lib/onboarding/notes/topics'
import {
  ATAJOS,
  atTokenAtCaret,
  buildHighlightHtml,
  caretXY,
  filterAtajos,
  isoToday,
  labelDate,
  typeLabel,
  wordCount,
  type AtajoIcon,
} from '@/lib/onboarding/notes/ui-helpers'

function AtajoIconView({ icon }: { icon: AtajoIcon }) {
  const props = { strokeWidth: 2, 'aria-hidden': true as const }
  if (icon === 'search') return <Search {...props} />
  if (icon === 'message') return <MessageCircleQuestion {...props} />
  if (icon === 'check') return <CheckSquare {...props} />
  return <CalendarDays {...props} />
}

type Props = {
  leadId: number
  clientLabel: string
  projectTitle?: string | null
}

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

const SAVE_MS = 800
const COPILOT_MS = 4000
const COPILOT_MIN_GROWTH = 120

export default function NotebookWorkspace({
  leadId,
  clientLabel,
  projectTitle,
}: Props) {
  const [notes, setNotes] = useState<ProjectNote[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [research, setResearch] = useState<ProjectResearch | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saveTick, setSaveTick] = useState(0)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [thinking, setThinking] = useState(false)
  const [cubiertos, setCubiertos] = useState<string[]>([])
  const [preguntas, setPreguntas] = useState<CopilotQuestion[]>([])
  const [dossierOpen, setDossierOpen] = useState(false)
  const [researchOpen, setResearchOpen] = useState(false)
  const [researchUrl, setResearchUrl] = useState('')
  const [researching, setResearching] = useState(false)
  const [researchSteps, setResearchSteps] = useState<
    Array<{ label: string; done: boolean }>
  >([])
  const [researchError, setResearchError] = useState<string | null>(null)
  const [panel, setPanel] = useState<{
    title: string
    sub: string
    html: string
    plain: string
    confirmApply?: boolean
  } | null>(null)
  const [atOpen, setAtOpen] = useState(false)
  const [atSel, setAtSel] = useState(0)
  const [atQuery, setAtQuery] = useState('')
  const [atPos, setAtPos] = useState<{ left: number; top: number } | null>(null)
  const [applyingDef, setApplyingDef] = useState(false)
  const [draftingDef, setDraftingDef] = useState(false)
  const [insightsLoading, setInsightsLoading] = useState(false)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const hlRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copilotTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCopilotLen = useRef(0)
  const pendingPatch = useRef<Partial<ProjectNote> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRef = useRef(notes)
  notesRef.current = notes

  const current = notes.find((n) => n.id === currentId) || null
  const coveredSet = useMemo(() => new Set(cubiertos), [cubiertos])
  const pct = Math.round((coveredSet.size / TOPICS.length) * 100)
  const atItems = filterAtajos(atQuery)

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2100)
  }, [])

  const paintHighlight = useCallback(() => {
    const el = taRef.current
    const capa = hlRef.current
    if (!el || !capa) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    capa.innerHTML = buildHighlightHtml(el.value)
    capa.scrollTop = el.scrollTop
  }, [])

  const flushSave = useCallback(async () => {
    const id = currentId
    const patch = pendingPatch.current
    if (!id || !patch) return
    pendingPatch.current = null
    setSaveState('saving')
    try {
      const res = await fetch(
        `/api/onboarding/projects/${leadId}/notes/${id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: patch.title,
            body: patch.body,
            type: patch.type,
            note_date: patch.note_date,
          }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      if (data.note) {
        setNotes((prev) =>
          prev.map((n) => (n.id === data.note.id ? data.note : n))
        )
      }
      setSavedAt(Date.now())
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      toast(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }, [currentId, leadId, toast])

  const scheduleSave = useCallback(
    (patch: Partial<ProjectNote>) => {
      pendingPatch.current = { ...(pendingPatch.current || {}), ...patch }
      setSaveState('dirty')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flushSave(), SAVE_MS)
    },
    [flushSave]
  )

  const runCopilot = useCallback(
    async (force = false) => {
      setThinking(true)
      try {
        const notesText = notesRef.current
          .filter((n) => n.type !== 'definicion')
          .map((n) => n.body)
          .join('\n\n')
        const hash = `${leadId}:${notesText.length}:${notesRef.current
          .map((n) => n.updated_at)
          .join('|')}`
        const res = await fetch(
          `/api/onboarding/projects/${leadId}/notes-copilot`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force, content_hash: hash }),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Error del copiloto')
        setCubiertos(Array.isArray(data.cubiertos) ? data.cubiertos : [])
        setPreguntas(Array.isArray(data.preguntas) ? data.preguntas : [])
        lastCopilotLen.current = notesText.length
      } catch (e) {
        console.warn(e)
      } finally {
        setThinking(false)
      }
    },
    [leadId]
  )

  const scheduleCopilot = useCallback(
    (force = false) => {
      if (copilotTimer.current) clearTimeout(copilotTimer.current)
      setThinking(true)
      copilotTimer.current = setTimeout(() => {
        const len = notesRef.current
          .filter((n) => n.type !== 'definicion')
          .map((n) => n.body)
          .join('\n\n').length
        const growth = Math.abs(len - lastCopilotLen.current)
        if (!force && growth < COPILOT_MIN_GROWTH && lastCopilotLen.current > 0) {
          setThinking(false)
          return
        }
        void runCopilot(force)
      }, force ? 200 : COPILOT_MS)
    },
    [runCopilot]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [notesRes, researchRes] = await Promise.all([
          fetch(`/api/onboarding/projects/${leadId}/notes`),
          fetch(`/api/onboarding/projects/${leadId}/research`),
        ])
        const notesData = await notesRes.json()
        const researchData = await researchRes.json()
        if (!notesRes.ok) throw new Error(notesData.error || 'Error cargando notas')
        if (cancelled) return
        let list: ProjectNote[] = notesData.notes || []
        if (!list.length) {
          const created = await fetch(`/api/onboarding/projects/${leadId}/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'reunion',
              title: 'Primera reunión',
              body: '',
            }),
          })
          const c = await created.json()
          if (created.ok && c.note) list = [c.note]
        }
        setNotes(list)
        setCurrentId(list[0]?.id || null)
        setResearch(researchData.research || null)
        lastCopilotLen.current = 0
        setTimeout(() => void runCopilot(true), 400)
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Error de carga')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [leadId, runCopilot])

  useEffect(() => {
    paintHighlight()
  }, [current?.body, currentId, paintHighlight])

  useEffect(() => {
    const t = setInterval(() => setSaveTick((x) => x + 1), 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (copilotTimer.current) clearTimeout(copilotTimer.current)
    }
  }, [])

  const updateCurrent = useCallback(
    (patch: Partial<ProjectNote>, opts?: { copilot?: boolean }) => {
      if (!currentId) return
      setNotes((prev) =>
        prev.map((n) => (n.id === currentId ? { ...n, ...patch } : n))
      )
      scheduleSave(patch)
      if (opts?.copilot !== false && ('body' in patch || 'type' in patch)) {
        scheduleCopilot(false)
      }
    },
    [currentId, scheduleSave, scheduleCopilot]
  )

  const syncAt = useCallback(() => {
    const el = taRef.current
    if (!el) {
      setAtOpen(false)
      return false
    }
    const tok = atTokenAtCaret(el.value, el.selectionStart)
    if (!tok) {
      setAtOpen(false)
      return false
    }
    setAtOpen(true)
    setAtQuery(tok.query)
    setAtSel(0)
    const { x, y } = caretXY(el)
    const below = y + 22
    setAtPos({
      left: Math.min(x, window.innerWidth - 300),
      top: below + 210 > window.innerHeight ? Math.max(8, y - 216) : below,
    })
    return true
  }, [])

  const stripAtToken = useCallback(() => {
    const el = taRef.current
    if (!el || !current) return
    const tok = atTokenAtCaret(el.value, el.selectionStart)
    if (!tok) return
    const next =
      el.value.slice(0, tok.start) + el.value.slice(el.selectionStart)
    el.value = next
    el.selectionStart = el.selectionEnd = tok.start
    updateCurrent({ body: next })
    setAtOpen(false)
  }, [current, updateCurrent])

  const insertAtCursor = useCallback(
    (text: string) => {
      const el = taRef.current
      if (!el || !current) return
      const p = el.selectionStart
      const next = el.value.slice(0, p) + text + el.value.slice(p)
      el.value = next
      el.selectionStart = el.selectionEnd = p + text.length
      updateCurrent({ body: next })
      requestAnimationFrame(paintHighlight)
    },
    [current, updateCurrent, paintHighlight]
  )

  const insertResearchIntoNote = useCallback(
    (noteText: string) => {
      const el = taRef.current
      if (!el || !current) return
      const pos =
        typeof el.selectionStart === 'number'
          ? el.selectionStart
          : el.value.length
      const antes = el.value.slice(0, pos).replace(/\s+$/, '')
      const despues = el.value.slice(pos).replace(/^\s+/, '')
      const next = [antes, noteText, despues].filter(Boolean).join('\n\n')
      el.value = next
      const cursor = (antes ? antes.length + 2 : 0) + noteText.length
      el.selectionStart = el.selectionEnd = cursor
      updateCurrent({ body: next }, { copilot: true })
      requestAnimationFrame(paintHighlight)
      el.focus()
    },
    [current, updateCurrent, paintHighlight]
  )

  const runAtajo = useCallback(
    (id: string) => {
      stripAtToken()
      setAtOpen(false)
      if (id === 'investigar') {
        setResearchUrl(research?.url || '')
        setResearchError(null)
        setResearchSteps([])
        setResearchOpen(true)
        return
      }
      if (id === 'fecha') {
        insertAtCursor(
          new Date().toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        )
        taRef.current?.focus()
        return
      }
      if (id === 'accion') {
        insertAtCursor('[ ] ')
        taRef.current?.focus()
        return
      }
      if (id === 'pregunta') {
        if (!preguntas.length) {
          toast('No hay preguntas pendientes')
          return
        }
        insertAtCursor('— ' + preguntas[0].texto + '\n')
        taRef.current?.focus()
      }
    },
    [stripAtToken, research, insertAtCursor, preguntas, toast]
  )

  const doResearch = useCallback(async () => {
    if (researching) return
    const raw = researchUrl.trim()
    if (!raw || !raw.includes('.')) {
      toast('Escribe una web válida, p. ej. clinicavall.com')
      return
    }
    setResearching(true)
    setResearchError(null)
    const pasos = [
      'Descargando la home',
      'Siguiendo enlaces internos',
      'Extrayendo secciones',
      'Detectando canales y tecnología',
      'Redactando los ganchos',
    ]
    setResearchSteps(pasos.map((label) => ({ label, done: false })))
    let vivo = true
    ;(async () => {
      for (let i = 0; i < pasos.length - 1; i++) {
        if (!vivo) return
        await new Promise((r) => setTimeout(r, 700))
        if (!vivo) return
        setResearchSteps((prev) =>
          prev.map((s, idx) => (idx <= i ? { ...s, done: true } : s))
        )
      }
    })()
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: raw }),
      })
      const data = await res.json()
      vivo = false
      setResearchSteps((prev) => prev.map((s) => ({ ...s, done: true })))
      if (!res.ok || data.error) {
        setResearchError(data.error || 'No he podido investigar esa web')
        setResearching(false)
        return
      }
      setResearch(data.research)
      setResearchOpen(false)
      setResearching(false)
      if (data.noteText) insertResearchIntoNote(data.noteText)
      scheduleCopilot(true)
      const nombre =
        (data.research?.data as ProjectResearchData | undefined)?.nombre ||
        'cliente'
      toast('Investigación de ' + nombre + ' añadida a la nota')
    } catch (e) {
      vivo = false
      setResearching(false)
      setResearchError(
        e instanceof Error ? e.message : 'Error contactando con el servidor'
      )
    }
  }, [
    researching,
    researchUrl,
    leadId,
    insertResearchIntoNote,
    scheduleCopilot,
    toast,
  ])

  const openInsights = useCallback(
    async (kind: 'context' | 'diagnosis') => {
      setInsightsLoading(true)
      setPanel({
        title: kind === 'context' ? 'Contexto del proyecto' : 'Diagnóstico',
        sub:
          kind === 'context'
            ? 'La IA sintetiza de qué trata el proyecto a partir de todas las notas.'
            : 'Lectura crítica de lo que sabes y lo que aún desbloquea la propuesta.',
        html: `<div style="padding:28px;text-align:center;color:var(--muted);font-size:12.5px">Analizando el cuaderno…</div>`,
        plain: '',
      })
      try {
        const res = await fetch(
          `/api/onboarding/projects/${leadId}/notes-insights`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind }),
          }
        )
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'No se pudo generar')
        if (kind === 'context') {
          const txt = String(data.context || '')
          setPanel({
            title: 'Contexto del proyecto',
            sub:
              data.source === 'llm'
                ? 'Síntesis de la IA a partir de tus notas. Esto es lo que debería alimentar la propuesta.'
                : 'Resumen provisional (faltan notas o la IA no respondió).',
            html: `<div style="white-space:pre-wrap;font-size:13px;line-height:1.65;color:var(--ink-2)">${txt
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')}</div>`,
            plain: txt,
          })
        } else {
          setPanel({
            title: 'Diagnóstico de conocimiento',
            sub: 'Qué tan listo estás para redactar y qué preguntar ahora.',
            html: String(data.diagnosis_html || ''),
            plain: String(data.diagnosis_plain || ''),
          })
        }
      } catch (e) {
        setPanel(null)
        toast(e instanceof Error ? e.message : 'Error al analizar')
      } finally {
        setInsightsLoading(false)
      }
    },
    [leadId, toast]
  )

  const buildContexto = useCallback(() => {
    const partes: string[] = []
    partes.push(
      `# CLIENTE\n${clientLabel}${projectTitle ? ' · ' + projectTitle : ''}`
    )
    if (research?.data) {
      const r = research.data
      partes.push(
        `# INVESTIGACIÓN DE SU WEB (${r.origen || 'scraping'})\n` +
          `Empresa: ${r.nombre}\n` +
          `Sector: ${r.sector}\n` +
          `Qué hacen: ${r.hace}\n` +
          `Servicios: ${(r.servicios || []).join(', ')}\n` +
          `Señales: ${(r.senales || []).join(' · ')}\n` +
          `Fuentes: ${(r.fuentes || []).join(', ')}`
      )
    }
    const def = notes.find((n) => n.type === 'definicion' && n.body.trim())
    if (def) partes.push('# DEFINICIÓN DEL PROYECTO\n' + def.body.trim())
    const reuniones = notes.filter(
      (n) => n.type !== 'definicion' && n.body.trim()
    )
    if (reuniones.length) {
      partes.push(
        '# NOTAS DEL CUADERNO\n' +
          reuniones
            .map(
              (n) =>
                `## ${n.title || 'Sin título'} (${n.note_date})\n${n.body.trim()}`
            )
            .join('\n\n')
      )
    }
    const faltan = TOPICS.filter((t) => !coveredSet.has(t.id)).map(
      (t) => t.label
    )
    if (faltan.length) {
      partes.push(
        '# AÚN NO PREGUNTADO (no inventes esto)\n' +
          faltan.map((f) => '- ' + f).join('\n')
      )
    }
    return partes.join('\n\n─────\n\n')
  }, [clientLabel, projectTitle, research, notes, coveredSet])

  const applyDefinitionToCrm = useCallback(async () => {
    const def = notes.find((n) => n.type === 'definicion')
    if (!def?.body.trim()) {
      toast('Primero escribe la nota de tipo «Definición»')
      return
    }
    setApplyingDef(true)
    try {
      const res = await fetch(`/api/onboarding/projects/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_definition: def.body.trim(),
          project_context: buildContexto(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      setPanel(null)
      toast('Definición guardada en el proyecto')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al guardar definición')
    } finally {
      setApplyingDef(false)
    }
  }, [notes, leadId, buildContexto, toast])

  const draftDefinition = useCallback(async () => {
    setDraftingDef(true)
    try {
      const res = await fetch(
        `/api/onboarding/projects/${leadId}/notes-draft-definition`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al redactar')
      if (!current || current.type !== 'definicion') {
        toast('Abre la nota de tipo Definición')
        return
      }
      updateCurrent({ body: data.definition || '' }, { copilot: false })
      if (taRef.current) {
        taRef.current.value = data.definition || ''
        requestAnimationFrame(paintHighlight)
      }
      toast('Borrador redactado desde tus notas')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Error al redactar')
    } finally {
      setDraftingDef(false)
    }
  }, [leadId, current, updateCurrent, paintHighlight, toast])

  const saveLabel = (() => {
    void saveTick
    if (saveState === 'saving' || saveState === 'dirty') return 'Guardando…'
    if (saveState === 'error') return 'No se pudo guardar'
    if (!savedAt) return 'Guardado'
    const seg = Math.round((Date.now() - savedAt) / 1000)
    if (seg < 3) return 'Guardado'
    if (seg < 60) return `Guardado hace ${seg}s`
    return `Guardado hace ${Math.round(seg / 60)} min`
  })()

  const notesByDate = useMemo(() => {
    const by: Record<string, ProjectNote[]> = {}
    for (const n of [...notes].sort((a, b) =>
      b.note_date.localeCompare(a.note_date)
    )) {
      ;(by[n.note_date] ||= []).push(n)
    }
    return Object.entries(by)
  }, [notes])

  if (loading) {
    return (
      <div className="notebook-app" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ color: 'var(--muted)' }}>Cargando cuaderno…</div>
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="notebook-app" style={{ display: 'grid', placeItems: 'center' }}>
        <div style={{ color: '#b91c1c' }}>{loadError}</div>
      </div>
    )
  }

  return (
    <div className="notebook-app">
      <div className="app">
        <header className="topbar">
          <div>
            <h1>
              {clientLabel}
              {projectTitle ? (
                <>
                  {' '}
                  · <span>{projectTitle}</span>
                </>
              ) : null}
            </h1>
            <div className="sub">Onboarding · Notas del proyecto</div>
          </div>
          <div className="spacer" />
          <span className="badge">{notes.length} notas</span>
          <span className="badge" title="Investigación web real vía scrape">
            scraping real
          </span>
          <button
            type="button"
            className="btn"
            disabled={insightsLoading}
            onClick={() => void openInsights('context')}
          >
            {insightsLoading ? 'Analizando…' : 'Ver contexto'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={insightsLoading}
            onClick={() => void openInsights('diagnosis')}
          >
            Diagnóstico
          </button>
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => {
              const def = notes.find((n) => n.type === 'definicion')
              if (!def?.body.trim()) {
                toast('Primero escribe la nota de tipo «Definición»')
                const vacia = notes.find((n) => n.type === 'definicion')
                if (vacia) setCurrentId(vacia.id)
                return
              }
              setPanel({
                title: 'Usar como definición del proyecto',
                sub: 'Esto sobrescribe la definición del proyecto en el CRM (propuesta y contrato). Confirma antes de continuar.',
                html: `<div style="padding:11px 13px;border-radius:12px;background:var(--accent-soft);border:1px solid var(--accent-line);font-size:11.5px;color:#065f46;margin-bottom:12px">
                  Destino: <strong>${clientLabel} → campo «definición»</strong><br>
                  ${wordCount(def.body)} palabras
                </div>
                <pre style="white-space:pre-wrap;font-size:11.5px;line-height:1.6;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--ink-2)">${def.body
                  .trim()
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')}</pre>`,
                plain: def.body.trim(),
                confirmApply: true,
              })
            }}
          >
            Usar como definición del proyecto
          </button>
        </header>

        <div className="grid">
          <aside className="panel">
            <div className="panel-head">
              <span className="panel-title">Cuaderno</span>
            </div>
            <div className="scroll">
              {notesByDate.map(([date, items]) => (
                <div className="note-group" key={date}>
                  <div className="note-group-label">{labelDate(date)}</div>
                  {items.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className={`note-item${n.id === currentId ? ' active' : ''}`}
                      onClick={() => {
                        void flushSave()
                        setCurrentId(n.id)
                      }}
                    >
                      <span className="t">{n.title || 'Sin título'}</span>
                      <span className="d">
                        <i className={`dot ${n.type}`} />
                        {typeLabel(n.type)} · {wordCount(n.body)} palabras
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="new-note"
              onClick={async () => {
                await flushSave()
                const res = await fetch(
                  `/api/onboarding/projects/${leadId}/notes`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 'reunion',
                      note_date: isoToday(),
                      title: '',
                      body: '',
                    }),
                  }
                )
                const data = await res.json()
                if (!res.ok) {
                  toast(data.error || 'No se pudo crear')
                  return
                }
                setNotes((prev) => [data.note, ...prev])
                setCurrentId(data.note.id)
              }}
            >
              + Nueva nota (hoy)
            </button>
          </aside>

          <main className="panel">
            {current ? (
              <>
                <div className="editor-head">
                  <input
                    className="note-title"
                    value={current.title}
                    placeholder="Título de la nota"
                    onChange={(e) =>
                      updateCurrent({ title: e.target.value }, { copilot: false })
                    }
                  />
                  <div className="note-meta">
                    <span>{labelDate(current.note_date)}</span>
                    <span>·</span>
                    <div className="type-pick">
                      {(['reunion', 'libre', 'definicion'] as NoteType[]).map(
                        (t) => (
                          <button
                            key={t}
                            type="button"
                            className={current.type === t ? 'on' : ''}
                            onClick={() => updateCurrent({ type: t })}
                          >
                            {typeLabel(t)}
                          </button>
                        )
                      )}
                    </div>
                    <span>·</span>
                    <span
                      className="save-state"
                      style={
                        saveState === 'error' ? { color: '#b91c1c' } : undefined
                      }
                    >
                      {saveLabel}
                    </span>
                    <span>·</span>
                    <span>{wordCount(current.body)} palabras</span>
                    <button
                      type="button"
                      className="at-btn"
                      title="Atajos: también puedes escribir @ en la nota"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        const el = taRef.current
                        if (!el) return
                        el.focus()
                        const pos = el.selectionStart
                        const antes = el.value.slice(0, pos)
                        const sep =
                          antes && /[A-Za-zÀ-ÿ0-9]$/.test(antes) ? ' ' : ''
                        const next =
                          antes + sep + '@' + el.value.slice(pos)
                        el.value = next
                        el.selectionStart = el.selectionEnd =
                          pos + sep.length + 1
                        updateCurrent({ body: next }, { copilot: false })
                        syncAt()
                      }}
                    >
                      <span className="at-btn-sign">@</span> Atajos
                    </button>
                  </div>
                </div>

                {current.type === 'definicion' ? (
                  <div className="def-actions">
                    <p>
                      <strong>Definición del proyecto.</strong> Esta es la
                      página que alimenta la propuesta y el contrato. Puedes
                      redactarla a mano o partir de lo que ya has apuntado en
                      las notas de reunión.
                    </p>
                    <button
                      type="button"
                      className="btn btn-accent"
                      disabled={draftingDef}
                      onClick={() => void draftDefinition()}
                    >
                      {draftingDef
                        ? 'Redactando…'
                        : 'Redactar desde mis notas'}
                    </button>
                  </div>
                ) : null}

                <div className="editor-body">
                  <div className="note-wrap">
                    <div
                      className="note-hl"
                      ref={hlRef}
                      aria-hidden="true"
                    />
                    <textarea
                      ref={taRef}
                      className="note-text"
                      spellCheck={false}
                      defaultValue={current.body}
                      key={current.id}
                      placeholder={
                        current.type === 'definicion'
                          ? 'Redacta aquí el proyecto tal y como lo has entendido…\n\nEsto es lo que se usará para generar la propuesta comercial.'
                          : 'Escribe aquí lo que se va diciendo…\n\nNo hace falta orden ni formato. Según escribas, el copiloto de la derecha te irá proponiendo qué preguntar.'
                      }
                      onInput={(e) => {
                        const v = (e.target as HTMLTextAreaElement).value
                        updateCurrent({ body: v })
                        paintHighlight()
                        if (syncAt()) return
                      }}
                      onScroll={() => {
                        if (hlRef.current && taRef.current) {
                          hlRef.current.scrollTop = taRef.current.scrollTop
                        }
                      }}
                      onClick={() => {
                        if (atOpen) syncAt()
                      }}
                      onKeyUp={() => {
                        if (atOpen) syncAt()
                      }}
                      onKeyDown={(e) => {
                        if (!atOpen) return
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          setAtSel((s) => (s + 1) % Math.max(atItems.length, 1))
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          setAtSel(
                            (s) =>
                              (s - 1 + Math.max(atItems.length, 1)) %
                              Math.max(atItems.length, 1)
                          )
                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                          if (!atItems.length) {
                            setAtOpen(false)
                            return
                          }
                          e.preventDefault()
                          runAtajo(atItems[atSel]?.id || ATAJOS[0].id)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          setAtOpen(false)
                        }
                      }}
                      onBlur={() => setTimeout(() => setAtOpen(false), 120)}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="empty">Crea una nota para empezar.</div>
            )}
          </main>

          <aside className="panel">
            <div className="panel-head">
              <span className="panel-title">Qué preguntar</span>
              {thinking ? (
                <span className="thinking">
                  <i className="pulse" />
                  leyendo tus notas
                </span>
              ) : (
                <button
                  type="button"
                  className="btn"
                  style={{ height: 26, fontSize: 10.5, padding: '0 10px' }}
                  onClick={() => void runCopilot(true)}
                >
                  Actualizar
                </button>
              )}
            </div>
            <div className="coverage-bar">
              <div className="bar">
                <i style={{ width: pct + '%' }} />
              </div>
              <div className="bar-label">
                <span>
                  {current?.body.trim()
                    ? `${coveredSet.size} de ${TOPICS.length} temas cubiertos`
                    : 'Sin notas todavía'}
                </span>
                <span>{pct}%</span>
              </div>
            </div>
            <div className="coverage">
              {TOPICS.map((t) => (
                <span
                  key={t.id}
                  className={`chip${coveredSet.has(t.id) ? ' on' : ''}`}
                >
                  {t.label}
                </span>
              ))}
            </div>

            {research?.data ? (
              <div className="dossier">
                <button
                  type="button"
                  className="dossier-head"
                  onClick={() => setDossierOpen((v) => !v)}
                >
                  <span className="nm">
                    {research.data.nombre} · {research.data.sector}
                  </span>
                  <span className="sim">web</span>
                  <span className="cv">{dossierOpen ? '▴' : '▾'}</span>
                </button>
                <div className={`dossier-body${dossierOpen ? ' on' : ''}`}>
                  <div className="d-row">
                    <div className="d-k">Quiénes son</div>
                    <div className="d-v">{research.data.hace}</div>
                  </div>
                  {(research.data.servicios || []).length ? (
                    <div className="d-row">
                      <div className="d-k">Qué ofrecen</div>
                      <div className="d-v">
                        <ul>
                          {research.data.servicios.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                  {(research.data.senales || []).length ? (
                    <div className="d-row">
                      <div className="d-k">En la web se ve</div>
                      <div className="d-v">
                        <ul>
                          {research.data.senales.slice(0, 6).map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                  <div className="d-acts">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch(
                          `/api/onboarding/projects/${leadId}/research`
                        )
                        const data = await res.json()
                        if (data.noteText) insertResearchIntoNote(data.noteText)
                        toast('Insertada otra vez en la nota')
                      }}
                    >
                      Insertar en la nota
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResearchUrl(research.url)
                        setResearchOpen(true)
                      }}
                    >
                      Volver a investigar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await fetch(
                          `/api/onboarding/projects/${leadId}/research`,
                          { method: 'DELETE' }
                        )
                        setResearch(null)
                        scheduleCopilot(true)
                        toast('Ficha eliminada')
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="scroll">
              <div className="q-list">
                {!preguntas.length ? (
                  <div className="empty">
                    Has cubierto todos los temas del guion.
                    <br />
                    Buena reunión.
                  </div>
                ) : (
                  preguntas.map((item, i) => (
                    <div
                      key={i}
                      className={`q${item.tipo === 'hueco' ? ' gap' : ''}${
                        item.tipo === 'web' ? ' web' : ''
                      }`}
                      style={{ animationDelay: `${i * 22}ms` }}
                    >
                      <div className="text">{item.texto}</div>
                      <div className="acts">
                        <button
                          type="button"
                          onClick={() => {
                            insertAtCursor('\n\n— ' + item.texto + '\n')
                            toast('Añadido a la nota')
                          }}
                        >
                          Apuntar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(item.texto)
                            toast('Copiado')
                          }}
                        >
                          Copiar
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div className="hint-foot">
              Preguntas afiladas según tus notas. En ámbar: lo que aún no has tocado.
            </div>
          </aside>
        </div>
      </div>

      <div
        className={`at-menu${atOpen ? ' on' : ''}`}
        style={
          atPos
            ? { left: atPos.left, top: atPos.top, display: atOpen ? 'block' : undefined }
            : undefined
        }
      >
        <div className="at-head">Atajos</div>
        {atItems.length ? (
          atItems.map((a, i) => (
            <button
              key={a.id}
              type="button"
              className={`at-item${i === atSel ? ' sel' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                runAtajo(a.id)
              }}
            >
              <span className="at-ico">
                <AtajoIconView icon={a.icon} />
              </span>
              <span>
                <span className="n">{a.n}</span>
                <span className="h">{a.h}</span>
              </span>
            </button>
          ))
        ) : (
          <div className="at-empty">Nada coincide con «{atQuery}»</div>
        )}
      </div>

      <div
        className={`veil${researchOpen ? ' on' : ''}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).classList.contains('veil') && !researching) {
            setResearchOpen(false)
          }
        }}
      >
        <div className="modal">
          <h3>Investigar al cliente</h3>
          <p className="sub">
            Pega la web del cliente. Se lee la home, quiénes son, servicios y
            señales digitales, y se resume en una ficha para tenerla delante en
            la reunión.
          </p>
          <input
            className="url-in"
            value={researchUrl}
            onChange={(e) => setResearchUrl(e.target.value)}
            placeholder="clinicavall.com"
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void doResearch()
              }
              if (e.key === 'Escape' && !researching) setResearchOpen(false)
            }}
          />
          {researchSteps.length ? (
            <div className="steps on">
              {researchSteps.map((s) => (
                <div key={s.label} className={`step${s.done ? ' done' : ''}`}>
                  <span className="mk">{s.done ? '✓' : '○'}</span>
                  <span>{s.label}</span>
                </div>
              ))}
              {researchError ? (
                <div className="step done" style={{ color: '#b45309' }}>
                  <span className="mk">✕</span>
                  <span>{researchError}</span>
                </div>
              ) : null}
            </div>
          ) : null}
          {!researching ? (
            <div className="modal-foot">
              <button
                type="button"
                className="btn"
                onClick={() => setResearchOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-accent"
                onClick={() => void doResearch()}
              >
                Investigar
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={`veil${panel ? ' on' : ''}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).classList.contains('veil')) setPanel(null)
        }}
      >
        {panel ? (
          <div className="modal" style={{ maxWidth: 640 }}>
            <h3>{panel.title}</h3>
            <p className="sub">{panel.sub}</p>
            <div
              style={{ maxHeight: '58vh', overflowY: 'auto' }}
              dangerouslySetInnerHTML={{ __html: panel.html }}
            />
            <div className="modal-foot">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void navigator.clipboard?.writeText(panel.plain)
                  toast('Copiado al portapapeles')
                }}
              >
                Copiar
              </button>
              {panel.confirmApply ? (
                <button
                  type="button"
                  className="btn btn-accent"
                  disabled={applyingDef}
                  onClick={() => void applyDefinitionToCrm()}
                >
                  {applyingDef ? 'Guardando…' : 'Confirmar y guardar'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-accent"
                  onClick={() => setPanel(null)}
                >
                  Cerrar
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className={`toast${toastMsg ? ' on' : ''}`}>{toastMsg}</div>
    </div>
  )
}
