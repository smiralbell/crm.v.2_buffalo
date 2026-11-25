import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useCallback, useEffect, useState } from 'react'
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
  Users,
  Wallet,
  X,
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
import LeadCorreos from '@/components/leads/LeadCorreos'
import LeadReunionDialog from '@/components/leads/LeadReunionDialog'
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

function AlertsStrip({ leadId, alerts }: { leadId: number; alerts: LeadAlert[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const visible = alerts.filter((a) => !hidden.has(a.id))
  if (!visible.length) return null

  const dismiss = (id: string) => {
    setHidden((prev) => new Set(prev).add(id))
    void fetch(`/api/leads/${leadId}/avisos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: id }),
    }).then((r) => {
      if (!r.ok)
        setHidden((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
    })
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {visible.map((a) => {
        const Icon = alertIcon(a.kind)
        const box =
          a.severity === 'bad'
            ? 'border-red-200 bg-red-50 text-red-900'
            : a.severity === 'warn'
              ? 'border-amber-200 bg-amber-50/80 text-amber-950'
              : 'border-sky-200 bg-sky-50 text-sky-950'
        const text = (
          <>
            <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{a.title}</p>
              <p className="mt-0.5 text-xs leading-snug opacity-80">{a.message}</p>
            </div>
          </>
        )
        return (
          <div key={a.id} className={cn('group flex items-start gap-3 rounded-xl border px-3.5 py-3', box)}>
            {a.href ? (
              <Link href={a.href} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-80">
                {text}
              </Link>
            ) : (
              <div className="flex min-w-0 flex-1 items-start gap-3">{text}</div>
            )}
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              className="-mr-1 shrink-0 rounded-md p-1 opacity-50 transition hover:bg-black/5 hover:opacity-100"
              title="Quitar aviso"
              aria-label="Quitar aviso"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default function LeadDetail({ lead, bundle, metaAds }: LeadDetailProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [reunionOpen, setReunionOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [marking, setMarking] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const displayName = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
  const esCliente = Boolean(bundle.proyecto) || ['cerrado', 'activo'].includes(lead.estado)
  const estadoDesfasado = Boolean(bundle.proyecto) && !['cerrado', 'activo', 'perdido'].includes(lead.estado)

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

  const marcarCliente = async () => {
    setMarking(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'activo' }),
      })
      if (!res.ok) throw new Error('No se pudo cambiar el estado')
      router.replace(router.asPath)
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'No se pudo cambiar el estado')
    } finally {
      setMarking(false)
    }
  }

  return (
    <Layout>
      <div className="w-full space-y-5">
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
                {esCliente && (
                  <Badge className="border border-emerald-200 bg-emerald-50 text-xs text-emerald-700">Cliente</Badge>
                )}
                <Badge className={`border text-xs ${estadoBadgeClass(lead.estado)}`}>{estadoLabel(lead.estado)}</Badge>
                {lead.prioridad && (
                  <Badge className={`text-xs ${prioridadColors[lead.prioridad] || 'bg-gray-100 text-gray-600'}`}>
                    {lead.prioridad.charAt(0).toUpperCase() + lead.prioridad.slice(1)}
                  </Badge>
                )}
                {estadoDesfasado && (
                  <button
                    type="button"
                    onClick={() => void marcarCliente()}
                    disabled={marking}
                    className="text-xs font-medium text-emerald-700 underline-offset-2 hover:underline disabled:opacity-50"
                    title="Tiene proyecto: pasa el lead a Activo"
                  >
                    {marking ? 'Guardando…' : 'Marcar como Activo'}
                  </button>
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
              <div className="mr-2 text-right">
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
        <LeadReunionDialog leadId={lead.id} open={reunionOpen} onOpenChange={setReunionOpen} onSaved={refresh} />

        <AlertsStrip leadId={lead.id} alerts={bundle.alerts} />

        {/* Resumen y datos, a la misma altura */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <LeadSummaryCard leadId={lead.id} refreshKey={refreshKey} />
          </div>
          <Card className="h-full border-gray-200 shadow-sm">
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
              <Row label="Actualizado" value={new Date(lead.updated_at).toLocaleDateString('es-ES')} />
            </CardContent>
          </Card>
        </div>

        {/* Todo el contexto, a lo ancho */}
        <div id="mapa-contexto" className="scroll-mt-6">
          <LeadContextMap
            leadId={lead.id}
            refreshKey={refreshKey}
            actions={
              <button
                type="button"
                onClick={() => setReunionOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50"
                title="Guarda una reunión en persona: notas escritas o audio que se transcribe"
              >
                <Users className="h-3.5 w-3.5" /> Reunión presencial
              </button>
            }
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="min-w-0 space-y-5 lg:col-span-2">
            <LeadContextPanel leadId={lead.id} initial={lead.notas || ''} />

            <CrmActivityTimeline
              contactId={lead.contact?.id ?? null}
              leadId={lead.id}
              derived={bundle.timeline}
              title="Historial"
              subtitle="Entrada, reuniones, correos, documentos y notas"
            />

            <LeadMeetingsPanel leadId={lead.id} />
          </div>

          <aside className="min-w-0 space-y-5">
            <LeadCorreos leadId={lead.id} mainEmail={lead.contact?.email ?? null} onImported={refresh} />
            <LeadArchivos leadId={lead.id} />
            {metaAds && <MetaAdsAttributionCard data={metaAds} />}
          </aside>
        </div>
      </div>
    </Layout>
  )
}
