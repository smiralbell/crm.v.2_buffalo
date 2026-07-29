'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Save, Search, UserPlus, X, Check, Building2, Mail, Phone, MapPin, User } from 'lucide-react'

type ContactHit = {
  id: number
  nombre: string | null
  email: string | null
  empresa: string | null
  telefono: string | null
  ciudad: string | null
}

type DurationUnit = 'dias' | 'semanas' | 'meses'

type FormState = {
  contact_id: number | null
  contact_nombre: string
  contact_email: string
  contact_empresa: string
  contact_telefono: string
  contact_ciudad: string
  name: string
  project_definition: string
  setup_fee_eur: string
  monthly_fee_eur: string
  duration_amount: string
  duration_unit: DurationUnit
  fecha_inicio_real: string
  fecha_fin_real: string
}

const empty = (): FormState => ({
  contact_id: null,
  contact_nombre: '',
  contact_email: '',
  contact_empresa: '',
  contact_telefono: '',
  contact_ciudad: '',
  name: '',
  project_definition: '',
  setup_fee_eur: '',
  monthly_fee_eur: '',
  duration_amount: '',
  duration_unit: 'semanas',
  fecha_inicio_real: '',
  fecha_fin_real: '',
})

function parseDuration(raw: string | null | undefined): {
  amount: string
  unit: DurationUnit
} {
  if (!raw?.trim()) return { amount: '', unit: 'semanas' }
  const t = raw.trim().toLowerCase()

  // ISO date leftovers → ignore as duration
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return { amount: '', unit: 'semanas' }

  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(día|dias|día|días|day|days|semana|semanas|week|weeks|mes|meses|month|months)\b/i)
  if (m) {
    const amount = m[1].replace(',', '.')
    const u = m[2].toLowerCase()
    if (u.startsWith('d') || u.startsWith('día') || u.startsWith('dia')) return { amount, unit: 'dias' }
    if (u.startsWith('sem') || u.startsWith('w')) return { amount, unit: 'semanas' }
    return { amount, unit: 'meses' }
  }

  // bare number → assume weeks
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return { amount: t.replace(',', '.'), unit: 'semanas' }

  return { amount: '', unit: 'semanas' }
}

