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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  open: boolean
  leadId: number | null
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

type FormState = {
  contact_nombre: string
  contact_email: string
  contact_empresa: string
  contact_telefono: string
  contact_ciudad: string
  lead_estado: string
  lead_valor: string
  lead_notas: string
  name: string
  status: string
  service_type: string
  setup_fee_eur: string
  monthly_fee_eur: string
  has_mensualidad: boolean
  maint_plan: string
  has_voz: boolean
  has_chat: boolean
  has_dash: boolean
  has_pack: boolean
  dashboard_tier: string
  languages_count: string
  retell_agent_id: string
  twilio_number: string
  whatsapp_number: string
  tiempo_previsto: string
  fecha_inicio_real: string
  fecha_fin_real: string
}

const empty = (): FormState => ({
  contact_nombre: '',
  contact_email: '',
  contact_empresa: '',
  contact_telefono: '',
  contact_ciudad: '',
  lead_estado: 'frio',
  lead_valor: '',
  lead_notas: '',
  name: '',
  status: 'development',
  service_type: 'voice_agent',
  setup_fee_eur: '',
  monthly_fee_eur: '',
  has_mensualidad: false,
  maint_plan: '',
  has_voz: false,
  has_chat: false,
  has_dash: false,
  has_pack: false,
  dashboard_tier: '',
  languages_count: '1',
  retell_agent_id: '',
  twilio_number: '',
  whatsapp_number: '',
  tiempo_previsto: '',
  fecha_inicio_real: '',
  fecha_fin_real: '',
})

