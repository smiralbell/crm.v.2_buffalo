import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Pencil, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CHANNEL_COLORS } from '@/lib/leads/analytics.types'
import {
  ATTRIBUTION_CHANNELS,
  ATTRIBUTION_VIAS,
  attributionLabel,
  guessVia,
  type AttributionLead,
  type AttributionMonth,
} from '@/lib/marketing/attribution.types'

const field =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200'
const API = '/api/marketing/attribution'

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
  return j as T
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function Options({ list, empty }: { list: readonly { id: string; label: string }[]; empty?: string }) {
  return (
    <>
      {empty != null && <option value="">{empty}</option>}
      {list.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </>
  )
}

const Lbl = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1 block text-xs font-medium text-gray-600">{children}</span>
)

/** «Cómo nos conoció» y «Por dónde entró» de un lead. */
export function AttributionDialog({
  leadId,
  onClose,
  onSaved,
}: {
  leadId: number | null
  onClose: () => void
  onSaved: (l: AttributionLead) => void
}) {
  const [lead, setLead] = useState<AttributionLead | null>(null)
  const [canal, setCanal] = useState('')
  const [via, setVia] = useState('')
  const [nota, setNota] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (leadId == null) return
    let alive = true
    setLead(null)
    setError(null)
    call<{ lead: AttributionLead }>(`${API}?lead_id=${leadId}`)
      .then(({ lead: l }) => {
        if (!alive) return
        setLead(l)
        const known = ATTRIBUTION_CHANNELS.some((c) => c.id === l.canal)
        setCanal(l.attribution?.canal ?? (known && !l.needs_review ? l.canal : ''))
        setVia(l.attribution?.via ?? guessVia(l.origen) ?? '')
        setNota(l.attribution?.nota ?? '')
      })
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [leadId])

  const run = async (fn: () => Promise<{ lead: AttributionLead }>) => {
    setBusy(true)
    setError(null)
    try {
      onSaved((await fn()).lead)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={leadId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{lead ? lead.name : 'Canal del lead'}</DialogTitle>
        </DialogHeader>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!lead && !error && <div className="h-40 animate-pulse rounded-xl bg-gray-100" />}
        {lead && (
          <div className="space-y-3">
            <label className="block">
              <Lbl>¿Cómo nos conoció? (es lo que cuenta en Marketing)</Lbl>
              <select className={field} value={canal} onChange={(e) => setCanal(e.target.value)}>
                <Options list={ATTRIBUTION_CHANNELS} empty="Elige el canal…" />
              </select>
            </label>
            <label className="block">
              <Lbl>¿Por dónde entró?</Lbl>
              <select className={field} value={via} onChange={(e) => setVia(e.target.value)}>
                <Options list={ATTRIBUTION_VIAS} empty="—" />
              </select>
            </label>
            <label className="block">
              <Lbl>Nota</Lbl>
              <textarea rows={2} className={field} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej.: dijo que se lo recomendó ChatGPT" />
            </label>
            <p className="text-xs text-gray-400">
              Detectado por el CRM: {lead.attribution?.detectado ?? `${attributionLabel(lead.auto)}${lead.origen ? ` (${lead.origen})` : ''}`}
              {lead.attribution && (
                <>
                  {' · '}Puesto por {lead.attribution.updated_by ?? '—'} el{' '}
                  {new Date(lead.attribution.updated_at).toLocaleDateString('es-ES')}
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              {lead.attribution && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={busy}
                  onClick={() => run(() => call(`${API}?lead_id=${lead.id}`, { method: 'DELETE' }))}
                >
                  Volver a automático
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" className="rounded-xl" onClick={onClose}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="rounded-xl"
                  disabled={busy || !canal}
                  onClick={() => run(() => call(API, json('PUT', { lead_id: lead.id, canal, via: via || null, nota })))}
                >
                  {busy ? 'Guardando…' : 'Guardar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Etiqueta del canal que se puede pulsar para corregirlo. */
export function ChannelChip({ label, color, confirmed, onClick }: { label: string; color?: string; confirmed?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={confirmed ? 'Canal confirmado. Pulsa para cambiarlo' : 'Canal automático. Pulsa para corregirlo'}
      className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:border-gray-400 hover:text-gray-900"
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color || '#9CA3AF' }} />
      {label}
      {confirmed ? <Check className="h-3 w-3 text-emerald-600" /> : <Pencil className="h-3 w-3 text-gray-300 group-hover:text-gray-600" />}
    </button>
  )
}

/** Chip autónomo para la ficha de un lead. */
export function LeadAttributionField({ leadId }: { leadId: number }) {
  const [lead, setLead] = useState<AttributionLead | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    call<{ lead: AttributionLead }>(`${API}?lead_id=${leadId}`)
      .then((j) => alive && setLead(j.lead))
      .catch(() => undefined) // sin permiso de marketing: no se muestra
    return () => {
      alive = false
    }
  }, [leadId])
  if (!lead) return null
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-50 py-2.5">
      <span className="w-24 shrink-0 text-sm text-gray-500 sm:w-32">Cómo nos conoció</span>
      <ChannelChip
        label={lead.needs_review ? 'Por confirmar' : attributionLabel(lead.canal)}
        color={CHANNEL_COLORS[lead.canal]}
        confirmed={!!lead.attribution}
        onClick={() => setOpen(true)}
      />
      <AttributionDialog leadId={open ? leadId : null} onClose={() => setOpen(false)} onSaved={setLead} />
    </div>
  )
}

/** Apuntar un lead a mano (p. ej. alguien que llama a un móvil del equipo). */
export function AddLeadButton({ onAdded }: { onAdded: () => void }) {
  const empty = { nombre: '', telefono: '', email: '', empresa: '', canal: '', via: 'movil', nota: '', fecha: '' }
  const [open, setOpen] = useState(false)
  const [f, setF] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ lead: AttributionLead | null; existing: boolean } | null>(null)
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }))
  const ready = f.nombre.trim() && (f.telefono.trim() || f.email.trim()) && f.canal

  const start = () => {
    const d = new Date()
    setF({ ...empty, fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
    setError(null)
    setDone(null)
    setOpen(true)
  }
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await call<{ lead: AttributionLead | null; existing: boolean }>(
        API,
        json('POST', { ...f, via: f.via || null, fecha: f.fecha || undefined })
      )
      setDone(r)
      onAdded()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size="sm" className="rounded-xl" onClick={start}>
        <UserPlus className="mr-1.5 h-4 w-4" /> Añadir lead
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Añadir lead</DialogTitle>
          </DialogHeader>
          {done ? (
            <div className="space-y-4">
              <p className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                {done.existing
                  ? `${done.lead?.name ?? 'Esta persona'} ya estaba en el CRM: no se ha duplicado ni cambiado su ficha. Queda guardado cómo nos conoció.`
                  : `${done.lead?.name ?? 'Lead'} añadido. Cuenta en «${done.lead ? attributionLabel(done.lead.canal) : ''}».`}
              </p>
              <div className="flex justify-end gap-2">
                {done.lead && (
                  <Link href={`/leads/${done.lead.id}`} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                    Ver ficha
                  </Link>
                )}
                <Button size="sm" className="rounded-xl" onClick={() => setOpen(false)}>
                  Listo
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
              <label>
                <Lbl>Nombre</Lbl>
                <input className={field} value={f.nombre} onChange={set('nombre')} name="nombre" autoFocus />
              </label>
              <label>
                <Lbl>Empresa (opcional)</Lbl>
                <input className={field} value={f.empresa} onChange={set('empresa')} name="empresa" />
              </label>
              <label>
                <Lbl>Teléfono</Lbl>
                <input className={field} value={f.telefono} onChange={set('telefono')} name="telefono" inputMode="tel" />
              </label>
              <label>
                <Lbl>Email</Lbl>
                <input className={field} value={f.email} onChange={set('email')} name="email" inputMode="email" />
              </label>
              <label>
                <Lbl>¿Cómo nos conoció?</Lbl>
                <select className={field} value={f.canal} onChange={set('canal')} name="canal">
                  <Options list={ATTRIBUTION_CHANNELS} empty="Elige el canal…" />
                </select>
              </label>
              <label>
                <Lbl>¿Por dónde entró?</Lbl>
                <select className={field} value={f.via} onChange={set('via')} name="via">
                  <Options list={ATTRIBUTION_VIAS} empty="—" />
                </select>
              </label>
              <label>
                <Lbl>Fecha</Lbl>
                <input type="date" className={field} value={f.fecha} onChange={set('fecha')} name="fecha" />
              </label>
              <label className="sm:col-span-2">
                <Lbl>Nota (opcional)</Lbl>
                <textarea rows={2} className={field} value={f.nota} onChange={set('nota')} name="nota" placeholder="Ej.: preguntó a ChatGPT por agencias de IA en Barcelona" />
              </label>
              <div className="flex items-center gap-2 sm:col-span-2">
                <span className="text-xs text-gray-400">Pon al menos teléfono o email.</span>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" className="rounded-xl" onClick={save} disabled={busy || !ready}>
                    {busy ? 'Guardando…' : 'Guardar lead'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Bandeja «Por confirmar» + todos los leads del mes con su canal editable. */
export function AttributionInbox({ period, onChanged }: { period: string; onChanged?: () => void }) {
  const [data, setData] = useState<AttributionMonth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'pending' | 'all'>('pending')
  const [editing, setEditing] = useState<number | null>(null)
  const [saving, setSaving] = useState<number | null>(null)

  const load = useCallback(() => {
    setError(null)
    call<AttributionMonth>(`${API}?period=${encodeURIComponent(period)}`)
      .then(setData)
      .catch((e) => setError(e.message))
  }, [period])
  useEffect(() => {
    setData(null)
    load()
  }, [load])

  const apply = (l: AttributionLead) => {
    setData((d) => {
      if (!d) return d
      const leads = d.leads.map((x) => (x.id === l.id ? l : x))
      return { ...d, leads, pending: leads.filter((x) => x.needs_review).length }
    })
    onChanged?.()
  }
  const quick = async (l: AttributionLead, canal: string) => {
    if (!canal) return
    setSaving(l.id)
    setError(null)
    try {
      apply((await call<{ lead: AttributionLead }>(API, json('PUT', { lead_id: l.id, canal, via: guessVia(l.origen) }))).lead)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setSaving(null)
    }
  }

  const pending = data?.leads.filter((l) => l.needs_review) ?? []
  const list = tab === 'pending' ? pending : data?.leads ?? []

  return (
    <Card className={cn('shadow-sm', pending.length > 0 && 'border-amber-200')}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-semibold text-gray-800">Canal de cada lead</CardTitle>
          <p className="text-xs text-gray-400">Confirma cómo nos conoció quien llamó o agendó directamente.</p>
        </div>
        <div className="inline-flex rounded-full border border-gray-200 bg-white p-0.5">
          {(
            [
              ['pending', `Por confirmar${data ? ` (${pending.length})` : ''}`],
              ['all', `Todos${data ? ` (${data.leads.length})` : ''}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn('rounded-full px-3 py-1 text-xs font-medium', tab === id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800')}
            >
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {!data && !error ? (
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            {tab === 'pending' ? 'Todo confirmado: no queda ningún lead por revisar.' : 'No hay leads este mes.'}
          </p>
        ) : (
          <ul className="max-h-96 divide-y divide-gray-50 overflow-y-auto">
            {list.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/leads/${l.id}`} className="font-medium text-gray-900 hover:underline">
                    {l.name}
                    {l.empresa && <span className="font-normal text-gray-500"> · {l.empresa}</span>}
                  </Link>
                  <p className="text-xs text-gray-400">
                    {l.created_at && new Date(l.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                    {l.reason && ` · ${l.reason}`}
                    {!l.reason && l.attribution?.via && ` · ${ATTRIBUTION_VIAS.find((v) => v.id === l.attribution?.via)?.label}`}
                    {l.attribution?.nota && ` · «${l.attribution.nota}»`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {l.needs_review ? (
                    <>
                      <select
                        aria-label={`Canal de ${l.name}`}
                        className="rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-900"
                        value=""
                        disabled={saving === l.id}
                        onChange={(e) => quick(l, e.target.value)}
                      >
                        <Options list={ATTRIBUTION_CHANNELS} empty={saving === l.id ? 'Guardando…' : '¿Cómo nos conoció?'} />
                      </select>
                      <button type="button" onClick={() => setEditing(l.id)} className="text-xs font-medium text-gray-400 hover:text-gray-900">
                        Con nota
                      </button>
                    </>
                  ) : (
                    <ChannelChip
                      label={attributionLabel(l.canal)}
                      color={CHANNEL_COLORS[l.canal]}
                      confirmed={!!l.attribution}
                      onClick={() => setEditing(l.id)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AttributionDialog leadId={editing} onClose={() => setEditing(null)} onSaved={apply} />
    </Card>
  )
}
