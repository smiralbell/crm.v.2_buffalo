import { GetServerSideProps } from 'next'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { requireAuth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Layout from '@/components/Layout'
import {
  ArrowLeft, Edit, FileText, Settings, User, Building2,
  Mail, Phone, MapPin, Receipt, Calendar,
} from 'lucide-react'
import { buildProjectViewData, fmt } from '@/lib/onboarding/project-view'

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

export default function ProyectoDetailPage({ lead }: Props) {
  const [iframeHeight, setIframeHeight] = useState(820)
  const [iframeUrl, setIframeUrl] = useState('')

  const displayName = lead.contact?.nombre || lead.contact?.email || `Lead #${lead.id}`
  const project = useMemo(
    () => buildProjectViewData(lead.configuracion, lead.valor, lead.notas),
    [lead.configuracion, lead.valor, lead.notas]
  )

  const configureUrl = useMemo(() => {
    const p = new URLSearchParams()
    p.set('lead', String(lead.id))
    if (lead.contact?.nombre)  p.set('nombre', lead.contact.nombre)
    if (lead.contact?.empresa)  p.set('empresa', lead.contact.empresa)
    if (lead.contact?.email)    p.set('email', lead.contact.email)
    if (lead.contact?.ciudad)   p.set('ciudad', lead.contact.ciudad || '')
    return `/onboarding/configure?${p.toString()}`
  }, [lead])

  useEffect(() => {
    if (!lead.configuracion) return
    const p = new URLSearchParams({ crm: '1', projectView: '1' })
    p.set('leadId', String(lead.id))
    p.set('cfg', lead.configuracion)
    if (lead.contact?.nombre)  p.set('nombre', lead.contact.nombre)
    if (lead.contact?.empresa) p.set('empresa', lead.contact.empresa)
    if (lead.contact?.email)   p.set('email', lead.contact.email)
    if (lead.contact?.ciudad)  p.set('ciudad', lead.contact.ciudad || '')
    p.set('baseurl', window.location.origin)
    setIframeUrl(`/configurador.html?${p.toString()}`)
  }, [lead])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'buffalo_iframe_height') {
        setIframeHeight(Math.max(640, e.data.height + 24))
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  return (
    <Layout>
      <div className="w-full max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="rounded-xl bg-gray-900 text-white px-5 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-medium tracking-wide uppercase opacity-80">Vista completa del proyecto</p>
          <p className="text-xs opacity-60 hidden sm:block">Resumen · Cliente · Documentos</p>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <Link
              href="/onboarding?tab=projects"
              className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-400 mb-0.5">Proyecto</p>
              <h1 className="text-2xl font-bold text-gray-900 truncate">{displayName}</h1>
              {lead.contact?.empresa && (
                <p className="text-sm text-gray-500 mt-0.5">{lead.contact.empresa}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={configureUrl}
              className="inline-flex items-center gap-2 px-4 h-10 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
            >
              <Edit className="h-4 w-4" />
              Editar configuración
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        {project.setupTotal > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Setup total</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(project.setupTotal)}</p>
              <p className="text-xs text-gray-400 mt-0.5">sin IVA</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">1er pago · inicio</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(project.pay1)}</p>
              <p className="text-xs text-gray-400 mt-0.5">50%</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">2do pago · producción</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(project.pay2)}</p>
              <p className="text-xs text-gray-400 mt-0.5">50%</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Mantenimiento</p>
              {project.maintMonthly != null ? (
                <>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(project.maintMonthly)}<span className="text-sm font-medium text-gray-400">/mes</span></p>
                  <p className="text-xs text-gray-400 mt-0.5">{project.maintLabel}</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-400 mt-1">—</p>
                  <p className="text-xs text-gray-400 mt-0.5">Sin mantenimiento</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Client + meta */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
              <User className="h-4 w-4 text-gray-400" />
              Cliente
            </h2>
            <dl className="space-y-3">
              {lead.contact?.nombre && (
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-400">Nombre</dt>
                  <dd className="font-medium text-gray-900 text-right">{lead.contact.nombre}</dd>
                </div>
              )}
              {lead.contact?.empresa && (
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-400 flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Empresa</dt>
                  <dd className="font-medium text-gray-900 text-right">{lead.contact.empresa}</dd>
                </div>
              )}
              {lead.contact?.email && (
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-400 flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email</dt>
                  <dd className="text-right">
                    <a href={`mailto:${lead.contact.email}`} className="font-medium text-blue-600 hover:underline">
                      {lead.contact.email}
                    </a>
                  </dd>
                </div>
              )}
              {lead.contact?.telefono && (
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-400 flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Teléfono</dt>
                  <dd className="font-medium text-gray-900 text-right">{lead.contact.telefono}</dd>
                </div>
              )}
              {lead.contact?.ciudad && (
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-400 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Ciudad</dt>
                  <dd className="font-medium text-gray-900 text-right">{lead.contact.ciudad}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
              <Settings className="h-4 w-4 text-gray-400" />
              Proyecto
            </h2>
            <dl className="space-y-3">
              {project.ref && (
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-400">Referencia</dt>
                  <dd className="font-mono text-xs font-medium text-gray-900 text-right">{project.ref}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 text-sm">
                <dt className="text-gray-400">Estado</dt>
                <dd>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide bg-gray-100 text-gray-700">
                    {estadoLabel[lead.estado] || lead.estado}
                  </span>
                </dd>
              </div>
              {lead.prioridad && (
                <div className="flex justify-between gap-4 text-sm">
                  <dt className="text-gray-400">Prioridad</dt>
                  <dd className="font-medium text-gray-900 capitalize text-right">{lead.prioridad}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 text-sm">
                <dt className="text-gray-400 flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Actualizado</dt>
                <dd className="text-gray-900 text-right">
                  {new Date(lead.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </dd>
              </div>
            </dl>
            {project.services.length > 0 && (
              <div className="mt-5 pt-4 border-t border-gray-100">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-2">Servicios</p>
                <div className="flex flex-wrap gap-2">
                  {project.services.map((s) => (
                    <span key={s} className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-700">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resumen detallado */}
        {lead.notas && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
              <Receipt className="h-4 w-4 text-gray-400" />
              Resumen económico
            </h2>
            <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
              {lead.notas}
            </pre>
            {lead.valor != null && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-gray-500">Total con IVA (21%)</span>
                <span className="text-lg font-bold text-gray-900">
                  {fmt(Math.round(lead.valor * 1.21))}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Documentos — configurador step 2 embebido */}
        {lead.configuracion ? (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <FileText className="h-4 w-4 text-gray-400" />
                Documentos del proyecto
              </h2>
              <p className="text-xs text-gray-400">Propuesta · Onboarding · Contrato · Factura</p>
            </div>
            <iframe
              src={iframeUrl || undefined}
              title="Documentos del proyecto"
              style={{
                width: '100%',
                height: `${iframeHeight}px`,
                border: 'none',
                display: 'block',
              }}
              scrolling="no"
            />
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 py-14 text-center">
            <p className="text-sm text-gray-400 mb-4">Este proyecto aún no tiene configuración guardada.</p>
            <Link
              href={configureUrl}
              className="inline-flex items-center gap-2 px-4 h-10 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
            >
              Configurar proyecto
            </Link>
          </div>
        )}
      </div>
    </Layout>
  )
}
