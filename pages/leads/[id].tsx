import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useMemo, useState } from 'react'
import { requireAuth } from '@/lib/auth'
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
  Calendar,
  ClipboardList,
  Clock,
  Edit,
  Euro,
  FileText,
  History,
  MessageSquare,
  Rocket,
  Save,
  StickyNote,
  User,
  Wallet,
} from 'lucide-react'
import EditLeadDialog from '@/components/EditLeadDialog'
import LeadMeetingsPanel from '@/components/fireflies/LeadMeetingsPanel'
import {
  getLeadDetailBundle,
  type LeadAlert,
  type LeadDetailBundle,
} from '@/lib/leads/lead-detail-bundle'
import type { PipelineTimelineItem } from '@/lib/pipelines/card-context.types'
import { cn } from '@/lib/utils'

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
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    await requireAuth(context)

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
    })

    return {
      props: {
        lead: {
          id: lead.id,
          estado: lead.estado ?? 'frio',
          valor: lead.valor ? Number(lead.valor) : null,
          notas: lead.notas ?? null,
          configuracion: lead.configuracion ?? null,
          prioridad: lead.prioridad ?? null,
          origen_principal: lead.origen_principal ?? null,
          created_at: lead.created_at.toISOString(),
          updated_at: lead.updated_at.toISOString(),
          contact: lead.contact,
        },
        bundle: JSON.parse(JSON.stringify(bundle)),
      },
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

const estadoLabels: Record<string, string> = {
  frio: 'Frío',
  caliente: 'Caliente',
  cerrado: 'Cerrado',
  perdido: 'Perdido',
  nuevo: 'Nuevo',
  en_proceso: 'En Proceso',
  reunion: 'Reunión',
}
const estadoColors: Record<string, string> = {
  frio: 'bg-blue-50 text-blue-700 border-blue-200',
  caliente: 'bg-orange-50 text-orange-700 border-orange-200',
  cerrado: 'bg-green-50 text-green-700 border-green-200',
  perdido: 'bg-red-50 text-red-700 border-red-200',
  nuevo: 'bg-purple-50 text-purple-700 border-purple-200',
  en_proceso: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  reunion: 'bg-violet-50 text-violet-700 border-violet-200',
}
const prioridadColors: Record<string, string> = {
  alta: 'bg-red-50 text-red-700',
  media: 'bg-yellow-50 text-yellow-700',
  baja: 'bg-gray-50 text-gray-600',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500 shrink-0 w-32">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  )
}

function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function timelineIcon(kind: PipelineTimelineItem['kind']) {
  switch (kind) {
    case 'meeting_booked':
    case 'meeting_done':
      return Calendar
    case 'project':
      return Rocket
    case 'channel':
      return MessageSquare
    case 'capture':
      return ClipboardList
    default:
      return History
  }
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
    default:
      return AlertTriangle
  }
}

function AlertsStrip({ alerts }: { alerts: LeadAlert[] }) {
  if (!alerts.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800">
        Sin avisos urgentes ahora mismo
      </div>
    )
  }

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

