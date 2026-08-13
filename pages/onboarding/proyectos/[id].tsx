import { GetServerSideProps } from 'next'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import AssignDevelopersButton from '@/components/onboarding/AssignDevelopersButton'
import DeleteOnboardingProjectDialog from '@/components/onboarding/DeleteOnboardingProjectDialog'
import OnboardingSectionTabs from '@/components/onboarding/OnboardingSectionTabs'
import { DeveloperTags } from '@/components/gestion-proyecto/ProjectDevelopersPanel'
import {
  ArrowLeft, Pencil, Mail, Phone, MapPin, Building2,
  Trash2, CheckCircle2, PlayCircle, Calendar,
} from 'lucide-react'
import { buildProjectViewData, fmt } from '@/lib/onboarding/project-view'
import { isAuditConfiguracion } from '@/lib/onboarding/audit/config-detect'
import LeadMeetingsPanel from '@/components/fireflies/LeadMeetingsPanel'
import OnboardingDocumentActions from '@/components/onboarding/OnboardingDocumentActions'
import OnboardingInvoicesThread from '@/components/onboarding/OnboardingInvoicesThread'
import ProjectSummaryCard from '@/components/onboarding/ProjectSummaryCard'
import CrmActivityTimeline from '@/components/crm/CrmActivityTimeline'

interface Props {
  lead: {
    id: number
    estado: string
    valor: number | null
    notas: string | null
    configuracion: string | null
    prioridad: string | null
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
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  try {
    await requireAuth(context)
    const id = parseInt(context.params?.id as string, 10)
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true, nombre: true, email: true, empresa: true,
            telefono: true, ciudad: true,
          },
        },
      },
    })
    if (!lead) return { notFound: true }

    return {
      props: {
        lead: {
          id: lead.id,
          estado: lead.estado ?? 'frio',
          valor: lead.valor ? Number(lead.valor) : null,
          notas: lead.notas ?? null,
          configuracion: lead.configuracion ?? null,
          prioridad: lead.prioridad ?? null,
          created_at: lead.created_at.toISOString(),
          updated_at: lead.updated_at.toISOString(),
          contact: lead.contact,
        },
      },
    }
  } catch {
    return { redirect: { destination: '/login', permanent: false } }
  }
}

const estadoLabel: Record<string, string> = {
  frio: 'Lead', caliente: 'Contacto', propuesta: 'Propuesta',
  cerrado: 'Contrato', activo: 'Activo', negociando: 'Negociando',
}

function MetaRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-2.5 border-b border-gray-100 last:border-0">
      <dt className="text-[12px] text-gray-400 shrink-0">{label}</dt>
      <dd className="text-sm font-medium text-gray-900 text-right min-w-0">{children}</dd>
    </div>
  )
}

