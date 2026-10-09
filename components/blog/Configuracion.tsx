import { useEffect, useState } from 'react'
import { Loader2, Plus, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BlogSettings } from '@/lib/blog/types'
import { api, Field, inputCls, Notice, Panel } from './shared'
import type { TabProps } from './types'
import { cn } from '@/lib/utils'

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function Configuracion({ state, reload }: TabProps) {
  const [s, setS] = useState<BlogSettings>(structuredClone(state.settings))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [imageModels, setImageModels] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    api<{ models: { id: string; name: string }[] }>('image-models').then((r) => setImageModels(r.models)).catch(() => undefined)
  }, [])

  const set = <K extends keyof BlogSettings>(k: K, v: Partial<BlogSettings[K]>) => setS((prev) => ({ ...prev, [k]: { ...(prev[k] as object), ...v } }))
  const num = (v: string) => Number(v.replace(',', '.')) || 0

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await api('settings', { method: 'PUT', body: s })
      await reload()
      setMsg({ tone: 'ok', text: 'Configuración guardada.' })
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Error' })
    } finally {
      setBusy(false)
    }
  }

  const sc = s.schedule
  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/90 p-3 backdrop-blur">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} className="h-4 w-4 accent-gray-900" />
          <b>Motor activo</b> <span className="text-gray-500">(planifica, investiga, redacta y publica solo)</span>
        </label>
        <Button onClick={save} disabled={busy} className="gap-1.5 rounded-xl">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar</Button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Publicación">
          <div className="space-y-2">
            {([
              ['revision', 'Con revisión', 'Genera borradores y espera a que alguien los apruebe. Recomendado (y lo que pide el brief).'],
              ['revision_con_plazo', 'Revisión con plazo', 'Si en el plazo nadie lo rechaza y pasa los controles, se aprueba solo.'],
              ['automatico', 'Automático', 'Si pasa todos los controles SEO y no tiene huecos [SERGI], se publica sin revisión.'],
            ] as const).map(([v, l, d]) => (
              <label key={v} className={cn('flex cursor-pointer gap-3 rounded-xl border p-3', s.publishing.mode === v ? 'border-gray-900 bg-gray-50' : 'border-gray-200')}>
                <input type="radio" checked={s.publishing.mode === v} onChange={() => set('publishing', { mode: v })} className="mt-1 accent-gray-900" />
                <span><b className="text-sm">{l}</b><span className="block text-xs text-gray-500">{d}</span></span>
              </label>
            ))}
            {s.publishing.mode === 'revision_con_plazo' && (
              <Field label="Plazo (horas)"><input className={inputCls} type="number" value={s.publishing.autoPublishAfterHours} onChange={(e) => set('publishing', { autoPublishAfterHours: num(e.target.value) })} /></Field>
            )}
          </div>
        </Panel>

        <Panel title="Calendario aleatorio">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mínimo por semana"><input className={inputCls} type="number" min={1} max={7} value={sc.minPerWeek} onChange={(e) => set('schedule', { minPerWeek: num(e.target.value) })} /></Field>
            <Field label="Máximo por semana"><input className={inputCls} type="number" min={1} max={7} value={sc.maxPerWeek} onChange={(e) => set('schedule', { maxPerWeek: num(e.target.value) })} /></Field>
            <Field label="Horas mínimas entre artículos"><input className={inputCls} type="number" value={sc.minGapHours} onChange={(e) => set('schedule', { minGapHours: num(e.target.value) })} /></Field>
            <Field label="1 de cada N es de actualidad" hint="0 = sin actualidad"><input className={inputCls} type="number" min={0} value={sc.newsEvery} onChange={(e) => set('schedule', { newsEvery: num(e.target.value) })} /></Field>
            <Field label="Semanas planificadas por adelantado"><input className={inputCls} type="number" min={1} max={8} value={sc.planAheadWeeks} onChange={(e) => set('schedule', { planAheadWeeks: num(e.target.value) })} /></Field>
            <Field label="Empezar a publicar el"><input className={inputCls} type="date" value={sc.startDate} onChange={(e) => set('schedule', { startDate: e.target.value })} /></Field>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-gray-700">Días permitidos</p>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => {
                const on = sc.weekdays.includes(i + 1)
                return (
                  <button key={d} type="button" onClick={() => set('schedule', { weekdays: on ? sc.weekdays.filter((x) => x !== i + 1) : [...sc.weekdays, i + 1].sort() })} className={cn('h-9 w-9 rounded-lg border text-sm', on ? 'border-gray-900 bg-gray-900 font-medium text-white' : 'border-gray-200 text-gray-400')}>{d}</button>
                )
              })}
            </div>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-gray-700">Franjas horarias (hora de Madrid)</p>
            {sc.windows.map((w, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <input className={inputCls + ' w-28'} type="time" value={w.from} onChange={(e) => set('schedule', { windows: sc.windows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
                <span className="text-gray-400">a</span>
                <input className={inputCls + ' w-28'} type="time" value={w.to} onChange={(e) => set('schedule', { windows: sc.windows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
                <Button size="sm" variant="ghost" onClick={() => set('schedule', { windows: sc.windows.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-1 rounded-lg" onClick={() => set('schedule', { windows: [...sc.windows, { from: '10:00', to: '12:00' }] })}><Plus className="h-3.5 w-3.5" /> Franja</Button>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-gray-700">Pausas (no se publica)</p>
            {sc.pauses.map((p, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <input className={inputCls} value={p.label} onChange={(e) => set('schedule', { pauses: sc.pauses.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input className={inputCls + ' w-40'} type="date" value={p.from} onChange={(e) => set('schedule', { pauses: sc.pauses.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
                <input className={inputCls + ' w-40'} type="date" value={p.to} onChange={(e) => set('schedule', { pauses: sc.pauses.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
                <Button size="sm" variant="ghost" onClick={() => set('schedule', { pauses: sc.pauses.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-1 rounded-lg" onClick={() => set('schedule', { pauses: [...sc.pauses, { label: 'Pausa', from: sc.startDate, to: sc.startDate }] })}><Plus className="h-3.5 w-3.5" /> Pausa</Button>
          </div>
        </Panel>

        <Panel title="Temas y plazos">
          <Field label="De dónde salen los temas">
            <select className={inputCls} value={s.topics.source} onChange={(e) => set('topics', { source: e.target.value as BlogSettings['topics']['source'] })}>
              <option value="calendario">Calendario anual de Sergi (90 temas)</option>
              <option value="mixto">Primero los que aceptéis (propuestas o a mano), luego el calendario</option>
              <option value="propuestas">Solo los que aceptéis</option>
            </select>
          </Field>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Field label="Brief: días antes"><input className={inputCls} type="number" value={s.leadTimes.briefDaysBefore} onChange={(e) => set('leadTimes', { briefDaysBefore: num(e.target.value) })} /></Field>
            <Field label="Borrador: días antes"><input className={inputCls} type="number" value={s.leadTimes.draftDaysBefore} onChange={(e) => set('leadTimes', { draftDaysBefore: num(e.target.value) })} /></Field>
            <Field label="Propuestas por búsqueda"><input className={inputCls} type="number" value={s.topics.proposalsPerSearch} onChange={(e) => set('topics', { proposalsPerSearch: num(e.target.value) })} /></Field>
          </div>
        </Panel>

        <Panel title="Modelos de IA (OpenRouter)">
          <div className="grid gap-3">
            <Field label="Investigación y briefs" hint="Por defecto, el Claude Sonnet más reciente."><input className={inputCls} value={s.models.research} onChange={(e) => set('models', { research: e.target.value })} /></Field>
            <Field label="Redacción" hint="Por defecto, el Claude Opus más reciente: el que mejor escribe."><input className={inputCls} value={s.models.writing} onChange={(e) => set('models', { writing: e.target.value })} /></Field>
            <Field label="Resultados de búsqueda web por consulta" hint="Cada resultado cuesta unos 0,4 céntimos en OpenRouter."><input className={inputCls} type="number" value={s.models.webSearchResults} onChange={(e) => set('models', { webSearchResults: num(e.target.value) })} /></Field>
          </div>
        </Panel>

        <Panel title="Imágenes">
          <Field label="Proveedor">
            <select className={inputCls} value={s.images.provider} onChange={(e) => set('images', { provider: e.target.value as BlogSettings['images']['provider'] })}>
              <option value="openrouter">OpenRouter (misma clave que el texto)</option>
              <option value="openai">OpenAI directo (necesita OPENAI_API_KEY)</option>
              <option value="ninguno">Sin imágenes</option>
            </select>
          </Field>
          {s.images.provider === 'openrouter' && (
            <div className="mt-3">
              <Field label="Modelo de imagen" hint="Lista en directo de OpenRouter. Nano Banana Pro es el que mejor escribe texto dentro de las infografías; los de OpenAI («GPT Image») son los de ChatGPT.">
                <select className={inputCls} value={s.images.openrouterModel} onChange={(e) => set('images', { openrouterModel: e.target.value })}>
                  {!imageModels.some((m) => m.id === s.images.openrouterModel) && <option value={s.images.openrouterModel}>{s.images.openrouterModel}</option>}
                  {imageModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>
            </div>
          )}
          {s.images.provider === 'openai' && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label="Modelo OpenAI"><input className={inputCls} value={s.images.openaiModel} onChange={(e) => set('images', { openaiModel: e.target.value })} /></Field>
              <Field label="Tamaño"><input className={inputCls} value={s.images.size} onChange={(e) => set('images', { size: e.target.value })} /></Field>
            </div>
          )}
        </Panel>

        <Panel title="Normas SEO (números)">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {([
              ['keywordMaxWords', 'Palabras de la clave (máx.)'],
              ['keywordMinCount', 'Apariciones de la clave (mín.)'],
              ['secondaryCount', 'Nº de secundarias'],
              ['secondaryMinCount', 'Apariciones de cada secundaria'],
              ['h1Max', 'H1 (máx. caracteres)'],
              ['metaMax', 'Meta-description (máx.)'],
              ['slugMax', 'Slug (máx.)'],
              ['paragraphMaxLines', 'Líneas por párrafo (máx.)'],
              ['charsPerLine', 'Caracteres por línea'],
              ['internalLinks', 'Enlaces internos (exactos)'],
              ['externalLinks', 'Enlaces externos (exactos)'],
              ['maxRewrites', 'Reescrituras si falla'],
            ] as const).map(([k, l]) => (
              <Field key={k} label={l}><input className={inputCls} type="number" value={s.seo[k] as number} onChange={(e) => set('seo', { [k]: num(e.target.value) } as Partial<BlogSettings['seo']>)} /></Field>
            ))}
            <Field label="Artículo: palabras mín.-máx.">
              <div className="flex gap-1"><input className={inputCls} type="number" value={s.seo.wordsArticle[0]} onChange={(e) => set('seo', { wordsArticle: [num(e.target.value), s.seo.wordsArticle[1]] })} /><input className={inputCls} type="number" value={s.seo.wordsArticle[1]} onChange={(e) => set('seo', { wordsArticle: [s.seo.wordsArticle[0], num(e.target.value)] })} /></div>
            </Field>
            <Field label="Guía pilar: palabras mín.-máx.">
              <div className="flex gap-1"><input className={inputCls} type="number" value={s.seo.wordsPillar[0]} onChange={(e) => set('seo', { wordsPillar: [num(e.target.value), s.seo.wordsPillar[1]] })} /><input className={inputCls} type="number" value={s.seo.wordsPillar[1]} onChange={(e) => set('seo', { wordsPillar: [s.seo.wordsPillar[0], num(e.target.value)] })} /></div>
            </Field>
          </div>
        </Panel>

        <Panel title="Web, autor y publicación">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dominio"><input className={inputCls} value={s.site.domain} onChange={(e) => set('site', { domain: e.target.value })} /></Field>
            <Field label="Ruta del blog"><input className={inputCls} value={s.site.blogPath} onChange={(e) => set('site', { blogPath: e.target.value })} /></Field>
            <Field label="Autor"><input className={inputCls} value={s.site.authorName} onChange={(e) => set('site', { authorName: e.target.value })} /></Field>
            <Field label="Cargo del autor"><input className={inputCls} value={s.site.authorRole} onChange={(e) => set('site', { authorRole: e.target.value })} /></Field>
            <Field label="Cómo se publica">
              <select className={inputCls} value={s.publish.method} onChange={(e) => set('publish', { method: e.target.value as 'paquete' | 'sftp' })}>
                <option value="paquete">Paquete ZIP para subir a CDMON</option>
                <option value="sftp">SFTP automático (próximamente)</option>
              </select>
            </Field>
            <Field label="Presupuesto mensual (USD)" hint="Si se alcanza, el motor deja de generar hasta el mes siguiente."><input className={inputCls} type="number" value={s.budget.monthlyUsd} onChange={(e) => set('budget', { monthlyUsd: num(e.target.value) })} /></Field>
          </div>
        </Panel>
      </div>
    </div>
  )
}