function LeadContextEditor({
  leadId,
  initial,
}: {
  leadId: number
  initial: string
}) {
  const [value, setValue] = useState(initial)
  const [baseline, setBaseline] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const dirty = value !== baseline

  async function save() {
    setSaving(true)
    setError('')
    try {
      const next = value.trim() || null
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      const saved = next || ''
      setValue(saved)
      setBaseline(saved)
      setSavedAt(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="shadow-sm border-gray-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <StickyNote className="h-4 w-4" />
            Contexto del lead
          </CardTitle>
          <div className="flex items-center gap-2">
            {savedAt && !dirty && (
              <span className="text-[11px] text-emerald-600">Guardado {savedAt}</span>
            )}
            <Button
              size="sm"
              variant={dirty ? 'default' : 'outline'}
              className="rounded-xl h-8"
              disabled={saving || !dirty}
              onClick={() => void save()}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Notas internas, situación comercial, acuerdos… visible en pipeline y onboarding.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={7}
          placeholder="Escribe el contexto del lead: qué necesita, presupuesto, objeciones, siguiente paso…"
          className="rounded-xl text-sm leading-relaxed resize-y min-h-[140px]"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}

function LeadHistory({ timeline }: { timeline: PipelineTimelineItem[] }) {
  const sorted = useMemo(
    () =>
      [...timeline].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
      ),
    [timeline]
  )

  return (
    <Card className="shadow-sm border-gray-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <History className="h-4 w-4" />
          Historial del lead
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Entrada, canales, reuniones y proyecto
        </p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            Aún no hay eventos en el historial
          </p>
        ) : (
          <ol className="relative space-y-0 border-l border-gray-200 ml-2">
            {sorted.map((item) => {
              const Icon = timelineIcon(item.kind)
              return (
                <li key={item.id} className="relative pl-5 pb-4 last:pb-0">
                  <span className="absolute -left-1.5 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-white ring-2 ring-gray-200">
                    <Icon className="h-2.5 w-2.5 text-gray-500" />
                  </span>
                  <p className="text-sm font-medium text-gray-900 leading-snug">{item.title}</p>
                  {item.detail && (
                    <p className="text-xs text-gray-600 mt-0.5 leading-snug">{item.detail}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">{formatDateShort(item.at)}</p>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export default function LeadDetail({ lead, bundle }: LeadDetailProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const displayName = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`

  const configureUrl = `/onboarding/configure?lead=${lead.id}&nombre=${encodeURIComponent(lead.contact?.nombre || '')}&empresa=${encodeURIComponent(lead.contact?.empresa || '')}&email=${encodeURIComponent(lead.contact?.email || '')}&ciudad=${encodeURIComponent(lead.contact?.ciudad || '')}`
  const hasConfig = !!lead.configuracion
  const projectCtx = bundle.pipeline?.project_context

  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-1 sm:px-0">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/leads">
              <Button variant="ghost" size="icon" className="shrink-0 rounded-xl">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
                {displayName}
              </h1>
              {lead.contact?.empresa && (
                <p className="text-sm text-gray-500 truncate">{lead.contact.empresa}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-12 sm:pl-0">
            {hasConfig && (
              <Link href={`/onboarding/proyectos/${lead.id}`} className="flex-1 sm:flex-initial">
                <Button variant="outline" size="sm" className="w-full rounded-xl">
                  <FileText className="mr-2 h-4 w-4" />
                  Ir a onboarding
                </Button>
              </Link>
            )}
            <Link href={configureUrl} className="flex-1 sm:flex-initial">
              {hasConfig ? (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full rounded-xl bg-gray-900 hover:bg-gray-700 text-white"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Propuesta · contrato
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="w-full rounded-xl">
                  Configurar proyecto
                </Button>
              )}
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              className="flex-1 sm:flex-initial rounded-xl"
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          </div>
        </div>

        <EditLeadDialog
          open={editOpen}
          leadId={lead.id}
          onOpenChange={setEditOpen}
          onSaved={() => router.reload()}
        />

        <AlertsStrip alerts={bundle.alerts} />

        {lead.valor != null && (
          <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white">
              <Euro className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Ingreso de venta
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {lead.valor.toLocaleString('es-ES', {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}{' '}
                €
                <span className="ml-1.5 text-xs font-normal text-gray-400">sin IVA</span>
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge
                className={`border text-xs ${estadoColors[lead.estado] || 'bg-gray-100 text-gray-700 border-gray-200'}`}
              >
                {estadoLabels[lead.estado] || lead.estado}
              </Badge>
              {lead.prioridad && (
                <Badge
                  className={`text-xs ${prioridadColors[lead.prioridad] || 'bg-gray-100 text-gray-600'}`}
                >
                  {lead.prioridad.charAt(0).toUpperCase() + lead.prioridad.slice(1)}
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <User className="h-4 w-4" />
                Datos del contacto
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.contact ? (
                <div>
                  <Row label="Nombre" value={lead.contact.nombre} />
                  <Row label="Empresa" value={lead.contact.empresa} />
                  <Row
                    label="Email"
                    value={
                      lead.contact.email ? (
                        <a
                          href={`mailto:${lead.contact.email}`}
                          className="hover:underline text-blue-600"
                        >
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
                </div>
              ) : (
                <p className="text-sm text-gray-400 py-4 text-center">Sin contacto asociado</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <ClipboardList className="h-4 w-4" />
                Datos del lead
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Row
                label="Estado"
                value={
                  <Badge
                    className={`border text-xs ${estadoColors[lead.estado] || 'bg-gray-100 text-gray-700 border-gray-200'}`}
                  >
                    {estadoLabels[lead.estado] || lead.estado}
                  </Badge>
                }
              />
              <Row
                label="Ingreso venta"
                value={
                  lead.valor != null ? (
                    <span className="font-semibold">
                      {lead.valor.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
                    </span>
                  ) : null
                }
              />
              {lead.valor != null && (
                <Row
                  label="Con IVA (21%)"
                  value={
                    <span className="text-gray-500">
                      {(lead.valor * 1.21).toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
                    </span>
                  }
                />
              )}
              <Row
                label="Prioridad"
                value={
                  lead.prioridad ? (
                    <Badge className={`text-xs ${prioridadColors[lead.prioridad] || ''}`}>
                      {lead.prioridad.charAt(0).toUpperCase() + lead.prioridad.slice(1)}
                    </Badge>
                  ) : null
                }
              />
              <Row label="Origen" value={lead.origen_principal} />
              <Row
                label="Creado"
                value={new Date(lead.created_at).toLocaleDateString('es-ES')}
              />
              <Row
                label="Actualizado"
                value={new Date(lead.updated_at).toLocaleDateString('es-ES')}
              />
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
        </div>

        <LeadContextEditor leadId={lead.id} initial={lead.notas || ''} />

        {(projectCtx?.onboarding_notes ||
          projectCtx?.onboarding_summary ||
          projectCtx?.last_meeting_summary ||
          projectCtx?.retention_excerpt) && (
          <Card className="shadow-sm border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <FileText className="h-4 w-4" />
                Contexto de proyecto / reuniones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-700">
              {projectCtx?.onboarding_summary && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                    Resumen onboarding
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap">{projectCtx.onboarding_summary}</p>
                </div>
              )}
              {projectCtx?.onboarding_notes && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                    Notas onboarding
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap">{projectCtx.onboarding_notes}</p>
                </div>
              )}
              {projectCtx?.last_meeting_summary && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                    Última reunión
                    {projectCtx.last_meeting_title ? ` · ${projectCtx.last_meeting_title}` : ''}
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap">
                    {projectCtx.last_meeting_summary}
                  </p>
                </div>
              )}
              {projectCtx?.retention_excerpt && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">
                    Retención
                  </p>
                  <p className="leading-relaxed whitespace-pre-wrap">{projectCtx.retention_excerpt}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <LeadHistory timeline={bundle.timeline} />

        <LeadMeetingsPanel leadId={lead.id} />

        {lead.valor == null && !hasConfig && (
          <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400 mb-3">
              Todavía no hay ningún coste de proyecto configurado
            </p>
            <Link href={configureUrl}>
              <Button variant="outline" size="sm" className="rounded-xl">
                Configurar proyecto
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  )
}
