import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, Plus, X } from 'lucide-react'
import type { DemoEstado, DemoListItem, PhoneConflict } from '@/lib/demos/types'

export interface DemoFormValues {
  nombre_cliente: string
  prompt: string
  base_conocimiento: string
  estado: DemoEstado
  numeros: string[]
}

interface DemoFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  demo?: DemoListItem | null
  onSubmit: (values: DemoFormValues) => Promise<void>
  saving?: boolean
}

const emptyForm: DemoFormValues = {
  nombre_cliente: '',
  prompt: '',
  base_conocimiento: '',
  estado: 'activa',
  numeros: [''],
}

export default function DemoFormDialog({
  open,
  onOpenChange,
  demo,
  onSubmit,
  saving = false,
}: DemoFormDialogProps) {
  const [form, setForm] = useState<DemoFormValues>(emptyForm)
  const [error, setError] = useState('')
  const [phoneConflicts, setPhoneConflicts] = useState<Record<number, PhoneConflict | null>>({})
  const [checkingPhone, setCheckingPhone] = useState<number | null>(null)

  const exceptDemoId = demo?.id

  useEffect(() => {
    if (!open) return
    setError('')
    setPhoneConflicts({})
    if (demo) {
      setForm({
        nombre_cliente: demo.nombre_cliente,
        prompt: demo.prompt,
        base_conocimiento: demo.base_conocimiento,
        estado: demo.estado,
        numeros: demo.numeros.length > 0 ? demo.numeros : [''],
      })
    } else {
      setForm(emptyForm)
    }
  }, [open, demo])

  const checkPhoneConflict = useCallback(
    async (index: number, rawValue: string) => {
      const trimmed = rawValue.trim()
      if (!trimmed) {
        setPhoneConflicts((prev) => ({ ...prev, [index]: null }))
        return
      }

      setCheckingPhone(index)
      try {
        const res = await fetch('/api/demos/check-phones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numeros: [trimmed],
            except_demo_id: exceptDemoId,
          }),
        })
        const data = await res.json()
        const conflict = (data.conflicts as PhoneConflict[] | undefined)?.[0] ?? null
        setPhoneConflicts((prev) => ({ ...prev, [index]: conflict }))
      } catch {
        setPhoneConflicts((prev) => ({ ...prev, [index]: null }))
      } finally {
        setCheckingPhone(null)
      }
    },
    [exceptDemoId]
  )

  const updateNumero = (index: number, value: string) => {
    setPhoneConflicts((prev) => ({ ...prev, [index]: null }))
    setForm((prev) => {
      const numeros = [...prev.numeros]
      numeros[index] = value
      return { ...prev, numeros }
    })
  }

  const addNumero = () => {
    setForm((prev) => ({ ...prev, numeros: [...prev.numeros, ''] }))
  }

  const removeNumero = (index: number) => {
    setForm((prev) => ({
      ...prev,
      numeros: prev.numeros.filter((_, i) => i !== index),
    }))
    setPhoneConflicts((prev) => {
      const next: Record<number, PhoneConflict | null> = {}
      for (const [k, v] of Object.entries(prev)) {
        const i = Number(k)
        if (i < index) next[i] = v
        else if (i > index) next[i - 1] = v
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.nombre_cliente.trim()) {
      setError('El nombre del cliente es obligatorio')
      return
    }
    if (!form.prompt.trim()) {
      setError('El prompt de instrucciones es obligatorio')
      return
    }

    const numeros = form.numeros.map((n) => n.trim()).filter(Boolean)
    try {
      await onSubmit({ ...form, numeros })
      onOpenChange(false)
    } catch (err) {
      if (err instanceof Error && err.message === 'PHONE_CONFLICT') {
        return
      }
      setError(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{demo ? 'Editar demo' : 'Nueva demo'}</DialogTitle>
          <DialogDescription>
            Configura el agente de WhatsApp para el cliente. Cada número solo puede estar en una
            demo a la vez.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nombre_cliente">Nombre del cliente</Label>
            <Input
              id="nombre_cliente"
              value={form.nombre_cliente}
              onChange={(e) => setForm((p) => ({ ...p, nombre_cliente: e.target.value }))}
              placeholder="Ej. Acme Corp"
              className="rounded-xl border-gray-200"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="base_conocimiento">Base de conocimiento</Label>
            <Textarea
              id="base_conocimiento"
              value={form.base_conocimiento}
              onChange={(e) => setForm((p) => ({ ...p, base_conocimiento: e.target.value }))}
              placeholder="Pega aquí el texto scrapeado de la web del cliente…"
              rows={8}
              className="min-h-[160px] rounded-xl border-gray-200 font-mono text-sm"
            />
            <p className="text-xs text-gray-500">
              El agente recibe todo este texto en cada mensaje (contexto completo, no búsqueda
              vectorial).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt de instrucciones</Label>
            <Textarea
              id="prompt"
              value={form.prompt}
              onChange={(e) => setForm((p) => ({ ...p, prompt: e.target.value }))}
              placeholder="Instrucciones de comportamiento del agente…"
              rows={6}
              className="min-h-[120px] rounded-xl border-gray-200"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Números autorizados</Label>
              <Button type="button" variant="outline" size="sm" onClick={addNumero} className="rounded-lg">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Añadir
              </Button>
            </div>
            <div className="space-y-2">
              {form.numeros.map((num, i) => {
                const conflict = phoneConflicts[i]
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex gap-2">
                      <Input
                        value={num}
                        onChange={(e) => updateNumero(i, e.target.value)}
                        onBlur={(e) => checkPhoneConflict(i, e.target.value)}
                        placeholder="+34612345678"
                        className={`rounded-xl border-gray-200 font-mono text-sm ${
                          conflict ? 'border-amber-400 bg-amber-50/50' : ''
                        }`}
                      />
                      {form.numeros.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeNumero(i)}
                          className="shrink-0 text-gray-400 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {checkingPhone === i && (
                      <p className="text-xs text-gray-400">Comprobando…</p>
                    )}
                    {conflict && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        Ya está en la demo <strong>{conflict.nombre_cliente}</strong>. Al guardar
                        podrás moverlo a esta demo.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-500">Formato internacional, ej. +34612345678</p>
          </div>

          <div className="space-y-2">
            <Label>Estado</Label>
            <Select
              value={form.estado}
              onValueChange={(v) => setForm((p) => ({ ...p, estado: v as DemoEstado }))}
            >
              <SelectTrigger className="rounded-xl border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activa">Activa</SelectItem>
                <SelectItem value="pausada">Pausada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="rounded-xl">
              {saving ? 'Guardando…' : demo ? 'Guardar cambios' : 'Crear demo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