function Check({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input
        type="checkbox"
        className="rounded border-gray-300"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export default function EditOnboardingProjectDialog({
  open,
  leadId,
  onOpenChange,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(empty)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const [hasProyecto, setHasProyecto] = useState(false)

  useEffect(() => {
    if (!open || !leadId) return
    let cancelled = false
    setFetching(true)
    setError('')
    setForm(empty())

    ;(async () => {
      try {
        const res = await fetch(`/api/onboarding/projects/${leadId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error al cargar')
        if (cancelled) return

        const lead = data.lead
        const p = data.proyecto
        setHasProyecto(Boolean(p))
        setForm({
          contact_nombre: lead?.contact?.nombre || '',
          contact_email: lead?.contact?.email || '',
          contact_empresa: lead?.contact?.empresa || '',
          contact_telefono: lead?.contact?.telefono || '',
          contact_ciudad: lead?.contact?.ciudad || '',
          lead_estado: lead?.estado || 'frio',
          lead_valor: lead?.valor != null ? String(lead.valor) : '',
          lead_notas: lead?.notas || '',
          name: p?.name || lead?.contact?.empresa || lead?.contact?.nombre || '',
          status: p?.status || 'development',
          service_type: p?.service_type || 'voice_agent',
          setup_fee_eur: p?.setup_fee_eur != null ? String(p.setup_fee_eur) : '',
          monthly_fee_eur: p?.monthly_fee_eur != null ? String(p.monthly_fee_eur) : '',
          has_mensualidad: Boolean(p?.has_mensualidad),
          maint_plan: p?.maint_plan || '',
          has_voz: Boolean(p?.has_voz),
          has_chat: Boolean(p?.has_chat),
          has_dash: Boolean(p?.has_dash),
          has_pack: Boolean(p?.has_pack),
          dashboard_tier: p?.dashboard_tier || '',
          languages_count: String(p?.languages_count ?? 1),
          retell_agent_id: p?.retell_agent_id || '',
          twilio_number: p?.twilio_number || '',
          whatsapp_number: p?.whatsapp_number || '',
          tiempo_previsto: p?.tiempo_previsto || '',
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
  }, [open, leadId])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadId) return
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        contact_nombre: form.contact_nombre.trim(),
        contact_email: form.contact_email.trim(),
        contact_empresa: form.contact_empresa.trim(),
        contact_telefono: form.contact_telefono.trim(),
        contact_ciudad: form.contact_ciudad.trim(),
        lead_estado: form.lead_estado,
        lead_valor: form.lead_valor ? parseFloat(form.lead_valor) : null,
        lead_notas: form.lead_notas.trim() || null,
        name: form.name.trim() || 'Proyecto',
        status: form.status,
        service_type: form.service_type,
        setup_fee_eur: form.setup_fee_eur ? parseFloat(form.setup_fee_eur) : null,
        monthly_fee_eur: form.monthly_fee_eur ? parseFloat(form.monthly_fee_eur) : null,
        has_mensualidad: form.has_mensualidad,
        maint_plan: form.maint_plan.trim() || null,
        has_voz: form.has_voz,
        has_chat: form.has_chat,
        has_dash: form.has_dash,
        has_pack: form.has_pack,
        dashboard_tier: form.dashboard_tier.trim() || null,
        languages_count: parseInt(form.languages_count, 10) || 1,
        retell_agent_id: form.retell_agent_id.trim() || null,
        twilio_number: form.twilio_number.trim() || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        tiempo_previsto: form.tiempo_previsto.trim() || null,
        fecha_inicio_real: form.fecha_inicio_real || null,
        fecha_fin_real: form.fecha_fin_real || null,
      }

      const res = await fetch(`/api/onboarding/projects/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar datos del proyecto</DialogTitle>
          <DialogDescription>
            Cambia manualmente cualquier dato del cliente, lead y proyecto Buffalo.
            {!hasProyecto && !fetching && (
              <span className="block mt-1 text-amber-700">
                Aún no hay fila en proyectos: al guardar se creará/sincronizará si hay configuración.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500">Cliente</p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['contact_nombre', 'Nombre'],
                    ['contact_email', 'Email'],
                    ['contact_empresa', 'Empresa'],
                    ['contact_telefono', 'Teléfono'],
                    ['contact_ciudad', 'Ciudad'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1.5">
                    <Label>{label}</Label>
                    <Input
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      disabled={loading}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500">Lead</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={form.lead_estado} onValueChange={(v) => set('lead_estado', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="frio">Frío</SelectItem>
                      <SelectItem value="caliente">Caliente</SelectItem>
                      <SelectItem value="reunion">Reunión</SelectItem>
                      <SelectItem value="propuesta">Propuesta</SelectItem>
                      <SelectItem value="negociando">Negociando</SelectItem>
                      <SelectItem value="cerrado">Cerrado</SelectItem>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="perdido">Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Valor (€)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.lead_valor}
                    onChange={(e) => set('lead_valor', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Notas</Label>
                  <Textarea
                    rows={2}
                    value={form.lead_notas}
                    onChange={(e) => set('lead_notas', e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500">Proyecto Buffalo</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Nombre proyecto</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Tiempo previsto</Label>
                  <Input
                    value={form.tiempo_previsto}
                    onChange={(e) => set('tiempo_previsto', e.target.value)}
                    placeholder="Ej. 4 semanas, 2 meses…"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha real de inicio</Label>
                  <Input
                    type="date"
                    value={form.fecha_inicio_real}
                    onChange={(e) => set('fecha_inicio_real', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha real de finalización</Label>
                  <Input
                    type="date"
                    value={form.fecha_fin_real}
                    onChange={(e) => set('fecha_fin_real', e.target.value)}
                    disabled={loading}
                  />
                  <p className="text-[11px] text-gray-400">
                    Déjalo vacío si aún no ha acabado.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => set('status', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="churned">Churned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo servicio</Label>
                  <Select value={form.service_type} onValueChange={(v) => set('service_type', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="voice_agent">Voice agent</SelectItem>
                      <SelectItem value="text_agent">Text agent</SelectItem>
                      <SelectItem value="dashboard_app">Dashboard</SelectItem>
                      <SelectItem value="automation">Automation</SelectItem>
                      <SelectItem value="lead_gen">Lead gen</SelectItem>
                      <SelectItem value="geo_seo">Geo SEO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Setup (€)</Label>
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
                <div className="space-y-1.5">
                  <Label>Plan mantenimiento</Label>
                  <Input
                    value={form.maint_plan}
                    onChange={(e) => set('maint_plan', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Idiomas</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.languages_count}
                    onChange={(e) => set('languages_count', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dashboard tier</Label>
                  <Input
                    value={form.dashboard_tier}
                    onChange={(e) => set('dashboard_tier', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Retell agent</Label>
                  <Input
                    value={form.retell_agent_id}
                    onChange={(e) => set('retell_agent_id', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Twilio</Label>
                  <Input
                    value={form.twilio_number}
                    onChange={(e) => set('twilio_number', e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>WhatsApp</Label>
                  <Input
                    value={form.whatsapp_number}
                    onChange={(e) => set('whatsapp_number', e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 pt-1">
                <Check
                  label="Mensualidad"
                  checked={form.has_mensualidad}
                  onChange={(v) => set('has_mensualidad', v)}
                  disabled={loading}
                />
                <Check label="Voz" checked={form.has_voz} onChange={(v) => set('has_voz', v)} disabled={loading} />
                <Check label="Chat" checked={form.has_chat} onChange={(v) => set('has_chat', v)} disabled={loading} />
                <Check label="Dash" checked={form.has_dash} onChange={(v) => set('has_dash', v)} disabled={loading} />
                <Check label="Pack" checked={form.has_pack} onChange={(v) => set('has_pack', v)} disabled={loading} />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || fetching}>
                {loading ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
