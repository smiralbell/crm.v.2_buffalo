import { useCallback, useEffect, useRef, useState } from 'react'
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
import RetellVariableChips, { insertTextAtSelection } from '@/components/demos/RetellVariableChips'
import type {
  DemoDireccion,
  DemoEstado,
  DemoListItem,
  DemoTipo,
  PhoneConflict,
} from '@/lib/demos/types'

type RetellVoice = {
  voice_id: string
  voice_name?: string
  provider?: string
  gender?: string
  accent?: string
}

export interface DemoFormValues {
  nombre_cliente: string
  prompt: string
  base_conocimiento: string
  frase_inicial: string
  estado: DemoEstado
  numeros: string[]
  tipo: DemoTipo
  voz_id: string
  direccion: DemoDireccion
  es_principal: boolean
}

interface DemoFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  demo?: DemoListItem | null
  allDemos?: DemoListItem[]
  onSubmit: (values: DemoFormValues) => Promise<void>
  saving?: boolean
}

const emptyForm: DemoFormValues = {
  nombre_cliente: '',
  prompt: '',
  base_conocimiento: '',
  frase_inicial: '',
  estado: 'activa',
  numeros: [''],
  tipo: 'whatsapp',
  voz_id: '',
  direccion: 'inbound',
  es_principal: false,
}

const direccionLabel: Record<DemoDireccion, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
  ambos: 'Ambos',
}

function numerosLabel(tipo: DemoTipo, direccion: DemoDireccion): string {
  if (tipo !== 'voz') return 'Números autorizados'
  if (direccion === 'outbound') return 'Número del cliente a llamar'
  if (direccion === 'inbound') return 'Números autorizados a llamar'
  return 'Números (inbound y outbound)'
}

