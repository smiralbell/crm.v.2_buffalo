'use client'

import { useState } from 'react'
import { Check, Copy, CreditCard, Landmark, Sparkles, Users, Code2 } from 'lucide-react'
import {
  AUTO_DETECTED_SAAS,
  MANUAL_TRANSFER_RULES,
  MARKETING_PAYMENT_RULES,
} from '@/lib/finance/payment-concepts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function CopyChip({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="group inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-[11px] text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
      title="Copiar concepto"
    >
      <span>{text}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-600 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 text-slate-400 group-hover:text-slate-600 shrink-0" />
      )}
    </button>
  )
}

function PaymentConceptGuideContent() {
  const nomina = MANUAL_TRANSFER_RULES[0]
  const developer = MANUAL_TRANSFER_RULES[1]
  const iva303 = MANUAL_TRANSFER_RULES[2]

  return (
    <div className="mx-auto w-full max-w-2xl space-y-8">
      <p className="text-center text-sm text-slate-600 leading-relaxed">
        En el <strong className="font-semibold text-slate-800">concepto de la transferencia</strong>{' '}
        pon exactamente el formato indicado (mayúsculas, sin tildes). Así el CRM sabe si es nómina,
        developer, IVA o marketing.
      </p>

      {/* Nóminas */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
          <Users className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{nomina.category}</h3>
        <p className="mt-1 text-xs text-slate-500">{nomina.applies_to}</p>

        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Concepto exacto
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{nomina.format}</p>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{nomina.detail}</p>
          <div className="mt-3 flex justify-center">
            <CopyChip text={nomina.example} />
          </div>
        </div>
      </section>

      {/* Developers */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
          <Code2 className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{developer.category}</h3>
        <p className="mt-1 text-xs text-slate-500">{developer.applies_to}</p>

        <div className="mt-4 rounded-xl bg-indigo-50/50 border border-indigo-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
            Concepto exacto
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{developer.format}</p>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{developer.detail}</p>
          <div className="mt-3 flex justify-center">
            <CopyChip text={developer.example} />
          </div>
        </div>
      </section>

      {/* IVA 303 */}
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 text-center shadow-sm">
        <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white">
          <Landmark className="h-4 w-4" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">{iva303.category}</h3>
        <p className="mt-1 text-xs text-slate-500">{iva303.applies_to}</p>

        <div className="mt-4 rounded-xl bg-amber-50/60 border border-amber-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700/70">
            Concepto exacto
          </p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{iva303.format}</p>
          <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">{iva303.detail}</p>
          <div className="mt-3 flex justify-center">
            <CopyChip text={iva303.example} />
          </div>
        </div>
      </section>

      {/* Marketing */}
      <section className="rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-5">
        <div className="text-center mb-4">
          <div className="mx-auto mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-base font-semibold text-slate-900">Marketing / captación</h3>
          <p className="mt-1 text-xs text-slate-500">
            Concepto exacto → canal y ROI en Analítica de leads
          </p>
        </div>

        <div className="space-y-2.5">
          {MARKETING_PAYMENT_RULES.map((rule) => (
            <div
              key={rule.token}
              className="rounded-xl border border-white bg-white px-4 py-3 shadow-sm text-center sm:text-left"
            >
              <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
                <p className="text-xs font-semibold text-slate-900">{rule.label}</p>
                <p className="text-[10px] text-slate-500">{rule.model}</p>
              </div>
              {rule.concepts.length === 0 ? (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Sin gasto: web orgánica no lleva inversión.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap justify-center sm:justify-start gap-1.5">
                  {rule.concepts.map((c) => (
                    <div key={c.example} className="flex flex-col gap-0.5 items-center sm:items-start">
                      <CopyChip text={c.example} />
                      <span className="text-[10px] text-slate-400 px-0.5">{c.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* SaaS auto */}
      <section className="rounded-2xl border border-dashed border-slate-200 px-5 py-4 text-center">
        <div className="mx-auto mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <CreditCard className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Plataformas SaaS (tarjeta)</h3>
        <p className="mt-1 text-[11px] text-slate-500 leading-relaxed max-w-md mx-auto">
          Twilio, Cursor, Retell, OpenAI… se detectan solos. No hace falta concepto. Solo usa{' '}
          <span className="font-mono text-slate-600">PLT {'{servicio}'}</span> si pagas por
          transferencia.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {AUTO_DETECTED_SAAS.map((name) => (
            <span
              key={name}
              className="rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {name}
            </span>
          ))}
        </div>
      </section>

      <p className="text-center text-[11px] text-slate-400 leading-relaxed">
        Cobros de clientes:{' '}
        <span className="font-mono text-slate-500">FAC {'{cliente}'} {'{nº factura}'}</span>
        . Los gastos variables / gestoría no llevan plantilla fija.
      </p>
    </div>
  )
}

export default function PaymentConceptGuide({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          'h-9 gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shrink-0',
          className
        )}
        onClick={() => setOpen(true)}
      >
        <Landmark className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Cómo pagar</span>
        <span className="sm:hidden">Pagos</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 sm:rounded-2xl">
          <DialogHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5 text-center sm:text-center space-y-0">
            <div className="flex flex-col items-center gap-2 pr-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
                <Landmark className="h-4 w-4" />
              </span>
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                  Cómo poner el concepto al pagar
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-1">
                  Nóminas · developers (con ID) · marketing
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="px-5 py-6 sm:px-8">
            <PaymentConceptGuideContent />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