export default function ProyectoDetailPage({ lead }: Props) {
  const router = useRouter()
  const [developers, setDevelopers] = useState<{ id: number; name: string }[]>([])
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [esBuffalo, setEsBuffalo] = useState(false)
  const [buffaloLoading, setBuffaloLoading] = useState(false)
  const [buffaloError, setBuffaloError] = useState('')
  const [timeline, setTimeline] = useState<{
    tiempo_previsto: string | null
    fecha_inicio_real: string | null
    fecha_fin_real: string | null
  }>({ tiempo_previsto: null, fecha_inicio_real: null, fecha_fin_real: null })
  const [dbFees, setDbFees] = useState<{ setup: number | null; monthly: number | null }>({
    setup: null,
    monthly: null,
  })

  const loadDevelopers = () => {
    fetch(`/api/gestion-proyecto/proyectos/by-lead/${lead.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDevelopers(d?.developers || []))
      .catch(() => setDevelopers([]))
  }

  useEffect(() => {
    loadDevelopers()
  }, [lead.id])

  const loadBuffaloFlag = () => {
    fetch(`/api/onboarding/projects/${lead.id}`)
      .then((r) => r.json())
      .then((d) => {
        setEsBuffalo(Boolean(d.proyecto?.es_buffalo))
        setTimeline({
          tiempo_previsto: d.proyecto?.tiempo_previsto ?? null,
          fecha_inicio_real: d.proyecto?.fecha_inicio_real ?? null,
          fecha_fin_real: d.proyecto?.fecha_fin_real ?? null,
        })
        setDbFees({
          setup:
            d.proyecto?.setup_fee_eur != null ? Number(d.proyecto.setup_fee_eur) : null,
          monthly:
            d.proyecto?.monthly_fee_eur != null ? Number(d.proyecto.monthly_fee_eur) : null,
        })
      })
      .catch(() => setEsBuffalo(false))
  }

  useEffect(() => {
    loadBuffaloFlag()
  }, [lead.id])

  const fmtDate = (ymd: string | null) => {
    if (!ymd) return null
    return new Date(`${ymd}T12:00:00`).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const toggleBuffalo = async () => {
    setBuffaloLoading(true)
    setBuffaloError('')
    try {
      const res = await fetch(`/api/onboarding/projects/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ es_buffalo: !esBuffalo }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar')
      setEsBuffalo(Boolean(data.proyecto?.es_buffalo ?? !esBuffalo))
    } catch (e) {
      setBuffaloError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBuffaloLoading(false)
    }
  }

  const displayName = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
  const initial = (displayName || '?').charAt(0).toUpperCase()
  const projectBase = useMemo(
    () => buildProjectViewData(lead.configuracion, lead.valor, lead.notas),
    [lead.configuracion, lead.valor, lead.notas]
  )
  const project = useMemo(() => {
    const setupTotal =
      dbFees.setup != null && dbFees.setup > 0 ? dbFees.setup : projectBase.setupTotal
    const maintMonthly =
      dbFees.monthly != null && dbFees.monthly > 0
        ? dbFees.monthly
        : projectBase.maintMonthly
    const pay1 = Math.ceil(setupTotal / 2)
    const pay2 = setupTotal - pay1
    return {
      ...projectBase,
      setupTotal,
      maintMonthly,
      maintLabel:
        maintMonthly != null
          ? projectBase.maintLabel || 'Mensualidad'
          : null,
      pay1,
      pay2,
    }
  }, [projectBase, dbFees])

  const configureUrl = useMemo(() => {
    const p = new URLSearchParams()
    p.set('lead', String(lead.id))
    if (lead.contact?.nombre)  p.set('nombre', lead.contact.nombre)
    if (lead.contact?.empresa)  p.set('empresa', lead.contact.empresa)
    if (lead.contact?.email)    p.set('email', lead.contact.email)
    if (lead.contact?.ciudad)   p.set('ciudad', lead.contact.ciudad || '')
    p.set('edit', '1')
    return `/onboarding/configure?${p.toString()}`
  }, [lead])

  const auditUrl = useMemo(() => {
    const p = new URLSearchParams({ lead: String(lead.id) })
    if (lead.contact?.nombre) p.set('nombre', lead.contact.nombre)
    if (lead.contact?.empresa) p.set('empresa', lead.contact.empresa)
    if (lead.contact?.email) p.set('email', lead.contact.email)
    return `/onboarding/notas?${p.toString()}`
  }, [lead])

  const hasEconomics =
    project.setupTotal > 0 || (project.maintMonthly != null && project.maintMonthly > 0)

  const startLabel = fmtDate(timeline.fecha_inicio_real)
  const endLabel = timeline.fecha_fin_real
    ? fmtDate(timeline.fecha_fin_real)
    : null
  const inProgress = Boolean(timeline.fecha_inicio_real) && !timeline.fecha_fin_real

  return (
    <Layout>
      <div className="w-full space-y-8">
        <OnboardingSectionTabs active="projects" />

        <div className="mx-auto w-full max-w-6xl space-y-8">
          {/* Back */}
          <Link
            href="/onboarding?tab=projects"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Proyectos
          </Link>

          {/* Hero */}
          <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-white text-lg font-semibold tracking-tight shadow-sm">
                {initial}
              </div>
              <div className="min-w-0 space-y-1.5">
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900 truncate">
                  {displayName}
                </h1>
                {lead.contact?.empresa && (
                  <p className="text-sm text-gray-500 truncate">{lead.contact.empresa}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-700">
                    {estadoLabel[lead.estado] || lead.estado}
                  </span>
                  {esBuffalo && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-50 text-emerald-800 border border-emerald-100">
                      <CheckCircle2 className="h-3 w-3" />
                      Buffalo
                    </span>
                  )}
                  {isAuditConfiguracion(lead.configuracion) && (
                    <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-sky-50 text-sky-800 border border-sky-100">
                      Auditoría
                    </span>
                  )}
                  {project.ref && (
                    <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-mono font-medium tracking-wide bg-white text-gray-500 border border-gray-200">
                      {project.ref}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Link
                href={auditUrl}
                className="inline-flex items-center gap-2 px-4 h-10 text-sm font-medium rounded-xl bg-sky-50 text-sky-900 border border-sky-200 hover:bg-sky-100 transition-colors"
              >
                <PlayCircle className="h-4 w-4" />
                Abrir cuaderno de reuniones
              </Link>
              {!esBuffalo ? (
                <button
                  type="button"
                  onClick={toggleBuffalo}
                  disabled={buffaloLoading || !lead.configuracion}
                  className="inline-flex items-center gap-2 px-4 h-10 text-sm font-medium rounded-xl bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
                  title={
                    lead.configuracion
                      ? 'Poner en marcha como proyecto real de Buffalo'
                      : 'Necesitas configuración primero'
                  }
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {buffaloLoading ? '…' : 'Poner en marcha'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleBuffalo}
                  disabled={buffaloLoading}
                  className="inline-flex items-center gap-2 px-4 h-10 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Quitar de Buffalo
                </button>
              )}
              <AssignDevelopersButton leadId={lead.id} onAssigned={loadDevelopers} />
              <Link
                href={configureUrl}
                className="inline-flex items-center gap-2 px-4 h-10 text-sm font-medium rounded-xl border border-gray-200 text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Link>
              <button
                type="button"
                onClick={() => setDeleteOpen(true)}
                className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 transition-colors"
                title="Eliminar proyecto"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </header>

          {buffaloError && (
            <p className="text-sm text-red-600">{buffaloError}</p>
          )}

          <DeleteOnboardingProjectDialog
            open={deleteOpen}
            leadId={lead.id}
            projectName={displayName}
            onOpenChange={setDeleteOpen}
            onDeleted={() => {
              void router.push('/onboarding?tab=projects')
            }}
          />

          <ProjectSummaryCard
            leadId={lead.id}
            projectName={project.projectName}
            fallbackName={
              lead.contact?.empresa || lead.contact?.nombre || displayName
            }
            projectDefinition={project.projectDefinition}
            projectContext={project.projectContext}
            scopeItems={project.scopeItems}
            notebookHref={auditUrl}
          />

          {project.projectContext && (
            <details className="group rounded-2xl border border-gray-200 bg-white px-6 py-4 sm:px-8">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    Contexto completo
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Materia prima del cuaderno, investigación y reuniones (texto bruto).
                  </p>
                </div>
                <span className="text-xs font-medium text-gray-400 group-open:hidden">
                  Ver
                </span>
                <span className="text-xs font-medium text-gray-400 hidden group-open:inline">
                  Ocultar
                </span>
              </summary>
              <div className="mt-4 max-h-72 overflow-y-auto rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-gray-600">
                  {project.projectContext.replace(
                    /┌[\s\S]*?Ficha\s*web/gi,
                    '[Ficha web omitida]'
                  )}
                </pre>
              </div>
            </details>
          )}

          {/* Documentos: propuesta, factura, contrato, pre-kick-off */}
          <div
            id="documentos"
            className="rounded-2xl border border-gray-200 bg-white px-5 py-5 sm:px-6 sm:py-6 scroll-mt-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Documentación
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Se genera con el contexto del cuaderno, la definición y el historial del lead.
                </p>
              </div>
              <Link
                href={`/onboarding/notas?lead=${lead.id}`}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs font-semibold hover:bg-emerald-100 transition-colors"
              >
                Abrir cuaderno
              </Link>
            </div>
            <OnboardingDocumentActions leadId={lead.id} />
          </div>

          <OnboardingInvoicesThread leadId={lead.id} />

          {/* Economics — single strip */}
          {hasEconomics && (
            <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-gray-100">
                <div className="px-5 py-5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Setup</p>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">
                    {project.setupTotal > 0 ? fmt(project.setupTotal) : '—'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">sin IVA</p>
                </div>
                <div className="px-5 py-5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">1er pago</p>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">
                    {project.setupTotal > 0 ? fmt(project.pay1) : '—'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">inicio · 50%</p>
                </div>
                <div className="px-5 py-5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">2º pago</p>
                  <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">
                    {project.setupTotal > 0 ? fmt(project.pay2) : '—'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">producción · 50%</p>
                </div>
                <div className="px-5 py-5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Mensual</p>
                  {project.maintMonthly != null && project.maintMonthly > 0 ? (
                    <>
                      <p className="mt-1.5 text-xl font-semibold tabular-nums text-gray-900">
                        {fmt(project.maintMonthly)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {project.maintLabel || '/mes'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1.5 text-xl font-semibold text-gray-300">—</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">sin recurrente</p>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Timeline */}
          <section className="rounded-2xl border border-gray-200 bg-white px-6 py-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-sm font-semibold text-gray-900">Fechas</h2>
              {timeline.tiempo_previsto && (
                <span className="text-xs text-gray-400">
                  Previsto · <span className="text-gray-700 font-medium">{timeline.tiempo_previsto}</span>
                </span>
              )}
            </div>

            <div className="relative flex items-start justify-between gap-4">
              <div className="absolute left-4 right-4 top-[11px] h-px bg-gray-100" aria-hidden />
              <div
                className={
                  endLabel
                    ? 'absolute left-4 right-4 top-[11px] h-px bg-emerald-400'
                    : inProgress
                      ? 'absolute left-4 top-[11px] h-px w-1/2 bg-amber-300'
                      : 'absolute left-4 top-[11px] h-px w-0'
                }
                aria-hidden
              />

              <div className="relative z-[1] flex flex-col items-start gap-2 min-w-0 flex-1">
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 bg-white ${
                    startLabel ? 'border-gray-900' : 'border-gray-200'
                  }`}
                >
                  {startLabel ? (
                    <span className="h-2 w-2 rounded-full bg-gray-900" />
                  ) : null}
                </span>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Inicio</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">
                    {startLabel || 'Sin definir'}
                  </p>
                </div>
              </div>

              <div className="relative z-[1] flex flex-col items-end gap-2 min-w-0 flex-1 text-right">
                <span
                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 bg-white ${
                    endLabel
                      ? 'border-emerald-500'
                      : inProgress
                        ? 'border-amber-400'
                        : 'border-gray-200'
                  }`}
                >
                  {endLabel ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ) : inProgress ? (
                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                  ) : null}
                </span>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Fin</p>
                  <p className={`text-sm font-medium mt-0.5 ${inProgress ? 'text-amber-700' : 'text-gray-900'}`}>
                    {endLabel || (inProgress ? 'En curso' : 'Sin definir')}
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-5 pt-4 border-t border-gray-100 text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Actualizado{' '}
              {new Date(lead.updated_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </p>
          </section>

          {/* Contact + project meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Cliente</h2>
              <p className="text-[11px] text-gray-400 mb-4">Datos de contacto</p>

              <div className="space-y-3">
                {lead.contact?.nombre && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
                      <span className="text-xs font-semibold">{initial}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400">Nombre</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{lead.contact.nombre}</p>
                    </div>
                  </div>
                )}
                {lead.contact?.empresa && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
                      <Building2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400">Empresa</p>
                      <p className="text-sm font-medium text-gray-900 truncate">{lead.contact.empresa}</p>
                    </div>
                  </div>
                )}
                {lead.contact?.email && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
                      <Mail className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400">Email</p>
                      <a
                        href={`mailto:${lead.contact.email}`}
                        className="text-sm font-medium text-gray-900 hover:underline truncate block"
                      >
                        {lead.contact.email}
                      </a>
                    </div>
                  </div>
                )}
                {lead.contact?.telefono && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
                      <Phone className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400">Teléfono</p>
                      <p className="text-sm font-medium text-gray-900">{lead.contact.telefono}</p>
                    </div>
                  </div>
                )}
                {lead.contact?.ciudad && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
                      <MapPin className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-400">Ciudad</p>
                      <p className="text-sm font-medium text-gray-900">{lead.contact.ciudad}</p>
                    </div>
                  </div>
                )}
                {!lead.contact?.nombre && !lead.contact?.email && !lead.contact?.empresa && (
                  <p className="text-sm text-gray-400 py-2">Sin datos de contacto</p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-900 mb-1">Estado y equipo</h2>
              <p className="text-[11px] text-gray-400 mb-4">Metadatos del proyecto</p>

              <dl>
                <MetaRow label="Estado">
                  <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-700">
                    {estadoLabel[lead.estado] || lead.estado}
                  </span>
                </MetaRow>
                {lead.prioridad && (
                  <MetaRow label="Prioridad">
                    <span className="capitalize">{lead.prioridad}</span>
                  </MetaRow>
                )}
                {project.ref && (
                  <MetaRow label="Referencia">
                    <span className="font-mono text-xs">{project.ref}</span>
                  </MetaRow>
                )}
                <MetaRow label="Developers">
                  {developers.length > 0 ? (
                    <DeveloperTags developers={developers} className="justify-end" />
                  ) : (
                    <span className="text-xs font-normal text-gray-400">Sin asignar</span>
                  )}
                </MetaRow>
              </dl>
            </section>
          </div>

          {/* Historial CRM */}
          <CrmActivityTimeline
            contactId={lead.contact?.id ?? null}
            leadId={lead.id}
            title="Historial del cliente"
            subtitle="Llamadas, notas, documentos y onboarding de este proyecto"
          />

          {/* Meetings */}
          <LeadMeetingsPanel leadId={lead.id} />
        </div>
      </div>
    </Layout>
  )
}
