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

type EditLeadDialogProps = {
  open: boolean
  leadId: number | null
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

type FormState = {
  contactId: number | null
  nombre: string
  email: string
  empresa: string
  telefono: string
  ciudad: string
  direccion_fiscal: string
  codigo_postal: string
  pais: string
  cif: string
  dni: string
  iban: string
  estado: string
  prioridad: string
  valor: string
  origen_principal: string
  score: string
  notas: string
}

const emptyForm = (): FormState => ({
  contactId: null,
  nombre: '',
  email: '',
  empresa: '',
  telefono: '',
  ciudad: '',
  direccion_fiscal: '',
  codigo_postal: '',
  pais: '',
  cif: '',
  dni: '',
  iban: '',
  estado: 'frio',
  prioridad: 'media',
  valor: '',
  origen_principal: '',
  score: '',
  notas: '',
})

export default function EditLeadDialog({
  open,
  leadId,
  onOpenChange,
  onSaved,
}: EditLeadDialogProps) {
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)

  useEffect(() => {
    if (!open || !leadId) return
    let cancelled = false
    setFetching(true)
    setError('')
    setForm(emptyForm())

    ;(async () => {
      try {
        const res = await fetch(`/api/leads/${leadId}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'No se pudo cargar el lead')
        if (cancelled) return

        const c = data.contact || {}
        setForm({
          contactId: c.id ?? data.contact_id ?? null,
          nombre: c.nombre || '',
          email: c.email || '',
          empresa: c.empresa || '',
          telefono: c.telefono || '',
          ciudad: c.ciudad || '',
          direccion_fiscal: c.direccion_fiscal || '',
          codigo_postal: c.codigo_postal || '',
          pais: c.pais || '',
          cif: c.cif || '',
          dni: c.dni || '',
          iban: c.iban || '',
          estado: data.estado || 'frio',
          prioridad: data.prioridad || 'media',
          valor: data.valor != null ? String(data.valor) : '',
          origen_principal: data.origen_principal || '',
          score: data.score != null ? String(data.score) : '',
          notas: data.notas || '',
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

  const set = (field: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => set(e.target.name as keyof FormState, e.target.value)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadId) return
    setError('')

    if (!form.nombre.trim()) {
      setError('El nombre es obligatorio')
      return
    }

    setLoading(true)
    try {
      if (form.contactId) {
        const contactRes = await fetch(`/api/contacts/${form.contactId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: form.nombre.trim(),
            email: form.email.trim() || '',
            empresa: form.empresa.trim() || undefined,
            telefono: form.telefono.trim() || undefined,
            ciudad: form.ciudad.trim() || undefined,
            direccion_fiscal: form.direccion_fiscal.trim() || undefined,
            codigo_postal: form.codigo_postal.trim() || undefined,
            pais: form.pais.trim() || undefined,
            cif: form.cif.trim() || undefined,
            dni: form.dni.trim() || undefined,
            iban: form.iban.trim() || undefined,
          }),
        })
        if (!contactRes.ok) {
          const err = await contactRes.json().catch(() => ({}))
          throw new Error(err.error || 'Error al actualizar el contacto')
        }
      }

      const leadRes = await fetch(`/api/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          estado: form.estado,
          prioridad: form.prioridad || null,
          valor: form.valor ? parseFloat(form.valor) : null,
          origen_principal: form.origen_principal.trim() || null,
          score: form.score ? parseInt(form.score, 10) : null,
          notas: form.notas.trim() || null,
        }),
      })
      if (!leadRes.ok) {
        const err = await leadRes.json().catch(() => ({}))
        throw new Error(err.error || 'Error al actualizar el lead')
      }

      onOpenChange(false)
      onSaved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar lead</DialogTitle>
          <DialogDescription>
            Puedes modificar cualquier dato del contacto y del lead.
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500">Contacto</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label htmlFor="el-nombre">
                    Nombre <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="el-nombre"
                    name="nombre"
                    value={form.nombre}
                    onChange={handleChange}
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <Label htmlFor="el-email">Email</Label>
                  <Input
                    id="el-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-empresa">Empresa</Label>
                  <Input
                    id="el-empresa"
                    name="empresa"
                    value={form.empresa}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-telefono">Teléfono</Label>
                  <Input
                    id="el-telefono"
                    name="telefono"
                    value={form.telefono}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-ciudad">Ciudad</Label>
                  <Input
                    id="el-ciudad"
                    name="ciudad"
                    value={form.ciudad}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-cp">Código postal</Label>
                  <Input
                    id="el-cp"
                    name="codigo_postal"
                    value={form.codigo_postal}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="el-dir">Dirección fiscal</Label>
                  <Input
                    id="el-dir"
                    name="direccion_fiscal"
                    value={form.direccion_fiscal}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-pais">País</Label>
                  <Input
                    id="el-pais"
                    name="pais"
                    value={form.pais}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-cif">CIF</Label>
                  <Input
                    id="el-cif"
                    name="cif"
                    value={form.cif}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-dni">DNI</Label>
                  <Input
                    id="el-dni"
                    name="dni"
                    value={form.dni}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-iban">IBAN</Label>
                  <Input
                    id="el-iban"
                    name="iban"
                    value={form.iban}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500">Lead</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select value={form.estado} onValueChange={(v) => set('estado', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="frio">Frío</SelectItem>
                      <SelectItem value="caliente">Caliente</SelectItem>
                      <SelectItem value="reunion">Reunión</SelectItem>
                      <SelectItem value="propuesta">Propuesta</SelectItem>
                      <SelectItem value="negociando">Negociando</SelectItem>
                      <SelectItem value="en_proceso">En Proceso</SelectItem>
                      <SelectItem value="cerrado">Cerrado</SelectItem>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="perdido">Perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Prioridad</Label>
                  <Select
                    value={form.prioridad || 'media'}
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
                  <Label htmlFor="el-valor">Valor (€)</Label>
                  <Input
                    id="el-valor"
                    name="valor"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.valor}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-origen">Origen</Label>
                  <Input
                    id="el-origen"
                    name="origen_principal"
                    value={form.origen_principal}
                    onChange={handleChange}
                    disabled={loading}
                    placeholder="web, coldcall…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="el-score">Score</Label>
                  <Input
                    id="el-score"
                    name="score"
                    type="number"
                    min="0"
                    max="100"
                    value={form.score}
                    onChange={handleChange}
                    disabled={loading}
                  />
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-3">
                  <Label htmlFor="el-notas">Notas</Label>
                  <Textarea
                    id="el-notas"
                    name="notas"
                    value={form.notas}
                    onChange={handleChange}
                    disabled={loading}
                    rows={3}
                  />
                </div>
              </div>
            </div>

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
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || fetching || !form.contactId}>
                {loading ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
