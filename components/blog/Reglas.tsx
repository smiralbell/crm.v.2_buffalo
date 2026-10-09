import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BlogRules } from '@/lib/blog/types'
import { api, Field, fmt, inputCls, Notice, Panel } from './shared'
import type { TabProps } from './types'

const TEXTS: [keyof BlogRules, string, string][] = [
  ['voice', 'Voz y prompt del redactor', 'Cómo escribe el blog. Es lo primero que lee el modelo antes de cada artículo.'],
  ['structure', 'Estructura del artículo', 'La plantilla que siguen todos los artículos.'],
  ['seo', 'Normas SEO', 'Se le dan al redactor tal cual. Los números que se comprueban automáticamente están en Configuración → Normas SEO.'],
  ['ownMaterial', 'Material propio y lo que nunca se dice', 'Casos, frases de clientes y límites. El redactor sólo puede usar esto como experiencia propia; si falta, deja [SERGI: …].'],
  ['imageStyle', 'Estilo de las imágenes', 'Se añade a cada prompt de imagen para que todas parezcan del mismo blog.'],
]

const LISTS: [keyof BlogRules, string, string][] = [
  ['bannedPhrases', 'Expresiones prohibidas', 'Una por línea. Si aparecen, el artículo no pasa el control y se reescribe.'],
  ['neverSay', 'Cifras y promesas prohibidas', 'Una por línea.'],
  ['trustedSources', 'Fuentes externas preferidas', 'Un dominio por línea. Los enlaces externos fuera de esta lista salen como aviso.'],
]

export default function Reglas({ state, reload }: TabProps) {
  const [r, setR] = useState<BlogRules>(structuredClone(state.rules))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const save = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await api('rules', { method: 'PUT', body: r })
      await reload()
      setMsg({ tone: 'ok', text: 'Reglas guardadas. Se aplican a partir del próximo brief o borrador.' })
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'Error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white/90 p-3 backdrop-blur">
        <p className="text-sm text-gray-600">
          Todo lo que sabe el motor sobre cómo escribir. {state.rulesHistory.length ? `Última versión anterior: ${fmt(state.rulesHistory[0].at)}${state.rulesHistory[0].by ? ' por ' + state.rulesHistory[0].by : ''} (se guardan las 20 últimas).` : ''}
        </p>
        <Button onClick={save} disabled={busy} className="gap-1.5 rounded-xl">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar</Button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      {TEXTS.map(([k, label, hint]) => (
        <Panel key={k} title={label}>
          <Field label="" hint={hint}>
            <textarea className={inputCls + ' min-h-[180px] font-mono text-xs leading-relaxed'} value={r[k] as string} onChange={(e) => setR({ ...r, [k]: e.target.value })} />
          </Field>
        </Panel>
      ))}

      <div className="grid gap-5 lg:grid-cols-3">
        {LISTS.map(([k, label, hint]) => (
          <Panel key={k} title={label}>
            <Field label="" hint={hint}>
              <textarea
                className={inputCls + ' min-h-[220px] font-mono text-xs'}
                value={(r[k] as string[]).join('\n')}
                onChange={(e) => setR({ ...r, [k]: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
              />
            </Field>
          </Panel>
        ))}
      </div>
    </div>
  )
}
