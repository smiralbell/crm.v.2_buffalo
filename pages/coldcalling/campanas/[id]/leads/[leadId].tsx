import { GetServerSideProps } from 'next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { useAuth } from '@/components/AuthContext'
import { campanasListHref } from '@/lib/coldcall/routes'
import { getColdCallPageProps } from '@/lib/coldcall/page-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { displayValue, stageLabel } from '@/lib/coldcall/lead-table'
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

const EXTRA_DB_FIELDS: { key: keyof LeadDetail; label: string }[] = [
  { key: 'empresa', label: 'Denominación social' },
  { key: 'cargo', label: 'Posición' },
  { key: 'cif', label: 'CIF' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'zona', label: 'Ciudad' },
  { key: 'sector', label: 'Sector' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'web', label: 'Web' },
]

export default function LeadDetailPage() {
  const router = useRouter()
  const campaignId = router.query.id as string | undefined
  const leadId = router.query.leadId as string | undefined

  const [campaign, setCampaign] = useState<ColdCallCampaign | null>(null)
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [importColumns, setImportColumns] = useState<string[]>([])
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
        setImportColumns(d.import_columns || [])
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

  const shownRawKeys = new Set<string>()
  const extraFromRaw: { label: string; value: string }[] = []
  for (const col of importColumns) {
    const v = lead.raw_data?.[col]
    if (v?.trim()) {
      shownRawKeys.add(col)
      if (!['nombre', 'telefono', 'correo', 'email'].includes(col.toLowerCase())) {
        extraFromRaw.push({ label: col, value: v.trim() })
      }
    }
  }
  for (const [k, v] of Object.entries(lead.raw_data || {})) {
    if (!shownRawKeys.has(k) && v?.trim()) {
      extraFromRaw.push({ label: k, value: v.trim() })
    }
  }

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
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Teléfono</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{displayValue(lead.telefono)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Correo</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{displayValue(lead.email)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">Estado</p>
                <Badge variant="outline" className="mt-1 font-normal">
                  {stageLabel(lead.stage)}
                </Badge>
              </div>
            </div>
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
            <Link href={`/coldcalling/campanas/${campaignId}/llamadas`}>
              <Phone className="h-3.5 w-3.5" />
              Ir a llamar
            </Link>
          </Button>
        </div>

        {(extraFromRaw.length > 0 ||
          EXTRA_DB_FIELDS.some((f) => lead[f.key] && String(lead[f.key]).trim())) && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-900">Datos del lead</h2>
            <dl className="grid gap-3 sm:grid-cols-2">
              {EXTRA_DB_FIELDS.map(({ key, label }) => {
                const v = lead[key]
                if (!v || !String(v).trim()) return null
                return (
                  <div key={key} className="rounded-lg bg-gray-50 px-3 py-2">
                    <dt className="text-xs text-gray-500">{label}</dt>
                    <dd className="text-sm text-gray-900 mt-0.5 break-words">{String(v)}</dd>
                  </div>
                )
              })}
              {extraFromRaw.map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-gray-50 px-3 py-2">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="text-sm text-gray-900 mt-0.5 break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {lead.calls.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">Historial de llamadas</h2>
            <div className="space-y-2">
              {lead.calls.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
                  <span className="text-gray-800 capitalize">{c.resultado.replace(/_/g, ' ')}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(c.fecha).toLocaleString('es-ES')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
