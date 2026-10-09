import { useEffect, useState } from 'react'
import { Download, Loader2, Plug, Plus, Save, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MODEL_PRESETS } from '@/lib/blog/defaults'
import type { BlogRules, BlogSettings } from '@/lib/blog/types'
import { cn } from '@/lib/utils'
import { api, Field, fmt, Info, inputCls, Notice, Panel, Segmented } from './shared'
import type { TabProps } from './types'

type Section = 'web' | 'calendario' | 'escritura' | 'ia' | 'seo'
const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

export default function Ajustes({ state, reload }: TabProps) {
  const [section, setSection] = useState<Section>('web')
  const [s, setS] = useState<BlogSettings>(structuredClone(state.settings))
  const [r, setR] = useState<BlogRules>(structuredClone(state.rules))
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [imageModels, setImageModels] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    api<{ models: { id: string; name: string }[] }>('image-models').then((x) => setImageModels(x.models)).catch(() => undefined)
  }, [])

  const set = <K extends keyof BlogSettings>(k: K, v: Partial<BlogSettings[K]>) => setS((prev) => ({ ...prev, [k]: { ...(prev[k] as object), ...v } }))
  const num = (v: string) => Number(v.replace(',', '.')) || 0
  const sc = s.schedule

  const run = async (key: string, fn: () => Promise<{ message?: string } | unknown>, ok?: string) => {
    setBusy(key)
    setMsg(null)
    try {
      const out = (await fn()) as { message?: string }
      setMsg({ tone: 'ok', text: out?.message || ok || 'Hecho.' })
      await reload()
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Error' })
    } finally {
      setBusy('')
    }
  }
  const save = () =>
    run('save', async () => {
      await api('settings', { method: 'PUT', body: s })
      await api('rules', { method: 'PUT', body: r })
    }, 'Ajustes guardados. Se aplican desde el próximo artículo.')

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 md:flex-row md:justify-between">
        <div className="hidden md:block md:w-28" />
        <Segmented<Section>
          value={section}
          onChange={setSection}
          options={[
            { id: 'web', label: 'Publicación' },
            { id: 'calendario', label: 'Calendario' },
            { id: 'escritura', label: 'Cómo escribe' },
            { id: 'seo', label: 'SEO' },
            { id: 'ia', label: 'IA e imágenes' },
          ]}
        />
        <Button onClick={save} disabled={!!busy} className="gap-1.5 rounded-xl md:w-28">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar</Button>
      </div>
      {msg && <Notice tone={msg.tone === 'ok' ? 'ok' : msg.tone}>{msg.text}</Notice>}

      {/* ---------------- Publicación ---------------- */}
      {section === 'web' && (
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
          <Panel title="Revisión antes de publicar" info="Decide si alguien del equipo tiene que aprobar cada artículo antes de que salga.">
            <div className="space-y-2">
              {([
                ['revision', 'Siempre con revisión', 'Nada sale sin que alguien pulse «Aprobar». Recomendado.'],
                ['revision_con_plazo', 'Revisión con plazo', 'Si en el plazo nadie lo rechaza y pasa todos los controles, se aprueba solo.'],
                ['automatico', 'Automático', 'Si pasa todos los controles SEO, se publica sin revisión.'],
              ] as const).map(([v, l, d]) => (
                <label key={v} className={cn('flex cursor-pointer gap-3 rounded-xl border p-3', s.publishing.mode === v ? 'border-gray-900 bg-gray-50' : 'border-gray-200')}>
                  <input type="radio" checked={s.publishing.mode === v} onChange={() => set('publishing', { mode: v })} className="mt-1 accent-gray-900" />
                  <span><b className="text-sm text-gray-900">{l}</b><span className="block text-xs text-gray-500">{d}</span></span>
                </label>
              ))}
              {s.publishing.mode === 'revision_con_plazo' && (
                <Field label="Plazo (horas)"><input className={inputCls} type="number" value={s.publishing.autoPublishAfterHours} onChange={(e) => set('publishing', { autoPublishAfterHours: num(e.target.value) })} /></Field>
              )}
            </div>
          </Panel>

          <Panel title="Subida a buffaloia.com" info="Cuando un artículo llega a su fecha (o pulsáis «Publicar ahora»), el sistema lo sube solo a CDMON por FTP junto con la portada del blog, las categorías, el sitemap y el RSS. Solo sube lo que ha cambiado y solo toca la carpeta /blog/, el sitemap y blog.css.">
            <div className="space-y-3">
              <div className={cn('rounded-xl px-4 py-3 text-sm', state.status.keys.ftp ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900')}>
                {state.status.keys.ftp ? 'Datos de acceso FTP configurados.' : (
                  <>
                    Faltan los datos de acceso. Añadid en EasyPanel (Entorno) estas variables con los datos FTP de CDMON:
                    <code className="mt-2 block rounded-lg bg-white/70 px-2 py-1.5 font-mono text-[11px] leading-relaxed">CDMON_FTP_HOST=ftp.buffaloia.com<br />CDMON_FTP_USER=…<br />CDMON_FTP_PASSWORD=…</code>
                    <span className="mt-1 block text-xs">Están en el panel de CDMON → Hosting → FTP. La contraseña nunca se guarda en el CRM.</span>
                  </>
                )}
              </div>
              <Field label="Cómo se publica" info="«Automático» sube los cambios solo. «Manual» deja preparado un ZIP para subirlo vosotros, como antes.">
                <select className={inputCls} value={s.publish.method} onChange={(e) => set('publish', { method: e.target.value as 'ftp' | 'paquete' })}>
                  <option value="ftp">Automático: subir a CDMON por FTP</option>
                  <option value="paquete">Manual: descargar un ZIP</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Carpeta de la web" info="En CDMON la carpeta pública del dominio es /web. Cámbiala solo si la web está en otra.">
                  <input className={inputCls} value={s.publish.remoteDir} onChange={(e) => set('publish', { remoteDir: e.target.value })} />
                </Field>
                <Field label="Conexión cifrada" info="FTP con TLS (FTPES). Déjalo activado salvo que CDMON diga lo contrario.">
                  <select className={inputCls} value={s.publish.secure ? '1' : '0'} onChange={(e) => set('publish', { secure: e.target.value === '1' })}>
                    <option value="1">Sí (recomendado)</option>
                    <option value="0">No</option>
                  </select>
                </Field>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" disabled={!!busy || !state.status.keys.ftp} onClick={() => run('test', () => api('web/test', { body: {} }))}>
                  {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Probar conexión
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" disabled={!!busy || !state.status.keys.ftp} onClick={() => run('sync', () => api('web/sync', { body: {} }))}>
                  {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Subir ahora
                </Button>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/api/blog/package" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                  <Download className="h-3.5 w-3.5" /> ZIP de copia
                </a>
              </div>
              <p className="text-center text-[11px] text-gray-400">Guarda los cambios antes de probar la conexión.</p>
            </div>
          </Panel>

          <Panel title="Autor y web" info="Lo que aparece como firma en cada artículo y en los datos para Google.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Autor"><input className={inputCls} value={s.site.authorName} onChange={(e) => set('site', { authorName: e.target.value })} /></Field>
              <Field label="Cargo"><input className={inputCls} value={s.site.authorRole} onChange={(e) => set('site', { authorRole: e.target.value })} /></Field>
              <Field label="Dominio"><input className={inputCls} value={s.site.domain} onChange={(e) => set('site', { domain: e.target.value })} /></Field>
              <Field label="Ruta del blog"><input className={inputCls} value={s.site.blogPath} onChange={(e) => set('site', { blogPath: e.target.value })} /></Field>
            </div>
          </Panel>

          <Panel title="Límite de gasto" info="Lo máximo que se gasta al mes en OpenRouter (texto e imágenes). Si se llega, el sistema deja de escribir hasta el mes siguiente; lo ya escrito se sigue publicando.">
            <div className="space-y-3">
              <Field label="Dólares al mes" hint={`Gastado este mes: ${state.status.spend.toFixed(2)} $.`}>
                <input className={inputCls} type="number" value={s.budget.monthlyUsd} onChange={(e) => set('budget', { monthlyUsd: num(e.target.value) })} />
              </Field>
              <Field label="Máximo por artículo ($)" info="Si un artículo llega a este gasto, se para solo y queda avisado en su ficha. Con el nivel económico un artículo cuesta unos 0,30-0,50 $.">
                <input className={inputCls} type="number" step="0.1" value={s.budget.perArticleUsd} onChange={(e) => set('budget', { perArticleUsd: num(e.target.value) })} />
              </Field>
            </div>
          </Panel>
        </div>
      )}

      {/* ---------------- Calendario ---------------- */}
      {section === 'calendario' && (
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
          <Panel title="Cuántos y cuándo" info="Cada semana el sistema elige al azar cuántos artículos salen (entre el mínimo y el máximo), qué días y a qué hora dentro de las franjas. Así no hay un patrón fijo.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mínimo por semana"><input className={inputCls} type="number" min={1} max={7} value={sc.minPerWeek} onChange={(e) => set('schedule', { minPerWeek: num(e.target.value) })} /></Field>
              <Field label="Máximo por semana"><input className={inputCls} type="number" min={1} max={7} value={sc.maxPerWeek} onChange={(e) => set('schedule', { maxPerWeek: num(e.target.value) })} /></Field>
              <Field label="Horas mínimas entre dos" info="Evita que salgan dos artículos casi seguidos."><input className={inputCls} type="number" value={sc.minGapHours} onChange={(e) => set('schedule', { minGapHours: num(e.target.value) })} /></Field>
              <Field label="1 de cada N es actualidad" info="Uno de cada N artículos, en un hueco al azar, trata una noticia que afecta a vuestros clientes. 0 = nunca."><input className={inputCls} type="number" min={0} value={sc.newsEvery} onChange={(e) => set('schedule', { newsEvery: num(e.target.value) })} /></Field>
              <Field label="Empezar el" info="No se publica nada antes de esta fecha."><input className={inputCls} type="date" value={sc.startDate} onChange={(e) => set('schedule', { startDate: e.target.value })} /></Field>
              <Field label="Semanas por adelantado" info="Con cuánta antelación se reservan las fechas. Tiene que dar tiempo a investigar, escribir y revisar."><input className={inputCls} type="number" min={1} max={8} value={sc.planAheadWeeks} onChange={(e) => set('schedule', { planAheadWeeks: num(e.target.value) })} /></Field>
            </div>
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-gray-600"><span className="inline-flex items-center gap-1.5">Días permitidos <Info side="bottom">Los días en los que puede salir un artículo.</Info></span></p>
              <div className="flex gap-1.5">
                {DAYS.map((d, i) => {
                  const on = sc.weekdays.includes(i + 1)
                  return <button key={d} type="button" onClick={() => set('schedule', { weekdays: on ? sc.weekdays.filter((x) => x !== i + 1) : [...sc.weekdays, i + 1].sort() })} className={cn('h-9 w-9 rounded-xl border text-sm', on ? 'border-gray-900 bg-gray-900 font-medium text-white' : 'border-gray-200 text-gray-400')}>{d}</button>
                })}
              </div>
            </div>
          </Panel>

          <Panel title="Franjas y pausas" info="Las horas en las que puede salir un artículo (hora de Madrid) y los periodos en los que no se publica nada, como Navidad.">
            <p className="mb-1.5 text-xs font-medium text-gray-600">Franjas horarias</p>
            {sc.windows.map((w, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <input className={inputCls + ' w-28'} type="time" value={w.from} onChange={(e) => set('schedule', { windows: sc.windows.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
                <span className="text-gray-400">a</span>
                <input className={inputCls + ' w-28'} type="time" value={w.to} onChange={(e) => set('schedule', { windows: sc.windows.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl" onClick={() => set('schedule', { windows: sc.windows.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-1 rounded-xl" onClick={() => set('schedule', { windows: [...sc.windows, { from: '10:00', to: '12:00' }] })}><Plus className="h-3.5 w-3.5" /> Franja</Button>
            <p className="mb-1.5 mt-5 text-xs font-medium text-gray-600">Pausas</p>
            {sc.pauses.map((p, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                <input className={inputCls} value={p.label} onChange={(e) => set('schedule', { pauses: sc.pauses.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <input className={inputCls + ' w-36'} type="date" value={p.from} onChange={(e) => set('schedule', { pauses: sc.pauses.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)) })} />
                <input className={inputCls + ' w-36'} type="date" value={p.to} onChange={(e) => set('schedule', { pauses: sc.pauses.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)) })} />
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl" onClick={() => set('schedule', { pauses: sc.pauses.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-1 rounded-xl" onClick={() => set('schedule', { pauses: [...sc.pauses, { label: 'Pausa', from: sc.startDate, to: sc.startDate }] })}><Plus className="h-3.5 w-3.5" /> Pausa</Button>
          </Panel>

          <Panel title="Plazos de trabajo" info="Cuántos días antes de cada fecha empieza el sistema a trabajar. Con 10 y 7, Sergi tiene una semana para revisar.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Investigar: días antes"><input className={inputCls} type="number" value={s.leadTimes.briefDaysBefore} onChange={(e) => set('leadTimes', { briefDaysBefore: num(e.target.value) })} /></Field>
              <Field label="Escribir: días antes"><input className={inputCls} type="number" value={s.leadTimes.draftDaysBefore} onChange={(e) => set('leadTimes', { draftDaysBefore: num(e.target.value) })} /></Field>
            </div>
          </Panel>

          <Panel title="De dónde salen los temas" info="Qué tema coge el sistema cuando se acerca una fecha.">
            <select className={inputCls} value={s.topics.source} onChange={(e) => set('topics', { source: e.target.value as BlogSettings['topics']['source'] })}>
              <option value="calendario">Calendario anual de Sergi (90 temas)</option>
              <option value="mixto">Primero los que añadáis o aceptéis, luego el calendario</option>
              <option value="propuestas">Solo los que añadáis o aceptéis</option>
            </select>
          </Panel>
        </div>
      )}

      {/* ---------------- Cómo escribe ---------------- */}
      {section === 'escritura' && (
        <div className="mx-auto max-w-4xl space-y-5">
          <p className="text-center text-sm text-gray-500">Lo que el sistema le dice a la IA antes de escribir. Se guardan las 20 últimas versiones{state.rulesHistory[0] ? ` (última: ${fmt(state.rulesHistory[0].at)})` : ''}.</p>
          {([
            ['voice', 'Voz y prompt', 'Quién escribe, a quién, con qué tono y qué tesis defiende. Es lo primero que lee la IA.'],
            ['structure', 'Estructura del artículo', 'La plantilla que siguen todos los artículos: qué va primero, qué secciones lleva, cuándo se salta algo.'],
            ['ownMaterial', 'Material propio y límites', 'Casos reales, frases de clientes y lo que nunca se puede decir. La IA solo usa esto como experiencia propia; si le falta, deja un hueco [SERGI: …] para rellenar.'],
          ] as const).map(([k, label, info]) => (
            <Panel key={k} title={label} info={info}>
              <textarea className={inputCls + ' min-h-[200px] font-mono text-xs leading-relaxed'} value={r[k]} onChange={(e) => setR({ ...r, [k]: e.target.value })} />
            </Panel>
          ))}
          <div className="grid gap-5 md:grid-cols-2">
            <Panel title="Expresiones prohibidas" info="Una por línea. Si aparecen, el artículo no pasa el control y se reescribe. Sirve para quitar el tono de IA.">
              <textarea className={inputCls + ' min-h-[220px] font-mono text-xs'} value={r.bannedPhrases.join('\n')} onChange={(e) => setR({ ...r, bannedPhrases: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
            </Panel>
            <Panel title="Cifras y promesas prohibidas" info="Una por línea. Afirmaciones que nunca pueden salir en el blog.">
              <textarea className={inputCls + ' min-h-[220px] font-mono text-xs'} value={r.neverSay.join('\n')} onChange={(e) => setR({ ...r, neverSay: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
            </Panel>
          </div>
        </div>
      )}

      {/* ---------------- SEO ---------------- */}
      {section === 'seo' && (
        <div className="mx-auto max-w-4xl space-y-5">
          <Panel title="Normas que se comprueban" info="Cada artículo se revisa contra estos números antes de pasar a revisión. Si no los cumple, la IA lo reescribe (como máximo las veces indicadas).">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {([
                ['keywordMaxWords', 'Palabras de la clave principal (máx.)', 'Sin contar artículos ni preposiciones.'],
                ['keywordMinCount', 'Veces que aparece la clave (mín.)', 'Contando título y texto.'],
                ['secondaryCount', 'Palabras clave secundarias', ''],
                ['secondaryMinCount', 'Veces de cada secundaria (mín.)', ''],
                ['h1Max', 'Título H1 (máx. caracteres)', ''],
                ['metaMax', 'Meta-description (máx. caracteres)', 'El texto que sale bajo el título en Google.'],
                ['slugMax', 'URL (máx. caracteres)', ''],
                ['paragraphMaxLines', 'Líneas por párrafo (máx.)', ''],
                ['internalLinks', 'Enlaces a vuestra web (exactos)', 'Uno en un H2 completo, uno en una frase y uno en una sola palabra.'],
                ['externalLinks', 'Enlaces a otras webs (exactos)', 'Fuentes con autoridad: BOE, AEPD, INE…'],
                ['maxRewrites', 'Reescrituras si falla', ''],
              ] as const).map(([k, l, info]) => (
                <Field key={k} label={l} info={info || undefined}><input className={inputCls} type="number" value={s.seo[k] as number} onChange={(e) => set('seo', { [k]: num(e.target.value) } as Partial<BlogSettings['seo']>)} /></Field>
              ))}
              <Field label="Artículo: palabras" info="Mínimo y máximo de un artículo normal.">
                <div className="flex gap-1"><input className={inputCls} type="number" value={s.seo.wordsArticle[0]} onChange={(e) => set('seo', { wordsArticle: [num(e.target.value), s.seo.wordsArticle[1]] })} /><input className={inputCls} type="number" value={s.seo.wordsArticle[1]} onChange={(e) => set('seo', { wordsArticle: [s.seo.wordsArticle[0], num(e.target.value)] })} /></div>
              </Field>
            </div>
          </Panel>
          <Panel title="Normas SEO en texto" info="Lo mismo explicado para la IA. Si cambiáis un número arriba, actualizadlo también aquí.">
            <textarea className={inputCls + ' min-h-[260px] font-mono text-xs leading-relaxed'} value={r.seo} onChange={(e) => setR({ ...r, seo: e.target.value })} />
          </Panel>
          <Panel title="Fuentes externas preferidas" info="Un dominio por línea. Los enlaces a otras webs se buscan aquí primero; los que estén fuera de la lista salen como aviso.">
            <textarea className={inputCls + ' min-h-[160px] font-mono text-xs'} value={r.trustedSources.join('\n')} onChange={(e) => setR({ ...r, trustedSources: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
          </Panel>
        </div>
      )}

      {/* ---------------- IA e imágenes ---------------- */}
      {section === 'ia' && (
        <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
          <Panel title="Modelos de texto" info="Todo pasa por OpenRouter. Elige un nivel: el económico escribe bien y cuesta poco; el máximo usa Opus para redactar y cuesta varias veces más.">
            <div className="space-y-3">
              <Field label="Nivel" info="Cambia a la vez el modelo de investigar, el de escribir y el de imágenes. Si tocas un modelo a mano pasa a «Personalizado».">
                <select
                  className={inputCls}
                  value={s.models.preset}
                  onChange={(e) => {
                    const p = (MODEL_PRESETS as Record<string, (typeof MODEL_PRESETS)[keyof typeof MODEL_PRESETS]>)[e.target.value]
                    if (!p) return set('models', { preset: 'personalizado' })
                    setS((prev) => ({ ...prev, models: { ...p.models, preset: e.target.value }, images: { ...prev.images, openrouterModel: p.image } }))
                  }}
                >
                  {Object.entries(MODEL_PRESETS).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                  <option value="personalizado">Personalizado</option>
                </select>
              </Field>
              <Field label="Para investigar"><input className={inputCls} value={s.models.research} onChange={(e) => set('models', { research: e.target.value, preset: 'personalizado' })} /></Field>
              <Field label="Para escribir"><input className={inputCls} value={s.models.writing} onChange={(e) => set('models', { writing: e.target.value, preset: 'personalizado' })} /></Field>
              <Field label="Resultados de búsqueda web" info="Cuántas páginas mira en cada búsqueda. Cada una cuesta unos 0,4 céntimos."><input className={inputCls} type="number" value={s.models.webSearchResults} onChange={(e) => set('models', { webSearchResults: num(e.target.value) })} /></Field>
            </div>
          </Panel>
          <Panel title="Imágenes" info="Cada artículo lleva 3: la destacada, una de apoyo y una infografía. Se generan con OpenRouter, con la misma clave que el texto.">
            <div className="space-y-3">
              <Field label="Proveedor">
                <select className={inputCls} value={s.images.provider} onChange={(e) => set('images', { provider: e.target.value as BlogSettings['images']['provider'] })}>
                  <option value="openrouter">OpenRouter</option>
                  <option value="openai">OpenAI directo (necesita OPENAI_API_KEY)</option>
                  <option value="ninguno">Sin imágenes</option>
                </select>
              </Field>
              {s.images.provider === 'openrouter' && (
                <Field label="Modelo" info="Nano Banana Pro es el que mejor escribe texto dentro de las infografías. Los «GPT Image» son los de ChatGPT.">
                  <select className={inputCls} value={s.images.openrouterModel} onChange={(e) => set('images', { openrouterModel: e.target.value })}>
                    {!imageModels.some((m) => m.id === s.images.openrouterModel) && <option value={s.images.openrouterModel}>{s.images.openrouterModel}</option>}
                    {imageModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Estilo de las imágenes" info="Se añade a cada imagen para que todas parezcan del mismo blog.">
                <textarea className={inputCls + ' h-28 text-xs'} value={r.imageStyle} onChange={(e) => setR({ ...r, imageStyle: e.target.value })} />
              </Field>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
