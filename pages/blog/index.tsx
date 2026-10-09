import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Newspaper } from 'lucide-react'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { api, Notice } from '@/components/blog/shared'
import type { BlogState } from '@/components/blog/types'
import Resumen from '@/components/blog/Resumen'
import Articulos from '@/components/blog/Articulos'
import Temas from '@/components/blog/Temas'
import Calendario from '@/components/blog/Calendario'
import Configuracion from '@/components/blog/Configuracion'
import Reglas from '@/components/blog/Reglas'
import { cn } from '@/lib/utils'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') return { redirect: { destination: '/dashboard', permanent: false } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

const TABS = [
  ['resumen', 'Resumen'],
  ['articulos', 'Artículos'],
  ['temas', 'Temas'],
  ['calendario', 'Calendario'],
  ['configuracion', 'Configuración'],
  ['reglas', 'Reglas y prompt'],
] as const

export default function BlogPage() {
  const router = useRouter()
  const tab = (router.query.tab as string) || 'resumen'
  const [state, setState] = useState<BlogState | null>(null)
  const [setup, setSetup] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api<BlogState & { setupRequired?: boolean; message?: string }>('state')
      if (data.setupRequired) return setSetup(data.message || '')
      setState(data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const go = (t: string) => router.replace({ pathname: '/blog', query: { tab: t } }, undefined, { shallow: true })

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
              <Newspaper className="h-5 w-5 text-emerald-600" /> Blog de buffaloia.com
            </h1>
            <p className="text-sm text-gray-500">Investigación, redacción, SEO y publicación de 2-3 artículos por semana en días y horas aleatorios.</p>
          </div>
          {state && (
            <span className={cn('rounded-full px-3 py-1 text-xs font-medium', state.settings.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
              {state.settings.enabled ? '● Motor activo' : '○ Motor en pausa'}
            </span>
          )}
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => go(id)}
              className={cn('whitespace-nowrap border-b-2 px-3 py-2 text-sm transition', tab === id ? 'border-emerald-600 font-medium text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800')}
            >
              {label}
            </button>
          ))}
        </nav>

        {setup && <Notice tone="warn">{setup}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {!state && !setup && !error && (
          <div className="flex justify-center py-20 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )}

        {state && tab === 'resumen' && <Resumen state={state} reload={load} go={go} />}
        {state && tab === 'articulos' && <Articulos state={state} reload={load} />}
        {state && tab === 'temas' && <Temas state={state} reload={load} />}
        {state && tab === 'calendario' && <Calendario state={state} reload={load} />}
        {state && tab === 'configuracion' && <Configuracion state={state} reload={load} />}
        {state && tab === 'reglas' && <Reglas state={state} reload={load} />}
      </div>
    </Layout>
  )
}
