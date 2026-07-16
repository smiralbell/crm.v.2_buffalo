import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { getColdCallPageProps } from '@/lib/coldcall/page-auth'
import { Button } from '@/components/ui/button'
import { displayValue, outcomeLabel, stageLabel } from '@/lib/coldcall/lead-table'
import { splitLeadDisplayFields } from '@/lib/coldcall/lead-display'
import { LeadFieldCards } from '@/components/coldcall/LeadFieldCards'
import type { ColdCallCampaign } from '@/lib/coldcall/types'
import { ArrowLeft, Loader2, Phone } from 'lucide-react'

interface LeadDetail {
  id: number
  nombre: string
  telefono: string | null
  email: string | null
  empresa: string | null
  cargo: string | null
  sector: string | null
  zona: string | null
  linkedin: string | null
  web: string | null
  cif: string | null
  direccion: string | null
  stage: string
  call_attempts: number
  notas: string | null
  raw_data: Record<string, string>
  created_at: string
  calls: { id: number; fecha: string; resultado: string; duracion: number | null; notas: string | null }[]
  activities: { id: number; activity_type: string; content: string | null; outcome: string | null; created_at: string }[]
}

export const getServerSideProps: GetServerSideProps = getColdCallPageProps

export default function LeadDetailPage() {
  const router = useRouter()
  const campaignId = router.query.id as string | undefined
  const leadId = router.query.leadId as string | undefined

  const [campaign, setCampaign] = useState<ColdCallCampaign | null>(null)
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!campaignId || !leadId) return
    setLoading(true)
    fetch(`/api/coldcall/campaigns/${campaignId}/leads/${leadId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setCampaign(d.campaign)
        setLead(d.lead)
      })
      .catch(() => {
        setCampaign(null)
        setLead(null)
      })
      .finally(() => setLoading(false))
  }, [campaignId, leadId])

  if (loading) {
    return (
      <Layout>
        <div className="py-20 flex justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
        </div>
      </Layout>
    )
  }

  if (!lead || !campaign) {
    return (
      <Layout>
        <p className="text-sm text-red-600">Lead no encontrado</p>
        <Button variant="link" asChild className="mt-2 px-0">
          <Link href={`/coldcalling/campanas/${campaignId}`}>Volver a la campaña</Link>
        </Button>
      </Layout>
    )
  }

  const leadDisplay = splitLeadDisplayFields(
    { ...lead, callsCount: lead.calls.length },
    campaign.column_mapping
  )

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl">
        <Link
          href={`/coldcalling/campanas/${campaignId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a {campaign.name}
        </Link>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div className="space-y-3">
            <h1 className="text-xl font-semibold text-gray-900">{displayValue(lead.nombre)}</h1>
            <LeadFieldCards
              leadName={lead.nombre}
              primary={leadDisplay.primary}
              extra={leadDisplay.extra}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-100 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{lead.call_attempts}</p>
              <p className="text-xs text-gray-500 mt-0.5">Intentos de llamada</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{lead.calls.length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Llamadas registradas</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3 text-center col-span-2 sm:col-span-1">
              <p className="text-sm font-semibold text-gray-900">{stageLabel(lead.stage)}</p>
              <p className="text-xs text-gray-500 mt-0.5">Estado actual</p>
            </div>
          </div>

          <Button size="sm" className="rounded-xl gap-1.5" asChild>
            <Link href={`/coldcalling/campanas/${campaignId}/llamadas?leadId=${lead.id}`}>
              <Phone className="h-3.5 w-3.5" />
              Ir a llamar
            </Link>
          </Button>
        </div>

        {lead.notas?.trim() && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm space-y-2">
            <h2 className="text-sm font-semibold text-amber-950">Últimas notas del comercial</h2>
            <p className="text-sm text-amber-950/90 whitespace-pre-line leading-relaxed">{lead.notas}</p>
          </div>
        )}

        {lead.calls.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Historial de llamadas</h2>
            <div className="space-y-2">
              {lead.calls.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-gray-100 px-3 py-2 text-sm space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-800">{outcomeLabel(c.resultado)}</span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {new Date(c.fecha).toLocaleString('es-ES')}
                    </span>
                  </div>
                  {c.notas?.trim() && (
                    <p className="text-xs text-gray-600 whitespace-pre-line">{c.notas}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
