import { useCallback, useEffect, useState } from 'react'
import { Copy, CreditCard, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type State = {
  configured: boolean
  webhook_configured: boolean
  payment_url: string | null
  paid_via: string | null
  stripe_paid_at: string | null
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Enlace de pago Stripe de una factura. Sin clave, explica qué falta (no llama a Stripe). */
export default function InvoicePaymentLinkCard({ invoiceId }: { invoiceId: number }) {
  const [state, setState] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setError('')
    const res = await fetch(`/api/invoices/${invoiceId}/payment-link`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return setError(data.error || 'No disponible')
    setState(data)
  }, [invoiceId])

  useEffect(() => {
    void load()
  }, [load])

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payment-link`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo crear')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Card className="rounded-2xl border border-zinc-200 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Pago con tarjeta</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {state?.paid_via === 'stripe' && state.stripe_paid_at && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
            Cobrada por Stripe el {fmt(state.stripe_paid_at)}
          </p>
        )}
        {state?.paid_via === 'bank' && (
          <p className="text-xs text-zinc-500">Esta factura ya está vinculada a un cobro del banco.</p>
        )}
        {state && !state.configured && (
          <p className="text-xs text-zinc-500">
            Cuando tengas cuenta Stripe, pon <code className="rounded bg-zinc-100 px-1">STRIPE_SECRET_KEY</code> y{' '}
            <code className="rounded bg-zinc-100 px-1">STRIPE_WEBHOOK_SECRET</code> en EasyPanel. El webhook es{' '}
            <code className="rounded bg-zinc-100 px-1">/api/webhooks/stripe</code>.
          </p>
        )}
        {state?.configured && !state.webhook_configured && (
          <p className="text-xs text-amber-700">Falta STRIPE_WEBHOOK_SECRET: el pago se cobrará, pero el CRM no se enterará solo.</p>
        )}
        {state?.payment_url && state.paid_via !== 'stripe' && (
          <div className="flex items-center gap-2">
            <input readOnly value={state.payment_url} className="min-w-0 flex-1 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs" />
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => void copy(state.payment_url!)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={busy || state?.paid_via === 'stripe'}
          onClick={() => void create()}
        >
          {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CreditCard className="mr-1.5 h-3.5 w-3.5" />}
          {state?.payment_url ? 'Generar enlace nuevo' : 'Generar enlace de pago'}
        </Button>
      </CardContent>
    </Card>
  )
}
