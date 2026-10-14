import { GetServerSideProps } from 'next'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Layout from '@/components/Layout'
import { requireAuth } from '@/lib/auth'
import { defaultStageColor } from '@/lib/pipelines/defaults'
import { cn } from '@/lib/utils'

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const user = await requireAuth(context)
    if (user.role !== 'admin') return { redirect: { destination: '/pipelines', permanent: false } }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
  return { props: {} }
}

type Item = {
  contact_id: number
  lead_id: number | null
  nombre: string
  empresa: string | null
  stage: string
  origins: string[]
  pipelines: string[]
  valor: number | null
  updated_at: string
}
type Funnel = {
  stages: Array<{ name: string; items: Item[]; total_valor: number }>
  totals: { contacts: number; by_origin: Record<string, number> }
}

const ORIGINS: Array<{ key: string; label: string }> = [
  { key: '', label: 'Todos' },
  { key: 'web', label: 'Web' },
  { key: 'coldcall', label: 'Cold calling' },
  { key: 'otros', label: 'Otros' },
]

const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export default function EmbudoUnicoPage() {
  const [origen, setOrigen] = useState('')
  const [data, setData] = useState<Funnel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/pipelines/embudo${origen ? `?origen=${origen}` : ''}`)
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'No se pudo cargar')
        setData(d)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar'))
      .finally(() => setLoading(false))
  }, [origen])

  const visible = data?.stages.filter((s) => s.items.length > 0 || s.name !== 'PERDIDO') ?? []

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/pipelines" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Pipelines
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Embudo único</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada cliente aparece una vez, en la etapa más avanzada de cualquiera de los tableros. Solo lectura: los
              pipelines siguen funcionando igual.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ORIGINS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setOrigen(o.key)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium',
                  origen === o.key ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                {o.label}
                {data && o.key ? ` · ${data.totals.by_origin[o.key] ?? 0}` : data && !o.key ? ` · ${data.totals.contacts}` : ''}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {loading && !data && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && (
          <div className={cn('-mx-3 overflow-x-auto px-3 pb-2 sm:-mx-6 sm:px-6', loading && 'opacity-60')}>
            <div className="flex min-w-max gap-3">
              {visible.map((stage) => (
                <section key={stage.name} className="w-64 shrink-0 rounded-2xl bg-muted/40 p-2.5">
                  <header className="mb-2 px-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: stage.name === 'PERDIDO' ? '#9CA3AF' : defaultStageColor(stage.name) }} />
                      <h2 className="text-xs font-semibold tracking-wide">{stage.name}</h2>
                      <span className="ml-auto text-xs text-muted-foreground">{stage.items.length}</span>
                    </div>
                    {stage.total_valor > 0 && <p className="mt-0.5 text-[11px] text-muted-foreground">{eur(stage.total_valor)}</p>}
                  </header>
                  <ul className="max-h-[65vh] space-y-2 overflow-y-auto">
                    {stage.items.map((it) => {
                      const card = (
                        <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-sm hover:border-foreground/20">
                          <p className="truncate text-sm font-medium">{it.nombre}</p>
                          {it.empresa && <p className="truncate text-xs text-muted-foreground">{it.empresa}</p>}
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">
                            {it.pipelines.join(' · ')}
                            {it.valor ? ` · ${eur(it.valor)}` : ''}
                          </p>
                        </div>
                      )
                      return (
                        <li key={it.contact_id}>{it.lead_id ? <Link href={`/leads/${it.lead_id}`}>{card}</Link> : card}</li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
