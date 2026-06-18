import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import DeveloperDataGuide from '@/components/engranaje5/DeveloperDataGuide'
import KpiDashboard, { type KpiPeriod } from '@/components/engranaje5/KpiDashboard'
import ProyectoContractSummary from '@/components/engranaje5/ProyectoContractSummary'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import type { ProyectoRow } from '@/lib/engranaje5/project-services'
import type { ProjectServiceFlags } from '@/lib/engranaje5/data-column-guide'
import type { KpiItem } from '@/lib/engranaje5/kpi-layout'
import type { ContractSummary } from '@/lib/engranaje5/contract-summary'

type Tab = 'proyecto' | 'guia' | 'kpis'

const TABS: { id: Tab; label: string }[] = [
  { id: 'proyecto', label: 'Proyecto' },
  { id: 'guia', label: 'Guía de desarrollo' },
  { id: 'kpis', label: 'KPIs' },
]

function isValidTab(v: unknown): v is Tab {
  return v === 'proyecto' || v === 'guia' || v === 'kpis'
}

export default function RetencionProyectoDetailPage() {
  const router = useRouter()
  const { id, tab: urlTab } = router.query

  const [activeTab, setActiveTab] = useState<Tab>('proyecto')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [proyecto, setProyecto] = useState<ProyectoRow | null>(null)
  const [contact, setContact] = useState<{
    id: number
    nombre: string | null
    email: string | null
    empresa: string | null
    telefono: string | null
  } | null>(null)
  const [services, setServices] = useState<ProjectServiceFlags | null>(null)
  const [contract, setContract] = useState<ContractSummary | null>(null)
  const [kpis, setKpis] = useState<KpiItem[]>([])
  const [periods, setPeriods] = useState<KpiPeriod[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<KpiPeriod | null>(null)
  const [hasData, setHasData] = useState(false)

  useEffect(() => {
    if (!router.isReady) return
    if (isValidTab(urlTab)) setActiveTab(urlTab)
    else setActiveTab('proyecto')
  }, [router.isReady, urlTab])

  const load = useCallback(async (year?: number, month?: number) => {
    if (!id || typeof id !== 'string') return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (year != null) params.set('year', String(year))
      if (month != null) params.set('month', String(month))
      const qs = params.toString()
      const res = await fetch(`/api/retencion/proyectos/${id}${qs ? `?${qs}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al cargar')
      setProyecto(data.proyecto)
      setContact(data.contact)
      setServices(data.services)
      setContract(data.contract)
      setKpis(data.kpis)
      setPeriods(data.periods)
      setSelectedPeriod(data.selectedPeriod)
      setHasData(data.hasData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (router.isReady && id) load()
  }, [router.isReady, id, load])

  const handlePeriodChange = (p: KpiPeriod) => {
    setSelectedPeriod(p)
    load(p.year, p.month)
  }

  const switchTab = (tab: Tab) => {
    setActiveTab(tab)
    if (typeof id === 'string') {
      router.replace(`/retencion/proyectos/${id}?tab=${tab}`, undefined, { shallow: true })
    }
  }

  return (
    <Layout>
      <div className="w-full max-w-7xl mx-auto space-y-6 pb-12">
        <div className="flex items-center gap-3">
          <Link
            href="/retencion"
            className="inline-flex items-center justify-center w-9 h-9 border border-gray-200 text-gray-500 rounded-lg hover:border-gray-300 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Retención · Engranaje 3</p>
            <h1 className="text-xl font-semibold text-gray-900">{proyecto?.name || 'Proyecto'}</h1>
          </div>
        </div>

        {proyecto && services && (
          <div className="flex items-center justify-center gap-1 border-b border-gray-200">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => switchTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                    border-b-2 -mb-px transition-colors rounded-t-lg
                    ${isActive
                      ? 'border-gray-900 text-gray-900'
                      : 'border-transparent text-gray-400 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  {tab.label}
                  {tab.id === 'kpis' && hasData && (
                    <span className={`
                      text-[10px] font-medium px-1.5 py-0.5 rounded-full
                      ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}
                    `}>
                      {periods.length || 1}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {loading && !proyecto && (
          <div className="py-20 text-center text-sm text-gray-400">Cargando proyecto…</div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {proyecto && services && contract && activeTab === 'proyecto' && (
          <ProyectoContractSummary
            proyecto={proyecto}
            contact={contact}
            services={services}
            contract={contract}
          />
        )}

        {proyecto && services && activeTab === 'guia' && (
          <DeveloperDataGuide projectId={proyecto.id} flags={services} />
        )}

        {proyecto && services && activeTab === 'kpis' && (
          <section className="rounded-2xl border border-gray-200 bg-white p-6">
            <KpiDashboard
              kpis={kpis}
              periods={periods}
              selectedPeriod={selectedPeriod}
              onPeriodChange={handlePeriodChange}
              hasData={hasData}
            />
          </section>
        )}
      </div>
    </Layout>
  )
}
