import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { requireAuth } from '@/lib/auth'
import { canSeeClientPrices } from '@/lib/price-visibility'
import { sanitizeConfiguracionPrices } from '@/lib/onboarding/sanitize-config-prices'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Calendar,
  ClipboardList,
  Clock,
  Download,
  Edit,
  Euro,
  FileText,
  Save,
  StickyNote,
  User,
  Wallet,
} from 'lucide-react'
import { LeadOutcomeField } from '@/components/marketing/LeadOutcome'
import { LeadAttributionField } from '@/components/marketing/LeadAttribution'
import EditLeadDialog from '@/components/EditLeadDialog'
import LeadMeetingsPanel from '@/components/fireflies/LeadMeetingsPanel'
import CrmActivityTimeline from '@/components/crm/CrmActivityTimeline'
import LeadContextPanel, { exportLeadContext } from '@/components/leads/LeadContextPanel'
import LeadArchivos from '@/components/leads/LeadArchivos'
import LeadSummaryCard from '@/components/leads/LeadSummaryCard'
import LeadContextMap from '@/components/leads/LeadContextMap'
import {
  getLeadDetailBundle,
  type LeadAlert,
  type LeadDetailBundle,
} from '@/lib/leads/lead-detail-bundle'
import { cn } from '@/lib/utils'
import { estadoLabel, estadoBadgeClass } from '@/lib/leads/estados'
import { getMetaAttributionByLeadId } from '@/lib/integrations/meta/store'
import { parseGraphLead } from '@/lib/integrations/meta/parse'
import MetaAdsAttributionCard, {
  type MetaAdsAttributionView,
} from '@/components/leads/MetaAdsAttributionCard'

interface LeadDetailProps {
  lead: {
    id: number
    estado: string
    valor: number | null
    notas: string | null
    configuracion: string | null
    prioridad: string | null
    origen_principal: string | null
    created_at: string
    updated_at: string
    contact: {
      id: number
      nombre: string | null
      email: string | null
      empresa: string | null
      telefono: string | null
      ciudad: string | null
    } | null
  }
  bundle: LeadDetailBundle
  metaAds: MetaAdsAttributionView | null
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const authUser = await requireAuth(context)
    const showPrices = canSeeClientPrices(authUser.role)

    const id = parseInt(context.params?.id as string)

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            nombre: true,
            email: true,
            empresa: true,
            telefono: true,
            ciudad: true,
          },
        },
      },
    })

    if (!lead) return { notFound: true }

    const bundle = await getLeadDetailBundle({
      leadId: lead.id,
      contactId: lead.contact?.id ?? null,
      email: lead.contact?.email ?? null,
      contactName: lead.contact?.nombre ?? null,
      leadUpdatedAt: lead.updated_at,
      leadEstado: lead.estado,
      hidePrices: !showPrices,
    })

    let metaAds: MetaAdsAttributionView | null = null
    try {
      const ev = await getMetaAttributionByLeadId(lead.id)
      if (ev) {
        const parsed = ev.graph_payload ? parseGraphLead(ev.leadgen_id, ev.graph_payload) : null
        metaAds = {
          leadgen_id: ev.leadgen_id,
          page_id: ev.page_id,
          page_name: ev.page_name,
          platform: ev.platform,
          is_organic: ev.is_organic,
          form_id: ev.form_id,
          form_name: ev.form_name,
          campaign_id: ev.campaign_id,
          campaign_name: ev.campaign_name,
          adset_id: ev.adset_id,
          adset_name: ev.adset_name,
          ad_id: ev.ad_id,
          ad_name: ev.ad_name,
          answers: parsed?.answers || [],
        }
      }
    } catch {
      metaAds = null
    }

    return {
      props: {
        lead: {
          id: lead.id,
          estado: lead.estado ?? 'frio',
          valor: showPrices && lead.valor ? Number(lead.valor) : null,
          notas: lead.notas ?? null,
          configuracion: showPrices ? lead.configuracion ?? null : sanitizeConfiguracionPrices(lead.configuracion),
          prioridad: lead.prioridad ?? null,
          origen_principal: lead.origen_principal ?? null,
          created_at: lead.created_at.toISOString(),
          updated_at: lead.updated_at.toISOString(),
          contact: lead.contact,
        },
        bundle: JSON.parse(JSON.stringify(bundle)),
        metaAds,
      },
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

const prioridadColors: Record<string, string> = {
  alta: 'bg-red-50 text-red-700',
  media: 'bg-yellow-50 text-yellow-700',
  baja: 'bg-gray-50 text-gray-600',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500 shrink-0 w-24 sm:w-32">{label}</span>
      <span className="min-w-0 text-sm text-gray-900 text-right break-words [overflow-wrap:anywhere]">{value}</span>
    </div>
  )
}

function alertIcon(kind: LeadAlert['kind']) {
  switch (kind) {
    case 'meeting_upcoming':
    case 'meeting_stage':
      return Calendar
    case 'payment_overdue':
    case 'payment_pending':
      return Wallet
    case 'project_delayed':
    case 'project_no_start':
      return Clock
    case 'manual_alert':
      return Bell
    default:
      return AlertTriangle
  }
}