function formatDuration(amount: string, unit: DurationUnit): string | null {
  const n = parseFloat(amount.replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  const rounded = Number.isInteger(n) ? String(n) : String(n)
  if (unit === 'dias') return n === 1 ? '1 día' : `${rounded} días`
  if (unit === 'semanas') return n === 1 ? '1 semana' : `${rounded} semanas`
  return n === 1 ? '1 mes' : `${rounded} meses`
}

type Props = {
  leadId: number | string
  onSaved?: () => void
  className?: string
}

export default function OnboardingProjectEditForm({ leadId, onSaved, className }: Props) {
  const [form, setForm] = useState<FormState>(empty)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [clientMode, setClientMode] = useState<'current' | 'search' | 'create'>('current')
  const [searchQ, setSearchQ] = useState('')
  const [searchHits, setSearchHits] = useState<ContactHit[]>([])
  const [searching, setSearching] = useState(false)

  const [newClient, setNewClient] = useState({
    nombre: '',
    email: '',
    empresa: '',
    telefono: '',
    ciudad: '',
  })

  useEffect(() => {
    const id = Number(leadId)
    if (!Number.isFinite(id) || id <= 0) return
    let cancelled = false
    setFetching(true)
    setError('')
    setOkMsg('')
    setForm(empty())
    setClientMode('current')

    ;(async () => {
      try {
        const res = await fetch(`/api/onboarding/projects/${id}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error al cargar')
        if (cancelled) return

        const lead = data.lead
        const p = data.proyecto
        const setup =
          p?.setup_fee_eur != null
            ? String(p.setup_fee_eur)
            : lead?.valor != null
              ? String(lead.valor)
              : ''
        const dur = parseDuration(p?.tiempo_previsto)
        setForm({
          contact_id: lead?.contact?.id ?? null,
          contact_nombre: lead?.contact?.nombre || '',
          contact_email: lead?.contact?.email || '',
          contact_empresa: lead?.contact?.empresa || '',
          contact_telefono: lead?.contact?.telefono || '',
          contact_ciudad: lead?.contact?.ciudad || '',
          name: p?.name || lead?.contact?.empresa || lead?.contact?.nombre || '',
          project_definition: lead?.notas || '',
          setup_fee_eur: setup,
          monthly_fee_eur: p?.monthly_fee_eur != null ? String(p.monthly_fee_eur) : '',
          duration_amount: dur.amount,
          duration_unit: dur.unit,
          fecha_inicio_real: p?.fecha_inicio_real || '',
          fecha_fin_real: p?.fecha_fin_real || '',
        })
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar')
      } finally {
        if (!cancelled) setFetching(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [leadId])

  useEffect(() => {
    if (clientMode !== 'search') return
    if (searchQ.trim().length < 2) {
      setSearchHits([])
      return
    }
    const t = window.setTimeout(() => {
      setSearching(true)
      fetch(`/api/contacts?search=${encodeURIComponent(searchQ.trim())}`)
        .then((r) => r.json())
        .then((d) => setSearchHits(d.contacts || []))
        .catch(() => setSearchHits([]))
        .finally(() => setSearching(false))
    }, 250)
    return () => window.clearTimeout(t)
  }, [searchQ, clientMode])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const pickContact = (c: ContactHit) => {
    setForm((prev) => ({
      ...prev,
      contact_id: c.id,
      contact_nombre: c.nombre || '',
      contact_email: c.email || '',
      contact_empresa: c.empresa || '',
      contact_telefono: c.telefono || '',
      contact_ciudad: c.ciudad || '',
    }))
    setClientMode('current')
    setSearchQ('')
    setSearchHits([])
  }

  const createAndPickContact = async () => {
    if (!newClient.nombre.trim()) {
      setError('El nombre del cliente es obligatorio')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: newClient.nombre.trim(),
          email: newClient.email.trim() || '',
          empresa: newClient.empresa.trim() || undefined,
          telefono: newClient.telefono.trim() || undefined,
          ciudad: newClient.ciudad.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error creando cliente')
      pickContact({
        id: data.id,
        nombre: data.nombre,
        email: data.email,
        empresa: data.empresa,
        telefono: data.telefono,
        ciudad: data.ciudad,
      })
      setNewClient({ nombre: '', email: '', empresa: '', telefono: '', ciudad: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creando cliente')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = Number(leadId)
    if (!Number.isFinite(id) || id <= 0) return
    setLoading(true)
    setError('')
    setOkMsg('')
    try {
      const body: Record<string, unknown> = {
        contact_id: form.contact_id ?? undefined,
        name: form.name.trim() || 'Proyecto',
        project_definition: form.project_definition.trim() || null,
        setup_fee_eur: form.setup_fee_eur ? parseFloat(form.setup_fee_eur) : null,
        monthly_fee_eur: form.monthly_fee_eur ? parseFloat(form.monthly_fee_eur) : null,
        has_mensualidad: Boolean(form.monthly_fee_eur && parseFloat(form.monthly_fee_eur) > 0),
        tiempo_previsto: formatDuration(form.duration_amount, form.duration_unit),
        fecha_inicio_real: form.fecha_inicio_real || null,
        fecha_fin_real: form.fecha_fin_real || null,
      }

      const res = await fetch(`/api/onboarding/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setOkMsg('Datos guardados')
      onSaved?.()
      window.setTimeout(() => setOkMsg(''), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className={className}>
        <p className="py-6 text-center text-sm text-gray-400">Cargando datos…</p>
      </div>
    )
  }

  const clientName = form.contact_nombre || form.contact_email || (form.contact_id ? `#${form.contact_id}` : 'Sin cliente')

  return (
    <form onSubmit={handleSubmit} className={className ? `space-y-6 ${className}` : 'space-y-6'}>
      {/* Cliente — solo lectura + cambiar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Cliente</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setClientMode('search')}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <Search className="h-3.5 w-3.5" />
              Buscar otro
            </button>
            <button
              type="button"
              onClick={() => setClientMode('create')}
              className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Crear nuevo
            </button>
          </div>
        </div>

        {clientMode === 'current' && (
          <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3.5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {clientName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-semibold text-gray-900 truncate">{clientName}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  {form.contact_empresa && (
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-gray-400" />
                      {form.contact_empresa}
                    </span>
                  )}
                  {form.contact_email && (
                    <span className="inline-flex items-center gap-1.5 truncate">
                      <Mail className="h-3 w-3 text-gray-400" />
                      {form.contact_email}
                    </span>
                  )}
                  {form.contact_telefono && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-gray-400" />
                      {form.contact_telefono}
                    </span>
                  )}
                  {form.contact_ciudad && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-gray-400" />
                      {form.contact_ciudad}
                    </span>
                  )}
                  {!form.contact_empresa &&
                    !form.contact_email &&
                    !form.contact_telefono &&
                    !form.contact_ciudad && (
                      <span className="inline-flex items-center gap-1.5 text-gray-400">
                        <User className="h-3 w-3" />
                        Sin más datos
                      </span>
                    )}
                </div>
              </div>
            </div>
          </div>
        )}

        {clientMode === 'search' && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <Input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Buscar por nombre o email…"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setClientMode('current')
                  setSearchQ('')
                  setSearchHits([])
                }}
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {searching && <p className="text-xs text-gray-400 px-1">Buscando…</p>}
            {!searching && searchQ.trim().length >= 2 && searchHits.length === 0 && (
              <p className="text-xs text-gray-500 px-1">Sin resultados</p>
            )}
            <ul className="space-y-1 max-h-40 overflow-y-auto">
              {searchHits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pickContact(c)}
                    className="w-full text-left rounded-lg px-3 py-2 hover:bg-white border border-transparent hover:border-gray-200 transition-colors"
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {c.nombre || c.email || `Cliente #${c.id}`}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {[c.empresa, c.email, c.telefono].filter(Boolean).join(' · ')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {clientMode === 'create' && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800">Nuevo cliente</p>
              <button
                type="button"
                onClick={() => setClientMode('current')}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ['nombre', 'Nombre *'],
                  ['email', 'Email'],
                  ['empresa', 'Empresa'],
                  ['telefono', 'Teléfono'],
                  ['ciudad', 'Ciudad'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Input
                    value={newClient[key]}
                    onChange={(e) => setNewClient((p) => ({ ...p, [key]: e.target.value }))}
                    disabled={loading}
                  />
                </div>
              ))}
            </div>
            <Button
              type="button"
              onClick={() => void createAndPickContact()}
              disabled={loading}
              className="h-9 rounded-lg"
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Usar este cliente
            </Button>
          </div>
        )}
      </div>

      {/* Proyecto */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Proyecto</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nombre del proyecto</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Definición del proyecto</Label>
            <Textarea
              rows={8}
              value={form.project_definition}
              onChange={(e) => set('project_definition', e.target.value)}
              disabled={loading}
              placeholder="Qué se está construyendo, alcance, notas…"
              className="min-h-[180px] resize-y text-sm leading-relaxed"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Precio del proyecto (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.setup_fee_eur}
              onChange={(e) => set('setup_fee_eur', e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mensualidad (€)</Label>
            <Input
              type="number"
              step="0.01"
              value={form.monthly_fee_eur}
              onChange={(e) => set('monthly_fee_eur', e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Duración prevista</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                step="1"
                value={form.duration_amount}
                onChange={(e) => set('duration_amount', e.target.value)}
                disabled={loading}
                placeholder="Ej. 4"
                className="w-28"
              />
              <Select
                value={form.duration_unit}
                onValueChange={(v) => set('duration_unit', v as DurationUnit)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dias">Días</SelectItem>
                  <SelectItem value="semanas">Semanas</SelectItem>
                  <SelectItem value="meses">Meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha inicial real</Label>
            <Input
              type="date"
              value={form.fecha_inicio_real}
              onChange={(e) => set('fecha_inicio_real', e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha final real</Label>
            <Input
              type="date"
              value={form.fecha_fin_real}
              onChange={(e) => set('fecha_fin_real', e.target.value)}
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">{error}</div>
      )}
      {okMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800">
          {okMsg}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={loading || fetching} className="h-10 rounded-xl px-5">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar datos
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
