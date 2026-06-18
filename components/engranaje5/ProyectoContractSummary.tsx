import {
  Mic, MessageSquare, LayoutDashboard, Layers, Wrench, Check,
  User, Building2, Mail, Phone, Receipt,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ContractSummary } from '@/lib/engranaje5/contract-summary'
import type { ProyectoRow } from '@/lib/engranaje5/project-services'
import type { ProjectServiceFlags } from '@/lib/engranaje5/data-column-guide'
import { fmt } from '@/lib/onboarding/project-view'

const statusLabel: Record<string, string> = {
  development: 'En desarrollo',
  active: 'Activo',
  paused: 'Pausado',
  churned: 'Baja',
}

const serviceTypeLabel: Record<string, string> = {
  voice_agent: 'Agente de Voz',
  text_agent: 'Agente de Chat',
  dashboard_app: 'Dashboard',
  automation: 'Automatización',
  lead_gen: 'Lead Gen',
  geo_seo: 'GEO / SEO',
}

const sectionIcon = {
  voz: Mic,
  chat: MessageSquare,
  dash: LayoutDashboard,
  pack: Layers,
  maint: Wrench,
}

const sectionColors = {
  voz: 'bg-violet-50 text-violet-800 border-violet-100',
  chat: 'bg-sky-50 text-sky-800 border-sky-100',
  dash: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  pack: 'bg-amber-50 text-amber-800 border-amber-100',
  maint: 'bg-gray-50 text-gray-800 border-gray-200',
}

interface Contact {
  id: number
  nombre: string | null
  email: string | null
  empresa: string | null
  telefono: string | null
}

interface Props {
  proyecto: ProyectoRow
  contact: Contact | null
  services: ProjectServiceFlags
  contract: ContractSummary
}

export default function ProyectoContractSummary({ proyecto, contact, services, contract }: Props) {
  const clientName = contact?.nombre || contact?.email || proyecto.name

  return (
    <div className="space-y-6">
      {/* Cliente + meta */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Cliente</p>
            <p className="text-lg font-semibold text-gray-900">{clientName}</p>
            {contact?.empresa && contact.empresa !== clientName && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                {contact.empresa}
              </p>
            )}
            {contact?.email && (
              <p className="text-sm text-gray-400 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                {contact.email}
              </p>
            )}
            {contact?.telefono && (
              <p className="text-sm text-gray-400 flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                {contact.telefono}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {services.has_voz && (
              <Badge variant="secondary" className="gap-1 bg-violet-50 text-violet-800 border-violet-100">
                <Mic className="h-3 w-3" /> Voz
              </Badge>
            )}
            {services.has_chat && (
              <Badge variant="secondary" className="gap-1 bg-sky-50 text-sky-800 border-sky-100">
                <MessageSquare className="h-3 w-3" /> Chat
              </Badge>
            )}
            {services.has_dash && (
              <Badge variant="secondary" className="gap-1 bg-emerald-50 text-emerald-800 border-emerald-100">
                <LayoutDashboard className="h-3 w-3" /> Dashboard
              </Badge>
            )}
            {services.has_pack && (
              <Badge variant="secondary" className="gap-1 bg-amber-50 text-amber-800 border-amber-100">
                <Layers className="h-3 w-3" /> Pack
              </Badge>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-400">Proyecto</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">{proyecto.name}</p>
            {proyecto.config_ref && (
              <p className="text-[11px] font-mono text-gray-400 mt-0.5">{proyecto.config_ref}</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-400">Tipo principal</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {serviceTypeLabel[proyecto.service_type] || proyecto.service_type}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Estado</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {statusLabel[proyecto.status] || proyecto.status}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Lanzamiento</p>
            <p className="text-sm font-medium text-gray-900 mt-0.5">
              {proyecto.launched_at
                ? new Date(proyecto.launched_at + 'T12:00:00').toLocaleDateString('es-ES', {
                    day: 'numeric', month: 'long', year: 'numeric',
                  })
                : '—'}
            </p>
          </div>
        </div>
      </section>

      {/* Económico */}
      {(contract.setupTotal != null && contract.setupTotal > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Setup total</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(contract.setupTotal)}</p>
            <p className="text-xs text-gray-400 mt-0.5">sin IVA</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">1er pago · inicio</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {contract.pay1 != null ? fmt(contract.pay1) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">50%</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">2do pago · producción</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {contract.pay2 != null ? fmt(contract.pay2) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">50%</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Mantenimiento</p>
            {contract.maintMonthly != null ? (
              <>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {fmt(contract.maintMonthly)}
                  <span className="text-sm font-medium text-gray-400">/mes</span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{contract.maintLabel || 'Plan activo'}</p>
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

      {/* Lo contratado */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-5">
          <User className="h-4 w-4 text-gray-400" />
          Todo lo contratado
        </h2>

        {contract.sections.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No hay detalle de contratación disponible.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {contract.sections.map((section) => {
              const Icon = sectionIcon[section.icon]
              const color = sectionColors[section.icon]
              return (
                <div
                  key={section.id}
                  className="rounded-xl border border-gray-100 bg-gray-50/50 p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {section.title}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {section.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                        <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}

        {contract.languagesCount != null && contract.languagesCount > 1 && (
          <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">
            Idiomas totales en proyecto: {contract.languagesCount}
          </p>
        )}
      </section>

      {/* Notas / resumen económico del configurador */}
      {contract.notas && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-4">
            <Receipt className="h-4 w-4 text-gray-400" />
            Resumen económico detallado
          </h2>
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
            {contract.notas}
          </pre>
        </section>
      )}
    </div>
  )
}
