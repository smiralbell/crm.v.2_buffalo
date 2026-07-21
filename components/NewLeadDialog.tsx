import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { cn } from '@/lib/utils'

export type NewLeadDialogMode = 'lead' | 'contact'

export type NewLeadDialogCreated = {
  mode: NewLeadDialogMode
  contactId: number
  contactName: string
  leadId?: number
}

interface NewLeadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Modo inicial al abrir */
  defaultMode?: NewLeadDialogMode
  /** Si true, no se puede cambiar el modo */
  lockMode?: boolean
  /**
   * Si se pasa, no navega: llama al callback (p. ej. pipelines).
   * Si no, redirige a /leads/:id o /contacts/:id.
   */
  onCreated?: (result: NewLeadDialogCreated) => void
  /** Prefill nombre desde búsqueda de pipeline */
  initialNombre?: string
}

export default function NewLeadDialog({
  open,
  onOpenChange,
  defaultMode = 'lead',
  lockMode = false,
  onCreated,
  initialNombre = '',
}: NewLeadDialogProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<NewLeadDialogMode>(defaultMode)

  const [form, setForm] = useState({
    nombre: '',
    email: '',
    empresa: '',
    telefono: '',
    ciudad: '',
    estado: 'frio',
    valor: '',
    prioridad: 'media',
  })

  const reset = () => {
    setForm({
      nombre: initialNombre || '',
      email: '',
      empresa: '',
      telefono: '',
      ciudad: '',
      estado: 'frio',
      valor: '',
      prioridad: 'media',
    })
    setError('')
    setMode(defaultMode)
  }

  useEffect(() => {
    if (open) {
      setMode(defaultMode)
      setForm((prev) => ({
        ...prev,
        nombre: initialNombre || prev.nombre || '',
      }))
    }
  }, [open, defaultMode, initialNombre])

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    set(e.target.name, e.target.value)

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio')
      return
    }

    setLoading(true)

    try {
      const contactRes = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          email: form.email.trim() || undefined,
          empresa: form.empresa.trim() || undefined,
          telefono: form.telefono.trim() || undefined,
          ciudad: form.ciudad.trim() || undefined,
        }),
      })

      let contactId: number

      if (contactRes.status === 409) {
        const dup = await contactRes.json()
        if (dup.contactId) {
          contactId = dup.contactId
        } else {
          setError('Ya existe un contacto con ese email. Usa uno diferente.')
          setLoading(false)
          return
        }
      } else if (!contactRes.ok) {
        const err = await contactRes.json().catch(() => ({}))
        setError(err.error || 'Error al crear el contacto')
        setLoading(false)
        return
      } else {
        const contact = await contactRes.json()
        contactId = contact.id
      }

      const contactName = form.nombre.trim()

      if (mode === 'contact') {
        setLoading(false)
        handleOpenChange(false)
        if (onCreated) {
          onCreated({ mode: 'contact', contactId, contactName })
        } else {
          router.push(`/contacts/${contactId}`)
        }
        return
      }

      const leadRes = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contactId,
          estado: form.estado,
          valor: form.valor ? parseFloat(form.valor) : undefined,
          prioridad: form.prioridad,
        }),
      })

      if (!leadRes.ok) {
        const err = await leadRes.json().catch(() => ({}))
        if (
          err.error?.includes('Unique') ||
          err.error?.includes('unique') ||
          leadRes.status === 409
        ) {
          setError('Este contacto ya tiene un lead asignado.')
        } else {
          setError(err.error || 'Error al crear el lead')
        }
        setLoading(false)
        return
      }

      const lead = await leadRes.json()
      setLoading(false)
      handleOpenChange(false)
      if (onCreated) {
        onCreated({
          mode: 'lead',
          contactId,
          contactName,
          leadId: lead.id,
        })
      } else {
        router.push(`/leads/${lead.id}`)
      }
    } catch {
      setError('Error de conexión')
      setLoading(false)
    }
  }

  const isContactOnly = mode === 'contact'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isContactOnly ? 'Nuevo contacto' : 'Nuevo lead'}
          </DialogTitle>
          <DialogDescription>
            {isContactOnly
              ? 'Solo se crea el contacto, sin lead comercial.'
              : 'Crea el contacto y su lead en el embudo.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {!lockMode && (
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setMode('lead')}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  mode === 'lead'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Lead
              </button>
              <button
                type="button"
                onClick={() => setMode('contact')}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  mode === 'contact'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Solo contacto
              </button>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-500">Contacto</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label htmlFor="nl-nombre">
                  Nombre <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nl-nombre"
                  name="nombre"
                  value={form.nombre}
                  onChange={handleChange}
                  placeholder="Juan García"
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label htmlFor="nl-email">Email</Label>
                <Input
                  id="nl-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="juan@empresa.com"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-empresa">Empresa</Label>
                <Input
                  id="nl-empresa"
                  name="empresa"
                  value={form.empresa}
                  onChange={handleChange}
                  placeholder="Acme S.L."
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nl-telefono">Teléfono</Label>
                <Input
                  id="nl-telefono"
                  name="telefono"
                  value={form.telefono}
                  onChange={handleChange}
                  placeholder="+34 600 000 000"
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {!isContactOnly && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500">Lead</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={form.estado} onValueChange={(v) => set('estado', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="frio">Frío</SelectItem>
                      <SelectItem value="caliente">Caliente</SelectItem>
                      <SelectItem value="en_proceso">En Proceso</SelectItem>
                      <SelectItem value="cerrado">Cerrado</SelectItem>
                      <SelectItem value="perdido">Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Prioridad</Label>
                  <Select
                    value={form.prioridad}
                    onValueChange={(v) => set('prioridad', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="baja">Baja</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nl-valor">Valor (€)</Label>
                  <Input
                    id="nl-valor"
                    name="valor"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valor}
                    onChange={handleChange}
                    placeholder="0.00"
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => handleOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? 'Creando...'
                : isContactOnly
                  ? 'Crear contacto'
                  : 'Crear lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
