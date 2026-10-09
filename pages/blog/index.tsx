import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import Layout from '@/components/Layout'
import { Button } from '@/components/ui/button'
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
  ['calendario', 'Calendario'],
  ['temas', 'Temas'],
  ['configuracion', 'Configuración'],
  ['reglas', 'Reglas y prompt'],
] as const

export default function BlogPage() {
  const router = useRouter()
  const tab = (router.query.tab as string) || 'resumen'
  const [state, setState] = useState<BlogState | null>(null)
  const [setup, setSetup] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<BlogState & { setupRequired?: boolean; message?: string }>('state')
      if (data.setupRequired) return setSetup(data.message || '')
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

  const go = (t: string) => router.replace({ pathname: '/blog', query: { tab: t } }, undefined, { shallow: true })

  return (
    <Layout>
      <div className="space-y-6">
        {/* Pestañas centradas, como en Marketing */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="hidden w-40 lg:block" />
          <div className="flex flex-1 justify-center overflow-x-auto border-b border-gray-200 lg:border-b-0">
            <div className="flex min-w-0 flex-nowrap justify-start gap-0 sm:flex-wrap sm:justify-center">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => go(id)}
                  className={cn(
                    'whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4',
                    tab === id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex w-full items-center justify-center gap-2 lg:w-40 lg:justify-end">
            {state && (
              <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', state.settings.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                <span className={cn('h-1.5 w-1.5 rounded-full', state.settings.enabled ? 'bg-emerald-500' : 'bg-gray-400')} />
                {state.settings.enabled ? 'Activo' : 'En pausa'}
              </span>
            )}
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

        {state && tab === 'resumen' && <Resumen state={state} reload={load} go={go} />}
        {state && tab === 'articulos' && <Articulos state={state} reload={load} />}
        {state && tab === 'calendario' && <Calendario state={state} reload={load} />}
        {state && tab === 'temas' && <Temas state={state} reload={load} />}
        {state && tab === 'configuracion' && <Configuracion state={state} reload={load} />}
        {state && tab === 'reglas' && <Reglas state={state} reload={load} />}
      </div>
    </Layout>
  )
}
