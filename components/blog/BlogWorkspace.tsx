import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Loader2, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api, Notice } from '@/components/blog/shared'
import NewArticle from '@/components/blog/NewArticle'
import type { BlogState, NewArticleOpts } from '@/components/blog/types'
import Resumen from '@/components/blog/Resumen'
import Articulos from '@/components/blog/Articulos'
import Temas from '@/components/blog/Temas'
import Calendario from '@/components/blog/Calendario'
import Ajustes from '@/components/blog/Ajustes'
import { Info, registerThemes } from '@/components/blog/shared'
import { cn } from '@/lib/utils'

const VIEWS = [
  ['resumen', 'Inicio', 'Lo que hay que hacer hoy: artículos para revisar, próximas publicaciones y el interruptor del piloto automático.'],
  ['articulos', 'Artículos', 'Todos los artículos clasificados por estado o por categoría. Desde aquí se crean y se abren para revisar.'],
  ['calendario', 'Calendario', 'Qué sale cada día. Las fechas y horas las elige el sistema al azar (2-3 por semana); podéis moverlas o fijarlas.'],
  ['temas', 'Temas', 'De qué se va a escribir: la cola de temas y la búsqueda de ideas nuevas y noticias.'],
  ['ajustes', 'Ajustes', 'Publicación en la web, calendario, cómo escribe la IA, normas SEO e imágenes.'],
] as const

type BlogView = (typeof VIEWS)[number][0]
const VALID = new Set<string>(VIEWS.map(([id]) => id))

function parseBlogView(raw: string | string[] | undefined): BlogView {
  const value = Array.isArray(raw) ? raw[0] : raw
  return value && VALID.has(value) ? (value as BlogView) : 'resumen'
}

export default function BlogWorkspace() {
  const router = useRouter()
  const view = parseBlogView(router.query.view)
  const [state, setState] = useState<BlogState | null>(null)
  const [setup, setSetup] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState<NewArticleOpts | false>(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<BlogState & { setupRequired?: boolean; message?: string }>('state')
      if (data.setupRequired) return setSetup(data.message || '')
      registerThemes(data.settings.customThemes)
      setState(data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const go = (t: string) =>
    router.replace(
      { pathname: '/marketing', query: t === 'resumen' ? { tab: 'blog' } : { tab: 'blog', view: t } },
      undefined,
      { shallow: true }
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-full items-center justify-center lg:w-56 lg:justify-start">
          <button
            type="button"
            onClick={() => router.push('/marketing')}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Marketing
          </button>
        </div>
        <div className="flex flex-1 justify-center border-b border-gray-200 lg:border-b-0">
          <div className="flex flex-wrap justify-center gap-0">
            {VIEWS.map(([id, label, info]) => (
              <div
                key={id}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3 transition-colors sm:px-4',
                  view === id ? 'border-gray-900' : 'border-transparent hover:border-gray-300'
                )}
              >
                <button onClick={() => go(id)} className={cn('py-2.5 text-sm font-medium', view === id ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700')}>
                  {label}
                </button>
                {view === id && <Info side="bottom">{info}</Info>}
              </div>
            ))}
          </div>
        </div>
        <div className="flex w-full items-center justify-center gap-2 lg:w-56 lg:justify-end">
          {state && (
            <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium', state.settings.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
              <span className={cn('h-1.5 w-1.5 rounded-full', state.settings.enabled ? 'bg-emerald-500' : 'bg-gray-400')} />
              {state.settings.enabled ? 'Piloto automático' : 'En pausa'}
            </span>
          )}
          <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setCreating({})} disabled={!state}>
            <Plus className="h-4 w-4" /> Nuevo artículo
          </Button>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => load()} disabled={loading} title="Actualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {setup && <Notice tone="warn">{setup}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {!state && !setup && !error && (
        <div className="flex justify-center py-24 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      )}

      {state && view === 'resumen' && <Resumen state={state} reload={load} go={go} onNewArticle={(opts) => setCreating(opts || {})} />}
      {state && view === 'articulos' && <Articulos state={state} reload={load} onNewArticle={(opts) => setCreating(opts || {})} />}
      {state && view === 'calendario' && <Calendario state={state} reload={load} onNewArticle={(opts) => setCreating(opts || {})} />}
      {state && view === 'temas' && <Temas state={state} reload={load} />}
      {state && view === 'ajustes' && <Ajustes state={state} reload={load} />}
      {state && (
        <NewArticle
          open={creating !== false}
          onClose={() => setCreating(false)}
          topics={state.topics}
          slots={state.slots}
          preset={creating || undefined}
          reload={load}
        />
      )}
    </div>
  )
}
