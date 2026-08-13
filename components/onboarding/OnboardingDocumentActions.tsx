'use client'

import {
  FileText, Receipt, ScrollText, Rocket, ExternalLink,
} from 'lucide-react'

const WINDOW_FEATURES = 'noopener,noreferrer,width=1120,height=820'

export function openOnboardingDoc(path: string, name: string) {
  window.open(path, name, WINDOW_FEATURES)
}

export type OnboardingDocAction = {
  id: string
  title: string
  shortTitle: string
  desc: string
  href: (id: string) => string
  windowName: (id: string) => string
  icon: typeof FileText
  tone: 'sky' | 'emerald' | 'slate' | 'amber'
}

export const ONBOARDING_DOC_ACTIONS: OnboardingDocAction[] = [
  {
    id: 'propuesta',
    title: 'Propuesta comercial',
    shortTitle: 'Propuesta',
    desc: 'Borrador con IA a partir del contexto y la definición.',
    href: (id: string) => `/onboarding/propuesta?lead=${id}`,
    windowName: (id: string) => `buffalo-propuesta-${id}`,
    icon: FileText,
    tone: 'sky',
  },
  {
    id: 'factura',
    title: 'Crear factura',
    shortTitle: 'Factura',
    desc: 'Abre Facturas Buffalo con este onboarding ya vinculado.',
    href: (id: string) => `/invoices/new?lead=${id}`,
    windowName: (id: string) => `buffalo-factura-${id}`,
    icon: Receipt,
    tone: 'emerald',
  },
  {
    id: 'contrato',
    title: 'Crear contrato',
    shortTitle: 'Contrato',
    desc: 'Contrato de prestación de servicios con plantilla Buffalo.',
    href: (id: string) => `/onboarding/contrato?lead=${id}`,
    windowName: (id: string) => `buffalo-contrato-${id}`,
    icon: ScrollText,
    tone: 'slate',
  },
  {
    id: 'kickoff',
    title: 'Crear pre-kick-off',
    shortTitle: 'Pre-kick-off',
    desc: 'Documento de arranque: agenda, accesos y próximos pasos.',
    href: (id: string) => `/onboarding/pre-kickoff?lead=${id}`,
    windowName: (id: string) => `buffalo-kickoff-${id}`,
    icon: Rocket,
    tone: 'amber',
  },
]

type Props = {
  leadId: number | string
  className?: string
  /** compact = fila de botones; cards = grid (default) */
  variant?: 'cards' | 'compact'
}

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
        {ONBOARDING_DOC_ACTIONS.map((a) => {
          const Icon = a.icon
          const tone = toneClasses[a.tone]
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => openOnboardingDoc(a.href(id), a.windowName(id))}
              className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-semibold transition-colors ${tone.btn}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {a.shortTitle}
              <ExternalLink className="h-3 w-3 opacity-60" />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <section className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ONBOARDING_DOC_ACTIONS.map((a) => {
          const Icon = a.icon
          const tone = toneClasses[a.tone]
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => openOnboardingDoc(a.href(id), a.windowName(id))}
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