export default function DemoFormDialog({
  open,
  onOpenChange,
  demo,
  allDemos = [],
  onSubmit,
  saving = false,
}: DemoFormDialogProps) {
  const [form, setForm] = useState<DemoFormValues>(emptyForm)
  const [error, setError] = useState('')
  const [phoneConflicts, setPhoneConflicts] = useState<Record<number, PhoneConflict | null>>({})
  const [checkingPhone, setCheckingPhone] = useState<number | null>(null)
  const [voices, setVoices] = useState<RetellVoice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [voicesError, setVoicesError] = useState('')
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const fraseRef = useRef<HTMLTextAreaElement>(null)
  const [promptSel, setPromptSel] = useState({ start: 0, end: 0 })
  const [fraseSel, setFraseSel] = useState({ start: 0, end: 0 })

  const exceptDemoId = demo?.id
  const isEdit = Boolean(demo)
  const isVoz = form.tipo === 'voz'
  const otherPrincipal = allDemos.find(
    (d) => d.es_principal && d.tipo === form.tipo && d.id !== exceptDemoId
  )

  useEffect(() => {
    if (!open) return
    setError('')
    setPhoneConflicts({})
    if (demo) {
      setForm({
        nombre_cliente: demo.nombre_cliente,
        prompt: demo.prompt,
        base_conocimiento: demo.base_conocimiento,
        frase_inicial: demo.frase_inicial ?? '',
        estado: demo.estado,
        numeros: demo.numeros.length > 0 ? demo.numeros : [''],
        tipo: demo.tipo,
        voz_id: demo.voz_id || '',
        direccion: demo.direccion || 'inbound',
        es_principal: demo.es_principal ?? false,
      })
    } else {
      setForm(emptyForm)
    }
  }, [open, demo])

  useEffect(() => {
    if (!open || form.tipo !== 'voz') return
    let cancelled = false
    setVoicesLoading(true)
    setVoicesError('')
    fetch('/api/demos/retell-voices')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Error al cargar voces')
        if (!cancelled) setVoices(data.voices || [])
      })
      .catch((e) => {
        if (!cancelled) {
          setVoicesError(e instanceof Error ? e.message : 'Error al cargar voces')
          setVoices([])
        }
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, form.tipo])

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
            tipo: form.tipo,
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
    [exceptDemoId, form.tipo]
  )

  const insertIntoField = useCallback(
    (field: 'prompt' | 'frase_inicial', token: string) => {
      const ref = field === 'prompt' ? promptRef : fraseRef
      const sel = field === 'prompt' ? promptSel : fraseSel
      setForm((prev) => {
        const current = field === 'prompt' ? prev.prompt : prev.frase_inicial
        const { value, cursor } = insertTextAtSelection(current, sel.start, sel.end, token)
        queueMicrotask(() => {
          const el = ref.current
          if (el) {
            el.focus()
            el.setSelectionRange(cursor, cursor)
          }
        })
        return field === 'prompt' ? { ...prev, prompt: value } : { ...prev, frase_inicial: value }
      })
    },
    [fraseSel, promptSel]
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
    if (isVoz && !form.voz_id.trim()) {
      setError('Selecciona una voz de Retell')
      return
    }

    if (isVoz && form.es_principal && form.direccion === 'outbound') {
      setError('La demo principal de voz debe ser inbound o ambos')
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
            {isVoz
              ? 'Configura un agente de voz con Retell AI para el cliente.'
              : 'Configura el agente de WhatsApp para el cliente. Cada número solo puede estar en una demo a la vez.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de demo</Label>
            {isEdit ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {form.tipo === 'voz' ? 'Voz (Retell AI)' : 'WhatsApp'}
              </div>
            ) : (
              <Select
                value={form.tipo}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, tipo: v as DemoTipo }))
                }
              >
                <SelectTrigger className="rounded-xl border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="voz">Voz (Retell AI)</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

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

          {isVoz && (
            <>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <Select
                  value={form.direccion}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, direccion: v as DemoDireccion }))
                  }
                >
                  <SelectTrigger className="rounded-xl border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="outbound">Outbound</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Voz (Retell)</Label>
                {voicesLoading ? (
                  <p className="text-sm text-gray-500">Cargando voces de Retell…</p>
                ) : voicesError ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {voicesError}
                  </p>
                ) : (
                  <Select
                    value={form.voz_id || undefined}
                    onValueChange={(v) => setForm((p) => ({ ...p, voz_id: v }))}
                  >
                    <SelectTrigger className="rounded-xl border-gray-200">
                      <SelectValue placeholder="Selecciona una voz…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {voices.map((v) => (
                        <SelectItem key={v.voice_id} value={v.voice_id}>
                          {v.voice_name || v.voice_id}
                          {v.provider ? ` · ${v.provider}` : ''}
                          {v.accent ? ` · ${v.accent}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {form.voz_id && (
                  <p className="font-mono text-xs text-gray-400">{form.voz_id}</p>
                )}
              </div>
            </>
          )}

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
            {!isVoz && (
              <p className="text-xs text-gray-500">
                El agente recibe todo este texto en cada mensaje (contexto completo, no búsqueda
                vectorial).
              </p>
            )}
          </div>

          {isVoz && (
            <div className="space-y-2">
              <Label htmlFor="frase_inicial">Frase inicial del agente</Label>
              <Textarea
                ref={fraseRef}
                id="frase_inicial"
                value={form.frase_inicial}
                onChange={(e) => setForm((p) => ({ ...p, frase_inicial: e.target.value }))}
                onSelect={(e) => {
                  const t = e.currentTarget
                  setFraseSel({ start: t.selectionStart, end: t.selectionEnd })
                }}
                onFocus={(e) => {
                  const t = e.currentTarget
                  setFraseSel({ start: t.selectionStart, end: t.selectionEnd })
                }}
                placeholder="Hola {{nombre}}, te llamo de…"
                rows={2}
                className="min-h-[72px] rounded-xl border-gray-200"
              />
              <RetellVariableChips onInsert={(token) => insertIntoField('frase_inicial', token)} />
              <p className="text-xs text-gray-500">
                Primera frase que dice el agente al descolgar (begin_message de Retell). Puedes usar
                variables del formulario.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt de instrucciones</Label>
            <Textarea
              ref={promptRef}
              id="prompt"
              value={form.prompt}
              onChange={(e) => setForm((p) => ({ ...p, prompt: e.target.value }))}
              onSelect={(e) => {
                const t = e.currentTarget
                setPromptSel({ start: t.selectionStart, end: t.selectionEnd })
              }}
              onFocus={(e) => {
                const t = e.currentTarget
                setPromptSel({ start: t.selectionStart, end: t.selectionEnd })
              }}
              placeholder="Instrucciones de comportamiento del agente…"
              rows={6}
              className="min-h-[120px] rounded-xl border-gray-200"
            />
            {isVoz && (
              <RetellVariableChips onInsert={(token) => insertIntoField('prompt', token)} />
            )}
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/80 p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.es_principal}
                onChange={(e) => {
                  const checked = e.target.checked
                  setForm((p) => ({
                    ...p,
                    es_principal: checked,
                    ...(checked && p.tipo === 'voz' && p.direccion === 'outbound'
                      ? { direccion: 'inbound' as DemoDireccion }
                      : {}),
                  }))
                }}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  Agente principal Buffalo
                </span>
                <span className="block text-xs text-gray-600 mt-1">
                  {isVoz
                    ? 'Si alguien llama desde el widget web con un número que no está en ninguna demo de cliente, se enruta a este agente de voz.'
                    : 'Si alguien escribe por WhatsApp desde el widget web con un número que no está en ninguna demo de cliente, responde este agente de Buffalo (no la demo de un cliente).'}
                </span>
              </span>
            </label>
            {form.es_principal && (
              <p className="text-xs text-blue-800">
                Solo puede haber <strong>una</strong> demo principal de{' '}
                {isVoz ? 'voz' : 'WhatsApp'} en todo el sistema. Los números autorizados son
                opcionales: sin ellos, actúa como captura global de desconocidos.
                {otherPrincipal && (
                  <>
                    {' '}
                    Al guardar, se sustituirá la principal actual:{' '}
                    <strong>{otherPrincipal.nombre_cliente}</strong>.
                  </>
                )}
              </p>
            )}
          </div>

          {!form.es_principal && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{numerosLabel(form.tipo, form.direccion)}</Label>
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
                        Ya está en la demo <strong>{conflict.nombre_cliente}</strong>
                        {conflict.demo_tipo ? ` (${conflict.demo_tipo === 'voz' ? 'voz' : 'WhatsApp'})` : ''}.
                        Al guardar podrás moverlo a esta demo.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-500">Formato internacional, ej. +34612345678</p>
          </div>
          )}

          {form.es_principal && (
            <div className="space-y-2">
              <Label>Números de prueba (opcional)</Label>
              <p className="text-xs text-gray-500">
                Puedes añadir números concretos para pruebas internas. Los desconocidos del widget
                también llegarán aquí.
              </p>
              <div className="space-y-2">
                {form.numeros.map((num, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={num}
                      onChange={(e) => updateNumero(i, e.target.value)}
                      placeholder="+34612345678"
                      className="rounded-xl border-gray-200 font-mono text-sm"
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
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addNumero} className="rounded-lg">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Añadir número de prueba
              </Button>
            </div>
          )}

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
