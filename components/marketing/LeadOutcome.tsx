import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { LOST_REASONS, reasonLabel, type LeadOutcome } from '@/lib/marketing/sales.types'
import { ErrorBox, Lbl, call, field, json } from '@/components/marketing/shared'

const API = '/api/marketing/outcome'

/** Resultado del lead: encaja, no se presentó, perdido y motivo. */
export function OutcomeDialog({
  lead,
  onClose,
  onSaved,
  startLost = false,
}: {
  lead: { id: number; name: string } | null
  onClose: () => void
  onSaved: (o: LeadOutcome) => void
  startLost?: boolean
}) {
  const [ready, setReady] = useState(false)
  const [encaja, setEncaja] = useState<boolean | null>(null)
  const [noShow, setNoShow] = useState(false)
  const [lost, setLost] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = lead?.id ?? null

  useEffect(() => {
    if (id == null) return
    let alive = true
    setReady(false)
    setError(null)
    call<{ outcome: LeadOutcome | null }>(`${API}?lead_id=${id}`)
      .then(({ outcome: o }) => {
        if (!alive) return
        setEncaja(o?.encaja ?? null)
        setNoShow(!!o?.no_presentado)
        setLost(startLost || !!o?.perdido)
        setMotivo(o?.motivo ?? '')
        setNota(o?.nota ?? '')
        setReady(true)
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [id, startLost])

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const { outcome } = await call<{ outcome: LeadOutcome }>(
        API,
        json('PUT', { lead_id: id, perdido: lost, motivo: lost ? motivo || null : null, encaja, no_presentado: noShow, nota })
      )
      onSaved(outcome)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }
  const opt = (on: boolean) =>
    cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400')

  return (
    <Dialog open={lead != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lead?.name ?? 'Resultado'}</DialogTitle>
        </DialogHeader>
        <ErrorBox text={error} />
        {!ready && !error && <div className="h-40 animate-pulse rounded-xl bg-gray-100" />}
        {ready && (
          <div className="space-y-4">
            <div>
              <Lbl>¿Es el tipo de cliente que buscamos?</Lbl>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={opt(encaja === true)} onClick={() => setEncaja(encaja === true ? null : true)}>
                  Encaja
                </button>
                <button type="button" className={opt(encaja === false)} onClick={() => setEncaja(encaja === false ? null : false)}>
                  No encaja
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={noShow} onChange={(e) => setNoShow(e.target.checked)} /> No se presentó a la reunión
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={lost} onChange={(e) => setLost(e.target.checked)} /> Perdido
            </label>
            {lost && (
              <label className="block">
                <Lbl>¿Por qué se ha perdido?</Lbl>
                <select className={field} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  <option value="">Elige el motivo…</option>
                  {LOST_REASONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">
              <Lbl>Nota</Lbl>
              <textarea rows={2} className={field} value={nota} onChange={(e) => setNota(e.target.value)} />
            </label>
            {lost && <p className="text-xs text-gray-400">El lead pasará a «Perdido». Si lo desmarcas, vuelve a su estado. La tarjeta del pipeline no se mueve.</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>
                Cancelar
              </Button>
              <Button size="sm" className="rounded-xl" onClick={save} disabled={busy || (lost && !motivo)}>
                {busy ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function OutcomeChips({ o }: { o: Pick<LeadOutcome, 'perdido' | 'motivo' | 'encaja' | 'no_presentado'> }) {
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {o.encaja === true && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Encaja</span>}
      {o.encaja === false && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">No encaja</span>}
      {o.no_presentado && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">No se presentó</span>}
      {o.perdido && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Perdido · {reasonLabel(o.motivo)}</span>}
    </span>
  )
}

/** Fila para la ficha del lead. */
export function LeadOutcomeField({ leadId, name }: { leadId: number; name: string }) {
  const [o, setO] = useState<LeadOutcome | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    call<{ outcome: LeadOutcome | null }>(`${API}?lead_id=${leadId}`)
      .then((j) => alive && setO(j.outcome))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [leadId])
  if (o === undefined) return null
  const any = o && (o.perdido || o.no_presentado || o.encaja != null)
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-50 py-2.5">
      <span className="w-24 shrink-0 text-sm text-gray-500 sm:w-32">Resultado</span>
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-gray-900 hover:underline">
        {any && o ? <OutcomeChips o={o} /> : 'Añadir resultado'}
      </button>
      <OutcomeDialog lead={open ? { id: leadId, name } : null} onClose={() => setOpen(false)} onSaved={setO} />
    </div>
  )
}
