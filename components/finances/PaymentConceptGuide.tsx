'use client'

import { useState } from 'react'
import { Check, Copy, CreditCard, Landmark, Sparkles } from 'lucide-react'
import {
  AUTO_DETECTED_SAAS,
  MANUAL_TRANSFER_RULES,
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
      className="group inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
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
  return (
    <div className="grid gap-0 lg:grid-cols-2 -mx-1">
      <div className="border-b border-slate-100 p-1 pb-5 lg:border-b-0 lg:border-r lg:pr-6 lg:pb-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
            <CreditCard className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Plataformas SaaS</p>
            <p className="text-[11px] text-slate-500">Cobro directo en tarjeta · no hace falta concepto</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">
          Twilio, Cursor, Retell, OpenAI y el resto de herramientas que nos cargan solas se clasifican
          automáticamente. Si el mismo cargo aparece 2+ meses, entra en plataformas recurrentes.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {AUTO_DETECTED_SAAS.map((name) => (
            <span
              key={name}
              className="rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {name}
            </span>
          ))}
        </div>
        <p className="mt-4 text-[10px] text-slate-400 leading-relaxed">
          Solo usa <span className="font-mono text-slate-500">PLT {'{servicio}'}</span> si pagas una
          plataforma por transferencia bancaria (no tarjeta).
        </p>
      </div>

      <div className="p-1 pt-5 lg:pt-1 lg:pl-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-indigo-100 text-indigo-700">
            <Landmark className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Transferencias a personas y proveedores</p>
            <p className="text-[11px] text-slate-500">Obligatorio en el concepto del banco · mayúsculas, sin tildes</p>
          </div>
        </div>

        <div className="space-y-3">
          {MANUAL_TRANSFER_RULES.map((row) => (
            <div
              key={row.category}
              className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">{row.category}</p>
                <p className="text-[10px] text-slate-500">{row.applies_to}</p>
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-400">{row.format}</p>
              <div className="mt-2">
                <CopyChip text={row.example} />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[10px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
          En cobros de clientes por transferencia usa{' '}
          <span className="font-mono text-slate-500">FAC {'{cliente}'} {'{nº factura}'}</span> para
          vincular ingresos. Los datos alimentan los gráficos de proyecto (DEV), marketing y nóminas.
        </p>
      </div>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 sm:rounded-2xl">
          <DialogHeader className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-6 py-5 text-left space-y-0">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shrink-0">
                  <Landmark className="h-4 w-4" />
                </span>
                <div>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
                    Cómo pagar a partir de ahora
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-1">
                    Para que los estudios de gasto por equipo, proyecto y canal sean fiables
                  </DialogDescription>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                <Sparkles className="h-3 w-3" />
                Política Buffalo
              </span>
            </div>
          </DialogHeader>

          <div className="px-6 py-5">
            <PaymentConceptGuideContent />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
