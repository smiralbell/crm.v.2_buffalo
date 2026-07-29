'use client'

import {
  FileText, Receipt, ScrollText, Rocket, ExternalLink,
} from 'lucide-react'

const WINDOW_FEATURES = 'noopener,noreferrer,width=1120,height=820'

function openDoc(path: string, name: string) {
  window.open(path, name, WINDOW_FEATURES)
}

type Props = {
  leadId: number | string
  className?: string
  /** compact = fila de botones; cards = grid (default) */
  variant?: 'cards' | 'compact'
}

const ACTIONS = [
  {
    id: 'propuesta',
    title: 'Propuesta comercial',
    desc: 'Borrador con IA a partir del contexto y la definición.',
    href: (id: string) => `/onboarding/propuesta?lead=${id}`,
    windowName: (id: string) => `buffalo-propuesta-${id}`,
    icon: FileText,
    tone: 'sky' as const,
  },
  {
    id: 'factura',
    title: 'Crear factura',
    desc: 'Abre Facturas Buffalo con este onboarding ya vinculado.',
    href: (id: string) => `/invoices/new?lead=${id}`,
    windowName: (id: string) => `buffalo-factura-${id}`,
    icon: Receipt,
    tone: 'emerald' as const,
  },
  {
    id: 'contrato',
    title: 'Crear contrato',
    desc: 'Borrador de contrato con IA listo para revisar.',
    href: (id: string) => `/onboarding/contrato?lead=${id}`,
    windowName: (id: string) => `buffalo-contrato-${id}`,
    icon: ScrollText,
    tone: 'slate' as const,
  },
  {
    id: 'kickoff',
    title: 'Crear pre-kick-off',
    desc: 'Documento de arranque: agenda, accesos y próximos pasos.',
    href: (id: string) => `/onboarding/pre-kickoff?lead=${id}`,
    windowName: (id: string) => `buffalo-kickoff-${id}`,
    icon: Rocket,
    tone: 'amber' as const,
  },
]

const toneClasses = {
  sky: {
    card: 'hover:border-sky-300 hover:bg-sky-50/40',
    icon: 'bg-sky-50 text-sky-700 border-sky-100',
    btn: 'bg-sky-50 text-sky-900 border-sky-200 hover:bg-sky-100',
  },
  emerald: {
    card: 'hover:border-emerald-300 hover:bg-emerald-50/40',
    icon: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    btn: 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100',
  },
  slate: {
    card: 'hover:border-gray-400 hover:bg-gray-50/80',
    icon: 'bg-gray-100 text-gray-700 border-gray-200',
    btn: 'bg-gray-100 text-gray-900 border-gray-200 hover:bg-gray-200/70',
  },
  amber: {
    card: 'hover:border-amber-300 hover:bg-amber-50/40',
    icon: 'bg-amber-50 text-amber-800 border-amber-100',
    btn: 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100',
  },
}

export default function OnboardingDocumentActions({
  leadId,
  className,
  variant = 'cards',
}: Props) {
  const id = String(leadId)

  if (variant === 'compact') {
    return (
      <div className={className ? `flex flex-wrap gap-2 ${className}` : 'flex flex-wrap gap-2'}>
        {ACTIONS.map((a) => {
          const Icon = a.icon
          const tone = toneClasses[a.tone]
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => openDoc(a.href(id), a.windowName(id))}
              className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-semibold transition-colors ${tone.btn}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {a.title.replace('Crear ', '').replace(' comercial', '')}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <section className={className}>
      <div className="mb-3">
        <p className="text-sm font-semibold text-gray-900">Documentos del onboarding</p>
        <p className="text-xs text-gray-500 mt-0.5">
          Cada acción abre una ventana nueva. Las facturas se crean en Facturas Buffalo y quedan vinculadas a este onboarding.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ACTIONS.map((a) => {
          const Icon = a.icon
          const tone = toneClasses[a.tone]
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => openDoc(a.href(id), a.windowName(id))}
              className={`text-left rounded-2xl border border-gray-200 bg-white px-4 py-4 transition-all ${tone.card}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${tone.icon}`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                    <ExternalLink className="h-3.5 w-3.5 text-gray-300" />
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">{a.desc}</p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
