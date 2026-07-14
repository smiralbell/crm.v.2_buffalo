'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ColdCallObjection } from '@/lib/coldcall/objections'
import { AlertCircle, Loader2, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'

type Locale = 'es' | 'ca'

function emptyRow(): ColdCallObjection {
  return { objection: '', response: '' }
}

export default function ComercialObjectionsPanel() {
  const [lang, setLang] = useState<Locale>('es')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [es, setEs] = useState<ColdCallObjection[]>([])
  const [ca, setCa] = useState<ColdCallObjection[]>([])
  const [message, setMessage] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/coldcall/my-objections')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setEs(d.objections?.es || [])
        setCa(d.objections?.ca || [])
        setIsCustom(Boolean(d.is_custom))
      })
      .catch((e) => setMessage(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const current = lang === 'es' ? es : ca
  const setCurrent = lang === 'es' ? setEs : setCa

  const updateRow = (index: number, field: keyof ColdCallObjection, value: string) => {
    setCurrent((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    )
  }

  const addRow = () => setCurrent((rows) => [...rows, emptyRow()])

  const removeRow = (index: number) => {
    setCurrent((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)))
  }

  const save = async () => {
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/coldcall/my-objections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ es, ca }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setEs(data.objections.es)
      setCa(data.objections.ca)
      setIsCustom(true)
      setMessage('Objeciones guardadas.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const resetDefaults = async () => {
    if (!confirm('¿Restaurar las objeciones por defecto? Se perderán tus cambios.')) return
    setSaving(true)
    setMessage('')
    try {
      const res = await fetch('/api/coldcall/my-objections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al restaurar')
      setEs(data.objections.es)
      setCa(data.objections.ca)
      setIsCustom(false)
      setMessage('Restauradas las objeciones por defecto.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al restaurar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-gray-900">Mis objeciones</h1>
        <p className="text-sm text-gray-600">
          Personaliza las respuestas que ves durante las llamadas. Se guardan en tu usuario y
          aparecen en la estación de llamadas junto al guión.
        </p>
        {isCustom && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 inline-block">
            Tienes objeciones personalizadas guardadas.
          </p>
        )}
      </div>

      <div className="flex rounded-xl border border-gray-200 overflow-hidden w-fit">
        {(
          [
            { id: 'es' as const, label: 'Castellano' },
            { id: 'ca' as const, label: 'Català' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setLang(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold transition-colors ${
              lang === t.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {current.map((row, index) => (
            <div
              key={index}
              className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Objeción {index + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-600"
                  onClick={() => removeRow(index)}
                  disabled={current.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">Lo que dice el lead</label>
                <Input
                  value={row.objection}
                  onChange={(e) => updateRow(index, 'objection', e.target.value)}
                  placeholder='Ej: "¿De dónde habéis sacado mis datos?"'
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-gray-500">Tu respuesta</label>
                <Textarea
                  value={row.response}
                  onChange={(e) => updateRow(index, 'response', e.target.value)}
                  rows={4}
                  className="rounded-xl resize-none text-sm"
                />
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" className="rounded-xl gap-2" onClick={addRow}>
            <Plus className="h-4 w-4" />
            Añadir objeción
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <Button type="button" className="rounded-xl gap-2" onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl gap-2"
          onClick={resetDefaults}
          disabled={saving || loading}
        >
          <RotateCcw className="h-4 w-4" />
          Restaurar por defecto
        </Button>
        <Button type="button" variant="ghost" className="rounded-xl" asChild>
          <Link href="/comercial/campanas">Volver a campañas</Link>
        </Button>
      </div>

      {message && (
        <p
          className={`text-sm flex items-center gap-2 ${
            message.includes('Error') ? 'text-red-600' : 'text-emerald-700'
          }`}
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {message}
        </p>
      )}
    </div>
  )
}