function AlertsStrip({ alerts }: { alerts: LeadAlert[] }) {
  if (!alerts.length) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-gray-900">Avisos</h2>
        <span className="text-xs text-gray-400">{alerts.length}</span>
      </div>
      <div className="space-y-2">
        {alerts.map((a) => {
          const Icon = alertIcon(a.kind)
          const box =
            a.severity === 'bad'
              ? 'border-red-200 bg-red-50 text-red-900'
              : a.severity === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-950'
                : 'border-sky-200 bg-sky-50 text-sky-950'
          const inner = (
            <div
              className={cn(
                'rounded-xl border px-3.5 py-3 flex gap-3 items-start',
                box,
                a.href && 'hover:shadow-sm transition-shadow'
              )}
            >
              <Icon className="h-4 w-4 mt-0.5 shrink-0 opacity-80" />
              <div className="min-w-0">
                <p className="text-sm font-semibold leading-snug">{a.title}</p>
                <p className="text-xs mt-0.5 opacity-80 leading-snug">{a.message}</p>
              </div>
            </div>
          )
          return a.href ? (
            <Link key={a.id} href={a.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={a.id}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}

export default function LeadDetail({ lead, bundle, metaAds }: LeadDetailProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const displayName = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#contexto') return
    document.getElementById('contexto')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const exportar = async () => {
    setExporting(true)
    try {
      await exportLeadContext(lead.id)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo exportar')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-6xl space-y-4 px-1 sm:px-0">
        {/* Cabecera */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/leads">
              <Button variant="ghost" size="icon" className="shrink-0 rounded-xl">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">{displayName}</h1>
                <Badge className={`border text-xs ${estadoBadgeClass(lead.estado)}`}>{estadoLabel(lead.estado)}</Badge>
                {lead.prioridad && (
                  <Badge className={`text-xs ${prioridadColors[lead.prioridad] || 'bg-gray-100 text-gray-600'}`}>
                    {lead.prioridad.charAt(0).toUpperCase() + lead.prioridad.slice(1)}
                  </Badge>
                )}
              </div>
              <p className="truncate text-sm text-gray-500">
                {[lead.contact?.empresa, lead.origen_principal, `creado ${new Date(lead.created_at).toLocaleDateString('es-ES')}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
            {lead.valor != null && (
              <div className="mr-1 text-right">
                <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Ingreso de venta</p>
                <p className="text-lg font-bold leading-tight text-gray-900">
                  {lead.valor.toLocaleString('es-ES', { maximumFractionDigits: 0 })} €
                  <span className="ml-1 text-[11px] font-normal text-gray-400">sin IVA</span>
                </p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => void exportar()} disabled={exporting} className="rounded-xl">
              <Download className="mr-2 h-4 w-4" />
              {exporting ? 'Exportando…' : 'Exportar contexto'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="rounded-xl">
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>

        <EditLeadDialog open={editOpen} leadId={lead.id} onOpenChange={setEditOpen} onSaved={() => router.reload()} />

        <AlertsStrip alerts={bundle.alerts} />

        <LeadSummaryCard leadId={lead.id} />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Columna principal */}
          <div className="min-w-0 space-y-4 lg:col-span-2">
            <LeadContextMap leadId={lead.id} />

            <LeadContextPanel leadId={lead.id} initial={lead.notas || ''} />


            <CrmActivityTimeline
              contactId={lead.contact?.id ?? null}
              leadId={lead.id}
              derived={bundle.timeline}
              title="Historial del lead"
              subtitle="Entrada, reuniones, correos, documentos y notas manuales"
            />

            <LeadMeetingsPanel leadId={lead.id} />
          </div>

          {/* Columna lateral */}
          <aside className="min-w-0 space-y-4">
            <Card className="shadow-sm border-gray-200">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User className="h-4 w-4" />
                  Datos
                </CardTitle>
              </CardHeader>
              <CardContent>
                {lead.contact ? (
                  <>
                    <Row label="Empresa" value={lead.contact.empresa} />
                    <Row
                      label="Email"
                      value={
                        lead.contact.email ? (
                          <a href={`mailto:${lead.contact.email}`} className="break-all text-blue-600 hover:underline">
                            {lead.contact.email}
                          </a>
                        ) : null
                      }
                    />
                    <Row
                      label="Teléfono"
                      value={
                        lead.contact.telefono ? (
                          <a href={`tel:${lead.contact.telefono}`} className="hover:underline">
                            {lead.contact.telefono}
                          </a>
                        ) : null
                      }
                    />
                    <Row label="Ciudad" value={lead.contact.ciudad} />
                  </>
                ) : (
                  <p className="py-2 text-sm text-gray-400">Sin contacto asociado</p>
                )}
                <Row label="Origen" value={lead.origen_principal} />
                <LeadAttributionField leadId={lead.id} />
                <LeadOutcomeField leadId={lead.id} name={displayName} />
                {lead.valor != null && (
                  <Row
                    label="Con IVA (21%)"
                    value={
                      <span className="text-gray-500">
                        {(lead.valor * 1.21).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €
                      </span>
                    }
                  />
                )}
                <Row label="Actualizado" value={new Date(lead.updated_at).toLocaleDateString('es-ES')} />
                {bundle.proyecto && (
                  <Row
                    label="Proyecto"
                    value={
                      <Link href={bundle.proyecto.href} className="text-blue-600 hover:underline">
                        {bundle.proyecto.name}
                      </Link>
                    }
                  />
                )}
              </CardContent>
            </Card>

            <LeadArchivos leadId={lead.id} />

            {metaAds && <MetaAdsAttributionCard data={metaAds} />}
          </aside>
        </div>
      </div>
    </Layout>
  )
}
